/**
 * イベントと取込セッションのライフサイクル境界。
 * UI は Tauri command 名や meta テーブルの保存形式を直接扱わず、この repository を経由する。
 */
import { invoke } from '@tauri-apps/api/core';
import { getSharedDb, getSessionDb, getCurrentEventName } from '../database';

export interface EventMeta {
  event_name: string;
  event_date: string | null;
  notes: string | null;
  photo_data_url: string | null;
  created_at: string | null;
}

export interface SessionMeta {
  imported_at: string | null;
  header_template_id: number | null;
}

export interface SessionInfo {
  timestamp: string;
}

/** イベント名の一覧を backend から取得する。 */
export async function listEvents(): Promise<string[]> {
  return invoke<string[]>('list_events');
}

/** 新しいイベントを backend command で作成する。 */
export async function createEvent(name: string): Promise<void> {
  await invoke('create_event', { eventName: name });
}

/** イベントと配下データを backend command で削除する。 */
export async function deleteEvent(name: string): Promise<void> {
  await invoke('delete_event', { eventName: name });
}

/** イベント名を backend command で変更する。 */
export async function renameEvent(oldName: string, newName: string): Promise<void> {
  await invoke('rename_event', { oldName, newName });
}

/** 指定イベントの取込セッション一覧を backend から取得する。 */
export async function listSessions(eventName: string): Promise<SessionInfo[]> {
  return invoke<SessionInfo[]>('list_sessions', { eventName });
}

/** 指定イベントに新しい取込セッションを作成し、timestamp を返す。 */
export async function createSession(eventName: string): Promise<string> {
  return invoke<string>('create_session', { eventName });
}

/** 指定イベント内の取込セッションを backend command で削除する。 */
export async function deleteSession(eventName: string, timestamp: string): Promise<void> {
  await invoke('delete_session', { eventName, timestamp });
}

interface MetaRow {
  key: string;
  value: string | null;
}

interface MetaDb {
  execute: (query: string, values?: unknown[]) => Promise<unknown>;
}

/** meta テーブルの key/value 行を Map に変換し、未保存値の判定を呼び出し側で簡潔にする。 */
function metaRowsToMap(rows: MetaRow[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const row of rows) map.set(row.key, row.value);
  return map;
}

/** meta テーブルの指定 key を upsert する。空配列の場合は DB を更新しない。 */
async function upsertMetaEntries(db: MetaDb, entries: [string, string | null][]): Promise<void> {
  for (const [key, value] of entries) {
    await db.execute(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }
}

/** イベント共有 DB の meta テーブルからイベント表示情報を復元する。 */
export async function getEventMeta(): Promise<EventMeta> {
  const db = getSharedDb();
  const rows = await db.select<MetaRow[]>('SELECT key, value FROM meta');
  const map = metaRowsToMap(rows);
  return {
    event_name: getCurrentEventName() ?? '',
    event_date: map.get('event_date') ?? null,
    notes: map.get('notes') ?? null,
    photo_data_url: map.get('photo_data_url') ?? null,
    created_at: map.get('created_at') ?? null,
  };
}

/** イベント表示情報の指定された項目だけを meta テーブルへ保存する。 */
export async function setEventMeta(patch: {
  event_date?: string | null;
  notes?: string | null;
  photo_data_url?: string | null;
}): Promise<void> {
  const db = getSharedDb();
  const entries: [string, string | null][] = [];
  if ('event_date' in patch) entries.push(['event_date', patch.event_date ?? null]);
  if ('notes' in patch) entries.push(['notes', patch.notes ?? null]);
  if ('photo_data_url' in patch) entries.push(['photo_data_url', patch.photo_data_url ?? null]);
  await upsertMetaEntries(db, entries);
}

/** 取込セッション DB の meta テーブルから取込補助情報を復元する。 */
export async function getSessionMeta(): Promise<SessionMeta> {
  const db = getSessionDb();
  const rows = await db.select<MetaRow[]>('SELECT key, value FROM meta');
  const map = metaRowsToMap(rows);
  const tplRaw = map.get('header_template_id');
  const tplId = tplRaw != null && tplRaw !== '' ? Number(tplRaw) : null;
  return {
    imported_at: map.get('imported_at') ?? null,
    header_template_id: tplId != null && Number.isFinite(tplId) ? tplId : null,
  };
}

/** 取込セッション補助情報の指定された項目だけを meta テーブルへ保存する。 */
export async function setSessionMeta(patch: {
  imported_at?: string | null;
  header_template_id?: number | null;
}): Promise<void> {
  const db = getSessionDb();
  const entries: [string, string | null][] = [];
  if ('imported_at' in patch) entries.push(['imported_at', patch.imported_at ?? null]);
  if ('header_template_id' in patch) {
    entries.push([
      'header_template_id',
      patch.header_template_id == null ? null : String(patch.header_template_id),
    ]);
  }
  await upsertMetaEntries(db, entries);
}
