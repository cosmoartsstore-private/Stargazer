/**
 * イベント単位の key/value 設定を保存する repository。
 * 設定は同一イベント内の取込セッションで共有するため、共有 DB を対象にする。
 */
import { getSharedDb } from '../database';
import { enqueueEventWrite, getRequiredEventName } from './commandContext';

interface SettingRow {
  value: string;
}

const SELECT_SETTING_SQL = 'SELECT value FROM settings WHERE key = ?';
const UPSERT_SETTING_SQL =
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';

/** 指定 key のイベント設定値を取得する。未保存の場合は null を返す。 */
export async function getSetting(key: string): Promise<string | null> {
  const db = getSharedDb();
  const rows = await db.select<SettingRow[]>(SELECT_SETTING_SQL, [key]);
  return rows[0]?.value ?? null;
}

/** 指定 key のイベント設定値を保存し、既存値があれば置き換える。 */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = getSharedDb();
  const eventName = getRequiredEventName();
  await enqueueEventWrite(
    eventName,
    () => db.execute(UPSERT_SETTING_SQL, [key, value]).then(() => undefined),
  );
}
