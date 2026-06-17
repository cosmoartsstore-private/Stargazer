import {
  getCastAttendanceHistory,
  getCastAttendanceSummary,
  hasCastAttendanceForDate,
  recordCastAttendance,
  updateCastAttend,
  type CastAttendanceEvent,
  type CastAttendanceSummary,
} from '@/db';

export interface AttendanceHistoryData {
  history: CastAttendanceEvent[];
  summary: CastAttendanceSummary[];
}

export async function loadAttendanceHistoryData(): Promise<AttendanceHistoryData> {
  const [history, summary] = await Promise.all([
    getCastAttendanceHistory(),
    getCastAttendanceSummary(),
  ]);
  return { history, summary };
}

export function hasAttendanceRecordOnDate(date: string): Promise<boolean> {
  return hasCastAttendanceForDate(date);
}

export function recordAttendanceForDate(presentCastNames: string[], recordDate: string): Promise<void> {
  return recordCastAttendance(presentCastNames, recordDate);
}

export function updateCastPresence(castName: string, isPresent: boolean): Promise<void> {
  return updateCastAttend(castName, isPresent);
}
