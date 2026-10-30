import Database from 'better-sqlite3';

const db = new Database('udhaar.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    type TEXT NOT NULL CHECK(type IN ('credit', 'payment')),
    date TEXT,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rows_found INTEGER,
    mode TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

export default db;
