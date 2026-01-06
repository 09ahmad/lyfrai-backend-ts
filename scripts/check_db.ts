import { initDb } from "../app/storage.ts";

const url = process.env.DATABASE_URL || "sqlite:./data/app.db";
try {
  const db = initDb(url);
  console.log("initDb succeeded for:", url);
  // quick ping
  try {
    const ok = db.prepare("SELECT 1").get();
    console.log("DB ping OK");
  } catch (e) {
    console.error("DB ping failed:", e);
  }
} catch (err) {
  console.error("initDb threw:", err);
  process.exit(1);
}
