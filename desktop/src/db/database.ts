import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

// Two-connection model:
//   - Shared DB: per-event, holds long-lived state that persists across CSV
//     imports (casts, NG users, caution users, attendance history, header
//     templates, per-event settings, event meta).
//   - Session DB: per-import-session, holds volatile data tied to a single
//     applicant CSV import (applicants, applicant_casts/extra, lottery results).
// A session always belongs to an event, so opening a session requires the
// shared DB to be open first. Closing the event tears down both connections.

let _sharedDb: Database | null = null;
let _sessionDb: Database | null = null;
let _eventName: string | null = null;
let _sessionTs: string | null = null;

export async function openEvent(eventName: string): Promise<void> {
  if (_sessionDb) await closeSession();
  if (_sharedDb) await closeEvent();
  const uri = await invoke<string>('get_event_shared_db_uri', { eventName });
  const db = await Database.load(uri);
  await db.execute('PRAGMA foreign_keys = ON');
  _sharedDb = db;
  _eventName = eventName;
}

export async function openSession(timestamp: string): Promise<void> {
  if (!_sharedDb || !_eventName) {
    throw new Error('No event opened. Call openEvent(name) before openSession.');
  }
  if (_sessionDb) await closeSession();
  const uri = await invoke<string>('get_session_db_uri', {
    eventName: _eventName,
    timestamp,
  });
  const db = await Database.load(uri);
  await db.execute('PRAGMA foreign_keys = ON');
  _sessionDb = db;
  _sessionTs = timestamp;
}

export async function closeSession(): Promise<void> {
  if (!_sessionDb) return;
  await _sessionDb.close();
  _sessionDb = null;
  _sessionTs = null;
}

export async function closeEvent(): Promise<void> {
  if (_sessionDb) await closeSession();
  if (!_sharedDb) return;
  await _sharedDb.close();
  _sharedDb = null;
  _eventName = null;
}

export function getSharedDb(): Database {
  if (!_sharedDb) throw new Error('No event opened. Call openEvent(name) first.');
  return _sharedDb;
}

export function getSessionDb(): Database {
  if (!_sessionDb) throw new Error('No session opened. Call openSession(timestamp) first.');
  return _sessionDb;
}

export function getCurrentEventName(): string | null {
  return _eventName;
}

export function getCurrentSessionTimestamp(): string | null {
  return _sessionTs;
}
