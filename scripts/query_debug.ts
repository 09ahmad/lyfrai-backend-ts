import { Database } from "bun:sqlite";

try {
  const db = new Database('./data/app.db');
  const sql = `SELECT message_id, from_msisdn, to_msisdn, ts, text, created_at FROM messages ORDER BY ts ASC, message_id ASC LIMIT ? OFFSET ?`;
  console.log('SQL=', sql);
  try {
    const rows = db.prepare(sql).all(10, 0);
    console.log('rows:', rows);
  } catch (e) {
    console.error('rows error:', e);
  }

  const statsSql = `SELECT from_msisdn, COUNT(*) as count FROM messages GROUP BY from_msisdn ORDER BY count DESC LIMIT 10`;
  console.log('statsSql=', statsSql);
  try {
    const sp = db.prepare(statsSql).all();
    console.log('stats:', sp);
  } catch (e) {
    console.error('stats error:', e);
  }
} catch (err) {
  console.error('open err', err);
}
