import crypto from "crypto";

const secret = process.env.WEBHOOK_SECRET || "testsecret";
const url = process.env.URL || "http://localhost:8000/webhook";

async function send(body: object) {
  const raw = JSON.stringify(body);
  const h = crypto.createHmac("sha256", secret).update(raw).digest("hex");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": h,
    },
    body: raw,
  });

  const text = await res.text();
  console.log(`POST ${res.status} ${res.statusText} -> ${text}`);
}

async function get(path: string) {
  const res = await fetch(`http://localhost:8000${path}`);
  const text = await res.text();
  console.log(`GET ${path} -> ${res.status}\n${text}`);
}

async function main() {
  const isoNoMs = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const message = {
    message_id: "m-smoke-1",
    from: "+10000000001",
    to: "+10000000002",
    ts: isoNoMs,
    text: "smoke test",
  };

  console.log("Sending first webhook (should create)");
  await send(message);

  console.log("Sending duplicate webhook (should be idempotent)");
  await send(message);

  await get("/messages?limit=10&offset=0");
  await get("/stats");
  await get("/metrics");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
