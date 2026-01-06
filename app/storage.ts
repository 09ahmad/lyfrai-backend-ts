import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import type { StoredMessage, WebhookMessage } from "./models.ts";

let db: Database | null = null;

function sqlitePathFromUrl(url: string): string {
  if (!url) return ":memory:";

  // If the URL explicitly references memory, return in-memory marker
  if (/:(?:memory|mem)$/i.test(url) || /::memory/.test(url) || /:memory:/.test(url)) {
    return ":memory:";
  }

  if (url.startsWith("sqlite:")) {
    // Strip the scheme
    let stripped = url.replace(/^sqlite:/, "");

    // If it's a relative path like './data/app.db' or 'data/app.db', return as-is
    if (stripped.startsWith("./") || /^[^/\\]+\/.*/.test(stripped)) {
      return stripped;
    }

    // Collapse multiple leading slashes to a single leading slash for absolute paths
    // e.g. '////data/app.db' -> '/data/app.db'
    stripped = stripped.replace(/^\/+/u, "/");

    // On Windows paths coming from some URL forms may look like '/C:/path', keep them
    return stripped;
  }
  return url;
}

export function initDb(databaseUrl: string): Database {
  const dbPath = sqlitePathFromUrl(databaseUrl);
  let openedAs = "";

  // Handle in-memory explicitly
  if (dbPath === ":memory:") {
    db = new Database(":memory:");
    openedAs = ":memory:";
  } else {
    // Ensure parent directory exists where possible. Some URL forms
    // may include leading slashes (e.g. `sqlite:////data/app.db`). If
    // mkdir fails it's non-fatal — we'll try opening and fall back to
    // an in-memory DB on error.
    try {
      const dir = path.dirname(dbPath);
      if (dir && dir !== ".") {
        // If path looks like a UNC or has multiple leading slashes,
        // attempt to normalize by removing repeated leading slashes
        // before creating directories.
        let mkdirTarget = dir;
          if (/^\\\\+/.test(dir) || /^\/\/+/.test(dir)) {
            mkdirTarget = dir.replace(/^\\\\+/, "").replace(/^\/+/, "");
        }
        if (mkdirTarget) fs.mkdirSync(mkdirTarget, { recursive: true });
      }
    } catch (err) {
      console.error("Failed to create DB directory:", err);
    }

    try {
      db = new Database(dbPath);
    } catch (err) {
      console.error(
        "Unable to open database file, falling back to in-memory DB:",
        dbPath,
        err
      );
      db = new Database(":memory:");
    }
  }
  if (!openedAs) {
    // If openedAs wasn't set earlier, determine what we have now
    openedAs = dbPath === ":memory:" ? ":memory:" : `file:${dbPath}`;
    // If we fell back to in-memory the dbPath won't reflect that; detect by instanceof or string
    try {
      if (db && (db as any).filename === ":memory:") openedAs = ":memory:";
    } catch {}
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      from_msisdn TEXT NOT NULL,
      to_msisdn TEXT NOT NULL,
      ts TEXT NOT NULL,
      text TEXT,
      created_at TEXT NOT NULL
    )
  `);
  console.info("Database initialized:", openedAs);
  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

export type MessageFilters = {
  limit: number;
  offset: number;
  from?: string;
  since?: string;
  q?: string;
};

export function insertMessage(
  message: WebhookMessage
): { created: boolean; dup: boolean } {
  const database = getDb();
  const now = new Date().toISOString();
  try {
    const stmt = database.prepare(
      `INSERT INTO messages (message_id, from_msisdn, to_msisdn, ts, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      message.message_id,
      message.from,
      message.to,
      message.ts,
      message.text ?? null,
      now
    );
    return { created: true, dup: false };
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed: messages.message_id")
    ) {
      return { created: false, dup: true };
    }
    throw err;
  }
}

export function listMessages(filters: MessageFilters): {
  data: StoredMessage[];
  total: number;
} {
  const database = getDb();
  const clauses: string[] = [];
  const params: any[] = [];

  if (filters.from) {
    clauses.push("from_msisdn = ?");
    params.push(filters.from);
  }
  if (filters.since) {
    clauses.push("ts >= ?");
    params.push(filters.since);
  }
  if (filters.q) {
    clauses.push("LOWER(text) LIKE '%' || LOWER(?) || '%'");
    params.push(filters.q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const sql = `
      SELECT message_id, from_msisdn, to_msisdn, ts, text, created_at
      FROM messages
      ${where}
      ORDER BY ts ASC, message_id ASC
      LIMIT ? OFFSET ?
    `;
  let rawRows: any[] = [];
  try {
    rawRows = database.prepare(sql).all(...params, filters.limit, filters.offset) as any[];
  } catch (err) {
    console.error("listMessages SQL error", { sql, params, err: String(err) });
    throw err;
  }

  const data = rawRows.map((r) => ({
    message_id: r.message_id,
    from: r.from_msisdn,
    to: r.to_msisdn,
    ts: r.ts,
    text: r.text,
    created_at: r.created_at,
  })) as StoredMessage[];

  const countSql = `SELECT COUNT(*) as count FROM messages ${where}`;
  let totalRow: { count: number } = { count: 0 };
  try {
    totalRow = database.prepare(countSql).get(...params) as { count: number };
  } catch (err) {
    console.error("count SQL error", { countSql, params, err: String(err) });
    throw err;
  }

  return { data, total: totalRow.count };
}

export function getStats(): {
  total_messages: number;
  senders_count: number;
  messages_per_sender: { from: string; count: number }[];
  first_message_ts: string | null;
  last_message_ts: string | null;
} {
  const database = getDb();

  const totalRow = database
    .prepare("SELECT COUNT(*) as count FROM messages")
    .get() as { count: number };

  let senderRow: { count: number } = { count: 0 };
  try {
    senderRow = database
      .prepare("SELECT COUNT(DISTINCT from_msisdn) as count FROM messages")
      .get() as { count: number };
  } catch (err) {
    console.error("getStats senderRow SQL error", { sql: "SELECT COUNT(DISTINCT from_msisdn) as count FROM messages", err: String(err) });
    throw err;
  }

  const rawMessagesPerSender = database
    .prepare(
      `
      SELECT from_msisdn, COUNT(*) as count
      FROM messages
      GROUP BY from_msisdn
      ORDER BY count DESC
      LIMIT 10
    `
    )
    .all() as { from_msisdn: string; count: number }[];

  const messagesPerSender = rawMessagesPerSender.map((r) => ({
    from: r.from_msisdn,
    count: r.count,
  }));

  let firstRow: { ts?: string } | undefined;
  let lastRow: { ts?: string } | undefined;
  try {
    firstRow = database
      .prepare("SELECT ts FROM messages ORDER BY ts ASC, message_id ASC LIMIT 1")
      .get() as { ts?: string } | undefined;
  } catch (err) {
    console.error("getStats firstRow SQL error", { sql: "SELECT ts FROM messages ORDER BY ts ASC, message_id ASC LIMIT 1", err: String(err) });
    throw err;
  }
  try {
    lastRow = database
      .prepare("SELECT ts FROM messages ORDER BY ts DESC, message_id DESC LIMIT 1")
      .get() as { ts?: string } | undefined;
  } catch (err) {
    console.error("getStats lastRow SQL error", { sql: "SELECT ts FROM messages ORDER BY ts DESC, message_id DESC LIMIT 1", err: String(err) });
    throw err;
  }

  return {
    total_messages: totalRow?.count ?? 0,
    senders_count: senderRow?.count ?? 0,
    messages_per_sender: messagesPerSender,
    first_message_ts: firstRow?.ts ?? null,
    last_message_ts: lastRow?.ts ?? null,
  };
}

export function pingDb(): boolean {
  const database = getDb();
  try {
    database.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}

