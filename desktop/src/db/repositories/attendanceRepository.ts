import { getDb } from '../database';

export interface CastAttendanceRecord {
  cast_name: string;
}

export interface CastAttendanceEvent {
  event_id: number;
  event_name: string;
  cast_count: number;
  recorded_at: string;
  cast_names: string; // カンマ区切り
}

export interface CastAttendanceSummary {
  cast_name: string;
  total_count: number;
  last_event: string | null;
}

/** 現在イベントの最新日付の出席キャスト一覧 */
export async function getCastAttendanceForEvent(eventId: number): Promise<CastAttendanceRecord[]> {
  const db = await getDb();
  return db.select<CastAttendanceRecord[]>(
    `SELECT c.name AS cast_name
     FROM cast_attendance ca
     JOIN casts c ON c.id = ca.cast_id
     WHERE ca.event_id = ?
       AND DATE(ca.recorded_at) = (
         SELECT DATE(MAX(recorded_at)) FROM cast_attendance WHERE event_id = ?
       )
     ORDER BY c.name`,
    [eventId, eventId],
  );
}

/** 全記録の履歴（日付×イベント単位、新しい順） */
export async function getCastAttendanceHistory(): Promise<CastAttendanceEvent[]> {
  const db = await getDb();
  return db.select<CastAttendanceEvent[]>(
    `SELECT ca.event_id, e.name AS event_name, COUNT(*) AS cast_count,
            MAX(ca.recorded_at) AS recorded_at,
            GROUP_CONCAT(c.name, ',') AS cast_names
     FROM cast_attendance ca
     JOIN casts c ON c.id = ca.cast_id
     JOIN events e ON e.id = ca.event_id
     GROUP BY DATE(ca.recorded_at), ca.event_id
     ORDER BY recorded_at DESC`,
  );
}

/** キャスト別累積出席回数 */
export async function getCastAttendanceSummary(): Promise<CastAttendanceSummary[]> {
  const db = await getDb();
  return db.select<CastAttendanceSummary[]>(
    `SELECT c.name AS cast_name, COUNT(*) AS total_count, MAX(e.name) AS last_event
     FROM cast_attendance ca
     JOIN casts c ON c.id = ca.cast_id
     JOIN events e ON e.id = ca.event_id
     GROUP BY c.id, c.name
     ORDER BY total_count DESC, c.name`,
  );
}

/** 出席記録を保存。同日付の既存レコードのみ削除して再挿入。recordedAt は "YYYY-MM-DD" 形式 */
export async function recordCastAttendance(
  eventId: number,
  presentCastNames: string[],
  recordedAt: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM cast_attendance WHERE event_id = ? AND DATE(recorded_at) = DATE(?)`,
    [eventId, recordedAt],
  );
  for (const name of presentCastNames) {
    const rows = await db.select<[{ id: number }]>(
      'SELECT id FROM casts WHERE name = ? LIMIT 1',
      [name],
    );
    const castId = rows[0]?.id;
    if (!castId) continue;
    await db.execute(
      'INSERT INTO cast_attendance (event_id, cast_id, recorded_at) VALUES (?, ?, ?)',
      [eventId, castId, recordedAt],
    );
  }
}

/** 指定日付のキャスト出席記録が存在するか */
export async function hasCastAttendanceForDate(eventId: number, date: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<[{ n: number }]>(
    `SELECT COUNT(*) AS n FROM cast_attendance WHERE event_id = ? AND DATE(recorded_at) = DATE(?)`,
    [eventId, date],
  );
  return (rows[0]?.n ?? 0) > 0;
}
