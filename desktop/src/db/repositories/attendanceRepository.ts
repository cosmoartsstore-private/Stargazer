// Cast attendance history lives in the event-shared DB: each event accumulates
// its own attendance log across all import sessions. Aggregations no longer
// span events (one DB per event), so the "last event" field always equals the
// currently-open event.
import { getSharedDb, getCurrentEventName } from '../database';

export interface CastAttendanceRecord {
  cast_name: string;
}

export interface CastAttendanceEvent {
  event_id: number;
  event_name: string;
  cast_count: number;
  recorded_at: string;
  cast_names: string;
}

export interface CastAttendanceSummary {
  cast_name: string;
  total_count: number;
  last_event: string | null;
}

/** 現在イベントの最新日付の出席キャスト一覧 */
export async function getCastAttendance(): Promise<CastAttendanceRecord[]> {
  const db = getSharedDb();
  return db.select<CastAttendanceRecord[]>(
    `SELECT c.name AS cast_name
     FROM cast_attendance ca
     JOIN casts c ON c.id = ca.cast_id
     WHERE DATE(ca.recorded_at) = (
         SELECT DATE(MAX(recorded_at)) FROM cast_attendance
       )
     ORDER BY c.name`,
  );
}

/** 現在イベントの記録履歴（日付単位、新しい順） */
export async function getCastAttendanceHistory(): Promise<CastAttendanceEvent[]> {
  const db = getSharedDb();
  const eventName = getCurrentEventName() ?? '';
  interface Row {
    cast_count: number;
    recorded_at: string;
    cast_names: string;
  }
  const rows = await db.select<Row[]>(
    `SELECT COUNT(*) AS cast_count,
            MAX(ca.recorded_at) AS recorded_at,
            GROUP_CONCAT(c.name, ',') AS cast_names
     FROM cast_attendance ca
     JOIN casts c ON c.id = ca.cast_id
     GROUP BY DATE(ca.recorded_at)
     ORDER BY recorded_at DESC`,
  );
  return rows.map((r) => ({
    event_id: 0,
    event_name: eventName,
    cast_count: r.cast_count,
    recorded_at: r.recorded_at,
    cast_names: r.cast_names,
  }));
}

/** 現在イベントのキャスト別累積出席回数 */
export async function getCastAttendanceSummary(): Promise<CastAttendanceSummary[]> {
  const db = getSharedDb();
  const eventName = getCurrentEventName();
  interface Row {
    cast_name: string;
    total_count: number;
  }
  const rows = await db.select<Row[]>(
    `SELECT c.name AS cast_name, COUNT(*) AS total_count
     FROM cast_attendance ca
     JOIN casts c ON c.id = ca.cast_id
     GROUP BY c.id, c.name
     ORDER BY total_count DESC, c.name`,
  );
  return rows.map((r) => ({
    cast_name: r.cast_name,
    total_count: r.total_count,
    last_event: eventName,
  }));
}

/** 出席記録を保存。同日付の既存レコードのみ削除して再挿入。recordedAt は "YYYY-MM-DD" 形式 */
export async function recordCastAttendance(
  presentCastNames: string[],
  recordedAt: string,
): Promise<void> {
  const db = getSharedDb();
  await db.execute(
    `DELETE FROM cast_attendance WHERE DATE(recorded_at) = DATE(?)`,
    [recordedAt],
  );
  for (const name of presentCastNames) {
    const rows = await db.select<[{ id: number }]>(
      'SELECT id FROM casts WHERE name = ? LIMIT 1',
      [name],
    );
    const castId = rows[0]?.id;
    if (!castId) continue;
    await db.execute(
      'INSERT INTO cast_attendance (cast_id, recorded_at) VALUES (?, ?)',
      [castId, recordedAt],
    );
  }
}

/** 指定日付のキャスト出席記録が存在するか */
export async function hasCastAttendanceForDate(date: string): Promise<boolean> {
  const db = getSharedDb();
  const rows = await db.select<[{ n: number }]>(
    `SELECT COUNT(*) AS n FROM cast_attendance WHERE DATE(recorded_at) = DATE(?)`,
    [date],
  );
  return (rows[0]?.n ?? 0) > 0;
}
