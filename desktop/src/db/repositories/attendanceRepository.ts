// キャスト出席履歴はイベント共有 DB に保存し、同一イベント内の全取込セッションで累積する。
import { invoke } from '@tauri-apps/api/core';
import type { CastAttendanceRecord } from '@/features/attendance/models/types';
import { getSharedDb } from '../database';
import { enqueueEventWrite, getRequiredEventName } from './commandContext';

export type { CastAttendanceRecord } from '@/features/attendance/models/types';

interface CastAttendanceRow {
  recorded_at: string;
  cast_name: string;
  attendance_count: number;
}

/** 現在イベントの日付・キャスト別出席履歴を、新しい日付順で返す。 */
export async function getCastAttendanceHistory(): Promise<CastAttendanceRecord[]> {
  const db = getSharedDb();
  const rows = await db.select<CastAttendanceRow[]>(
    `SELECT MAX(ca.recorded_at) AS recorded_at,
            c.name AS cast_name,
            COUNT(*) AS attendance_count
     FROM cast_attendance ca
     JOIN casts c ON c.id = ca.cast_id
     GROUP BY DATE(ca.recorded_at), c.id, c.name
     ORDER BY recorded_at DESC, c.name`,
  );
  return rows.map((row) => ({
    recordedAt: row.recorded_at,
    castName: row.cast_name,
    attendanceCount: row.attendance_count,
  }));
}

/** 出席記録を保存。同日付の既存レコードのみ削除して再挿入。recordedAt は "YYYY-MM-DD" 形式 */
export async function recordCastAttendance(
  presentCastIds: number[],
  recordedAt: string,
): Promise<void> {
  const eventName = getRequiredEventName();
  await enqueueEventWrite(eventName, () => invoke('record_cast_attendance_atomic', {
    eventName,
    presentCastIds,
    recordedAt,
  }));
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
