import type { CastBean } from '@/common/types/entities';

export type AttendanceTab = 'setup' | 'records';

export type GroupedCasts = { groupName: string | null; casts: CastBean[] }[];

export interface AttendanceMatrixRow {
  castName: string;
  totalCount: number;
  dates: Set<string>;
}
