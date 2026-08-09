import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { getMsg } from '@/messages/getMsg';

// 2接続モデル:
//   - 共有DB: イベント情報、キャスト、NG、要注意人物、出欠履歴、設定、保存済み結果を保持する。
//   - セッションDB: 現在の応募者、希望、追加列、抽選条件、抽選結果を保持する。
// セッションは必ずイベントに属するため、共有DBを先に開く。イベントを閉じると両接続を閉じる。

let _sharedDb: Database | null = null;
let _sessionDb: Database | null = null;
let _eventName: string | null = null;
let _sessionTs: string | null = null;
let _connectionGeneration = 0;
let _eventConnectionGeneration = 0;

async function loadDatabase(uri: string): Promise<Database> {
  const db = await Database.load(uri);
  try {
    await db.execute('PRAGMA foreign_keys = ON');
    return db;
  } catch (error) {
    await db.close(db.path).catch(() => undefined);
    throw error;
  }
}

export async function openEvent(eventName: string): Promise<void> {
  const uri = await invoke<string>('get_event_shared_db_uri', { eventName });
  const db = await loadDatabase(uri);
  try {
    // 切替先を開けることを確認してから現在接続を閉じ、切替失敗による作業セッション喪失を防ぐ。
    if (_sessionDb || _sharedDb) await closeEvent();
  } catch (error) {
    await db.close(db.path).catch(() => undefined);
    throw error;
  }
  _sharedDb = db;
  _eventName = eventName;
  _connectionGeneration += 1;
  _eventConnectionGeneration += 1;
}

export async function openSession(timestamp: string): Promise<void> {
  if (!_sharedDb || !_eventName) {
    throw new Error(getMsg('database.eventNotOpen'));
  }
  if (_sessionDb) await closeSession();
  const uri = await invoke<string>('get_session_db_uri', {
    eventName: _eventName,
    timestamp,
  });
  const db = await loadDatabase(uri);
  _sessionDb = db;
  _sessionTs = timestamp;
  _connectionGeneration += 1;
}

export async function closeSession(): Promise<void> {
  if (!_sessionDb) return;
  // 引数なしの close はすべての接続プールを閉じるため、イベント共有 DB を残して対象セッションだけを閉じる。
  await _sessionDb.close(_sessionDb.path);
  _sessionDb = null;
  _sessionTs = null;
  _connectionGeneration += 1;
}

export async function closeEvent(): Promise<void> {
  if (_sessionDb) await closeSession();
  if (!_sharedDb) return;
  await _sharedDb.close(_sharedDb.path);
  _sharedDb = null;
  _eventName = null;
  _connectionGeneration += 1;
  _eventConnectionGeneration += 1;
}

export function getSharedDb(): Database {
  if (!_sharedDb) throw new Error(getMsg('database.eventNotOpen'));
  return _sharedDb;
}

export function getSessionDb(): Database {
  if (!_sessionDb) throw new Error(getMsg('database.sessionNotOpen'));
  return _sessionDb;
}

export function getCurrentEventName(): string | null {
  return _eventName;
}

export function getCurrentSessionTimestamp(): string | null {
  return _sessionTs;
}

/** 同じイベント・timestampを開き直した場合も区別できる、接続世代番号を返す。 */
export function getCurrentConnectionGeneration(): number {
  return _connectionGeneration;
}

/** セッション接続の開閉では変化しない、イベント共有DB接続の世代番号を返す。 */
export function getCurrentEventConnectionGeneration(): number {
  return _eventConnectionGeneration;
}
