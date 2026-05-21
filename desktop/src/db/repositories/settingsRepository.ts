// Per-event settings (key/value) live in the event-shared DB so they apply to
// every import session under that event.
import { getSharedDb } from '../database';

interface SettingRow {
  value: string;
}

export async function getSetting(key: string): Promise<string | null> {
  const db = getSharedDb();
  const rows = await db.select<SettingRow[]>('SELECT value FROM settings WHERE key = ?', [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getSharedDb();
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const db = getSharedDb();
  await db.execute('DELETE FROM settings WHERE key = ?', [key]);
}
