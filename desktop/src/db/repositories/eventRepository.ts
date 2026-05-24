// Event and session lifecycle façade. Event-level operations (create/delete/
// rename/list) and shared-DB meta go through the shared DB; session-level
// operations (list/create/delete/meta) go through the backend or session DB.
// UI calls this module instead of invoking Tauri commands directly so it can
// stay decoupled from command names.
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

export async function listEvents(): Promise<string[]> {
  return invoke<string[]>('list_events');
}

export async function createEvent(name: string): Promise<void> {
  await invoke('create_event', { eventName: name });
}

export async function deleteEvent(name: string): Promise<void> {
  await invoke('delete_event', { eventName: name });
}

export async function renameEvent(oldName: string, newName: string): Promise<void> {
  await invoke('rename_event', { oldName, newName });
}

export async function listSessions(eventName: string): Promise<SessionInfo[]> {
  return invoke<SessionInfo[]>('list_sessions', { eventName });
}

export async function createSession(eventName: string): Promise<string> {
  return invoke<string>('create_session', { eventName });
}

export async function deleteSession(eventName: string, timestamp: string): Promise<void> {
  await invoke('delete_session', { eventName, timestamp });
}

interface MetaRow {
  key: string;
  value: string | null;
}

export async function getEventMeta(): Promise<EventMeta> {
  const db = getSharedDb();
  const rows = await db.select<MetaRow[]>('SELECT key, value FROM meta');
  const map = new Map<string, string | null>();
  for (const r of rows) map.set(r.key, r.value);
  return {
    event_name: getCurrentEventName() ?? '',
    event_date: map.get('event_date') ?? null,
    notes: map.get('notes') ?? null,
    photo_data_url: map.get('photo_data_url') ?? null,
    created_at: map.get('created_at') ?? null,
  };
}

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
  for (const [k, v] of entries) {
    await db.execute(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [k, v],
    );
  }
}

export async function getSessionMeta(): Promise<SessionMeta> {
  const db = getSessionDb();
  const rows = await db.select<MetaRow[]>('SELECT key, value FROM meta');
  const map = new Map<string, string | null>();
  for (const r of rows) map.set(r.key, r.value);
  const tplRaw = map.get('header_template_id');
  const tplId = tplRaw != null && tplRaw !== '' ? Number(tplRaw) : null;
  return {
    imported_at: map.get('imported_at') ?? null,
    header_template_id: tplId != null && Number.isFinite(tplId) ? tplId : null,
  };
}

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
  for (const [k, v] of entries) {
    await db.execute(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [k, v],
    );
  }
}
