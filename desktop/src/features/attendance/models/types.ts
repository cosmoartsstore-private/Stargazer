import type { CastBean } from '@/common/types/entities';

export type AttendanceTab = 'setup' | 'records';

export type AttendanceHistoryLoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

export type AttendanceDateRecordStatus = 'idle' | 'checking' | 'absent' | 'exists' | 'failed';

export interface AttendancePeriod {
  startDate: string;
  endDate: string;
}

export type GroupedCasts = { groupName: string | null; casts: CastBean[] }[];

export interface CastAttendanceRecord {
  recordedAt: string;
  castName: string;
  attendanceCount: number;
}

export interface AttendanceMatrixRow {
  castName: string;
  totalCount: number;
  dates: Set<string>;
}
