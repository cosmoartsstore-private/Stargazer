import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

let _db: Database | null = null;
let _eventName: string | null = null;

export async function openEvent(eventName: string): Promise<void> {
  if (_db) await closeEvent();
  const uri = await invoke<string>('get_event_db_uri', { eventName });
  const db = await Database.load(uri);
  await db.execute('PRAGMA foreign_keys = ON');
  _db = db;
  _eventName = eventName;
}

export async function closeEvent(): Promise<void> {
  if (!_db) return;
  await _db.close();
  _db = null;
  _eventName = null;
}

export async function getDb(): Promise<Database> {
  if (!_db) throw new Error('No event opened. Call openEvent(name) first.');
  return _db;
}

export function getCurrentEventName(): string | null {
  return _eventName;
}
