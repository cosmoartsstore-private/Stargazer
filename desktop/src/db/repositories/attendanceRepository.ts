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

interface AttendanceRecordDateRow {
  recorded_at: string;
}

/** 履歴の表示名は記録時名称を複製せず、現在のキャスト名へ追随させる。 */
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

/** 出席者が0人の日を含む、保存済みの記録日を新しい順で返す。 */
export async function getCastAttendanceRecordDates(): Promise<string[]> {
  const db = getSharedDb();
  const rows = await db.select<AttendanceRecordDateRow[]>(
    `SELECT recorded_at
     FROM attendance_record_dates
     ORDER BY recorded_at DESC`,
  );
  return rows.map((row) => row.recorded_at);
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

/** 指定日付の出席記録が存在するか。出席者0人の記録も対象にする。 */
export async function hasCastAttendanceForDate(date: string): Promise<boolean> {
  const db = getSharedDb();
  const rows = await db.select<[{ n: number }]>(
    `SELECT EXISTS(
       SELECT 1 FROM attendance_record_dates WHERE recorded_at = ?
     ) AS n`,
    [date],
  );
  return (rows[0]?.n ?? 0) > 0;
}
