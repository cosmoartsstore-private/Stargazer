import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

let _db: Database | null = null;
let _dbUri: string | null = null;

/** Get the resolved DB URI from the Rust backend (absolute path under Data\db\). */
async function getDbUri(): Promise<string> {
  if (!_dbUri) {
    _dbUri = await invoke<string>('get_db_uri');
  }
  return _dbUri;
}

export async function getDb(): Promise<Database> {
  if (!_db) {
    const uri = await getDbUri();
    _db = await Database.load(uri);
    await _db.execute('PRAGMA foreign_keys = ON');
  }
  return _db;
}
