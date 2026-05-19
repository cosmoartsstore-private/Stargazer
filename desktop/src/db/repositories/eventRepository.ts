import { invoke } from '@tauri-apps/api/core';
import { getDb, getCurrentEventName } from '../database';

export interface EventMeta {
  event_name: string;
  event_date: string | null;
  notes: string | null;
  photo_data_url: string | null;
  created_at: string | null;
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

interface MetaRow {
  key: string;
  value: string | null;
}

export async function getEventMeta(): Promise<EventMeta> {
  const db = await getDb();
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
  const db = await getDb();
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
