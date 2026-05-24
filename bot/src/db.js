import fs from 'node:fs';
import Database from 'better-sqlite3';

let cachedDb = null;
let cachedPath = null;

export function openDb(dbPath) {
  if (cachedDb && cachedPath === dbPath) return cachedDb;
  if (cachedDb) cachedDb.close();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Stargazer DB not found at ${dbPath}`);
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  cachedDb = db;
  cachedPath = dbPath;
  return db;
}

export function closeDb() {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
    cachedPath = null;
  }
}
