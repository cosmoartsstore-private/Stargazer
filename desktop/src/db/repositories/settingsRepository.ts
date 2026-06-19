/**
 * イベント単位の key/value 設定を保存する repository。
 * 設定は同一イベント内の取込セッションで共有するため、共有 DB を対象にする。
 */
import { getSharedDb } from '../database';

interface SettingRow {
  value: string;
}

const SELECT_SETTING_SQL = 'SELECT value FROM settings WHERE key = ?';
const UPSERT_SETTING_SQL =
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
const DELETE_SETTING_SQL = 'DELETE FROM settings WHERE key = ?';

/** 指定 key のイベント設定値を取得する。未保存の場合は null を返す。 */
export async function getSetting(key: string): Promise<string | null> {
  const db = getSharedDb();
  const rows = await db.select<SettingRow[]>(SELECT_SETTING_SQL, [key]);
  return rows[0]?.value ?? null;
}

/** 指定 key のイベント設定値を保存し、既存値があれば置き換える。 */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = getSharedDb();
  await db.execute(UPSERT_SETTING_SQL, [key, value]);
}

/** 指定 key のイベント設定値を削除する。 */
export async function deleteSetting(key: string): Promise<void> {
  const db = getSharedDb();
  await db.execute(DELETE_SETTING_SQL, [key]);
}
