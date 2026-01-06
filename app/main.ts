import express from "express";
import { loadConfig } from "./config.ts";
import { logRequest, logJSON } from "./logging_utils.ts";
import {
  recordHttpRequest,
  recordLatency,
  recordWebhookResult,
  renderMetrics,
} from "./metrics.ts";
import { webhookMessageSchema } from "./models.ts";
import { isValidSignature } from "./security.ts";
import { getStats, initDb, insertMessage, listMessages, pingDb } from "./storage.ts";

const config = loadConfig();
initDb(config.databaseUrl);

type MessagesQuery = {
  limit: number;
  offset: number;
  from?: string;
  since?: string;
  q?: string;
};

const app = express();

app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const requestId = crypto.randomUUID();
  const start = performance.now();
  const path = "/webhook";
  let status = 200;
  let result = "created";
  let dup = false;
  let messageId: string | undefined;

  const finalize = () => {
    const latency = performance.now() - start;
    recordHttpRequest(path, status);
    recordLatency(latency);
    logRequest(
      config.logLevel,
      {
        request_id: requestId,
        method: req.method,
        path,
        status,
        latency_ms: Math.round(latency),
      },
      { message_id: messageId, dup, result }
    );
  };

  try {
    if (!config.webhookSecret) {
      status = 503;
      result = "secret_missing";
      res.status(status).json({ detail: "service not ready" });
      return;
    }

    const signature = req.header("x-signature");
    const rawBodyBuf = (req.body as Buffer | undefined) ?? Buffer.from("");
    const rawBody = rawBodyBuf.toString("utf8");

    if (!isValidSignature(signature ?? null, config.webhookSecret, rawBody)) {
      status = 401;
      result = "invalid_signature";
      res.status(status).json({ detail: "invalid signature" });
      return;
    }

    let bodyJson: unknown;
    try {
      bodyJson = JSON.parse(rawBody);
    } catch {
      status = 422;
      result = "validation_error";
      res.status(status).json({ detail: "invalid json" });
      return;
    }

    const parsed = webhookMessageSchema.safeParse(bodyJson);
    if (!parsed.success) {
      status = 422;
      result = "validation_error";
      res.status(status).json(parsed.error.format());
      return;
    }

    const msg = parsed.data;
    messageId = msg.message_id;
    const { dup: isDuplicate } = insertMessage(msg);
    dup = isDuplicate;
    result = isDuplicate ? "duplicate" : "created";
    recordWebhookResult(result);
    res.status(200).json({ status: "ok" });
  } catch (err) {
    status = 500;
    result = "error";
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(status).json({ detail: message });
  } finally {
    finalize();
  }
});

app.use(express.json());

app.get("/health/live", (_req, res) => {
  res.json({ status: "live" });
});

app.get("/health/ready", (_req, res) => {
  const healthyDb = pingDb();
  const hasSecret = Boolean(config.webhookSecret);
  const ready = healthyDb && hasSecret;
  if (!ready) {
    return res.status(503).json({ status: "not-ready", db: healthyDb, secret: hasSecret });
  }
  return res.json({ status: "ready" });
});

function parseMessagesQuery(url: URL): { ok: boolean; value?: MessagesQuery; error?: any } {
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");
  const from = url.searchParams.get("from") ?? undefined;
  const since = url.searchParams.get("since") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;

  const limitNum = limit ? Number(limit) : 50;
  const offsetNum = offset ? Number(offset) : 0;

  if (
    Number.isNaN(limitNum) ||
    limitNum < 1 ||
    limitNum > 100 ||
    Number.isNaN(offsetNum) ||
    offsetNum < 0
  ) {
    return {
      ok: false,
      error: { status: 422, body: { detail: "limit must be 1-100 and offset must be >=0" } },
    };
  }

  if (since && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(since)) {
    return { ok: false, error: { status: 422, body: { detail: "invalid since" } } };
  }

  return {
    ok: true,
    value: { limit: limitNum, offset: offsetNum, from, since, q },
  };
}

app.get("/messages", (req, res) => {
  const requestId = crypto.randomUUID();
  const start = performance.now();
  const path = "/messages";
  let status = 200;

  const finalize = () => {
    const latency = performance.now() - start;
    recordHttpRequest(path, status);
    recordLatency(latency);
    logRequest(config.logLevel, {
      request_id: requestId,
      method: req.method,
      path,
      status,
      latency_ms: Math.round(latency),
    });
  };

  try {
    const parsed = parseMessagesQuery(new URL(req.originalUrl, `http://${req.headers.host}`));
    if (!parsed.ok) {
      status = parsed.error.status;
      res.status(status).json(parsed.error.body);
      return;
    }

    const { data, total } = listMessages(parsed.value!);
    res.json({ data, total, limit: parsed.value!.limit, offset: parsed.value!.offset });
  } catch (err) {
    status = 500;
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("/messages handler error", err);
    res.status(status).json({ detail: message });
  } finally {
    finalize();
  }
});

app.get("/stats", (req, res) => {
  const requestId = crypto.randomUUID();
  const start = performance.now();
  const path = "/stats";
  let status = 200;

  const finalize = () => {
    const latency = performance.now() - start;
    recordHttpRequest(path, status);
    recordLatency(latency);
    logRequest(config.logLevel, {
      request_id: requestId,
      method: req.method,
      path,
      status,
      latency_ms: Math.round(latency),
    });
  };

  try {
    const stats = getStats();
    res.json(stats);
  } catch (err) {
    status = 500;
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("/stats handler error", err);
    res.status(status).json({ detail: message });
  } finally {
    finalize();
  }
});

app.get("/metrics", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(renderMetrics());
});

app.use((req, res) => {
  const requestId = crypto.randomUUID();
  const start = performance.now();
  const status = 404;
  const path = req.path;
  res.status(status).json({ detail: "Not found" });
  const latency = performance.now() - start;
  recordHttpRequest(path, status);
  recordLatency(latency);
  logRequest(config.logLevel, {
    request_id: requestId,
    method: req.method,
    path,
    status,
    latency_ms: Math.round(latency),
  });
});

export function startServer(): void {
  const port = 8000;
  app.listen(port, () => {
    logJSON("INFO", { event: "server_started", port, framework: "express" }, config.logLevel);
  });
}

if (import.meta.main) {
  startServer();
}

