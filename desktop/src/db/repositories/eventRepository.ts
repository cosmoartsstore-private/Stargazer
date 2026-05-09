import { getDb } from '../database';
import { getSetting, setSetting } from './settingsRepository';

const CURRENT_EVENT_KEY = 'current_event_id';

export interface EventRow {
  id: number;
  name: string;
  event_date: string | null;
  notes: string | null;
  photo_data_url: string | null;
  created_at: string;
}

export async function getAllEvents(): Promise<EventRow[]> {
  const db = await getDb();
  return db.select<EventRow[]>('SELECT * FROM events ORDER BY created_at DESC');
}

export async function getEventById(id: number): Promise<EventRow | null> {
  const db = await getDb();
  const rows = await db.select<EventRow[]>('SELECT * FROM events WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function getEventByName(name: string): Promise<EventRow | null> {
  const db = await getDb();
  const rows = await db.select<EventRow[]>('SELECT * FROM events WHERE name = ?', [name]);
  return rows[0] ?? null;
}

export async function createEvent(name: string, eventDate?: string, notes?: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    'INSERT INTO events (name, event_date, notes) VALUES (?, ?, ?)',
    [name, eventDate ?? null, notes ?? null],
  );
  return result.lastInsertId as number;
}

export async function updateEvent(id: number, patch: {
  name?: string;
  event_date?: string | null;
  notes?: string | null;
  photo_data_url?: string | null;
}): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined)          { sets.push('name = ?');          params.push(patch.name); }
  if ('event_date'    in patch)          { sets.push('event_date = ?');    params.push(patch.event_date ?? null); }
  if ('notes'         in patch)          { sets.push('notes = ?');         params.push(patch.notes ?? null); }
  if ('photo_data_url' in patch)         { sets.push('photo_data_url = ?'); params.push(patch.photo_data_url ?? null); }
  if (sets.length === 0) return;
  params.push(id);
  await db.execute(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function deleteEvent(id: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM events WHERE id = ?', [id]);
}

// ─── 現在のイベント管理 ───

export async function getCurrentEventId(): Promise<number | null> {
  const val = await getSetting(CURRENT_EVENT_KEY);
  if (!val) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

export async function setCurrentEventId(id: number): Promise<void> {
  await setSetting(CURRENT_EVENT_KEY, String(id));
}

/** 名前でイベントを取得or作成し、カレントに設定する */
export async function ensureCurrentEvent(name: string): Promise<number> {
  let ev = await getEventByName(name);
  if (!ev) {
    const id = await createEvent(name);
    await setCurrentEventId(id);
    return id;
  }
  await setCurrentEventId(ev.id);
  return ev.id;
}
