import fs from 'node:fs';
import Database from 'better-sqlite3';
import { resolveDbPath } from './config.js';

let cachedDb = null;
let cachedPath = null;

export async function openDb() {
  const { path: dbPath } = await resolveDbPath();
  if (cachedDb && cachedPath === dbPath) return cachedDb;
  if (cachedDb) cachedDb.close();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Stargazer DB not found at ${dbPath}. Run /setup-db.`);
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  cachedDb = db;
  cachedPath = dbPath;
  return db;
}
