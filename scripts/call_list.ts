import { initDb, listMessages } from "../app/storage.ts";

initDb("sqlite:./data/app.db");
try {
  const res = listMessages({ limit: 10, offset: 0 });
  console.log('listMessages returned', res);
} catch (e) {
  console.error('listMessages error', e);
}
