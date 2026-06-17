import type { CastAttendanceEvent, CastAttendanceSummary } from '@/db';
import type { CastBean } from '@/common/types/entities';
import type { AttendanceMatrixRow, GroupedCasts } from './types';

export function groupCastsByGroupName(castList: CastBean[]): GroupedCasts {
  const map = new Map<string, CastBean[]>();
  const ungrouped: CastBean[] = [];

  for (const cast of castList) {
    if (!cast.group_name) {
      ungrouped.push(cast);
      continue;
    }

    const groupCasts = map.get(cast.group_name);
    if (groupCasts) {
      groupCasts.push(cast);
    } else {
      map.set(cast.group_name, [cast]);
    }
  }

  const result: GroupedCasts = [...map.entries()].map(([groupName, casts]) => ({ groupName, casts }));
  if (ungrouped.length > 0) result.push({ groupName: null, casts: ungrouped });
  return result;
}

export function buildAttendanceDates(history: CastAttendanceEvent[]): string[] {
  return Array.from(new Set(history.map((event) => event.recorded_at.slice(0, 10)))).sort();
}

function parseAttendanceCastNames(castNames: string): string[] {
  return castNames
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function buildAttendanceByCast(history: CastAttendanceEvent[]): Map<string, Set<string>> {
  const matrix = new Map<string, Set<string>>();

  for (const event of history) {
    const date = event.recorded_at.slice(0, 10);
    for (const castName of parseAttendanceCastNames(event.cast_names)) {
      const castDates = matrix.get(castName);
      if (castDates) {
        castDates.add(date);
      } else {
        matrix.set(castName, new Set([date]));
      }
    }
  }

  return matrix;
}

export function buildAttendanceRows(
  casts: CastBean[],
  history: CastAttendanceEvent[],
  summary: CastAttendanceSummary[],
): AttendanceMatrixRow[] {
  const castOrder = new Map(casts.map((cast, index) => [cast.name, index]));
  const summaryCountByCast = new Map(summary.map((item) => [item.cast_name, item.total_count]));
  const attendanceByCast = buildAttendanceByCast(history);
  const names = new Set<string>();

  for (const cast of casts) names.add(cast.name);
  for (const item of summary) names.add(item.cast_name);

  return Array.from(names)
    .sort((a, b) => {
      const orderA = castOrder.get(a);
      const orderB = castOrder.get(b);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return a.localeCompare(b, 'ja');
    })
    .map((castName) => {
      const dates = attendanceByCast.get(castName) ?? new Set<string>();
      return {
        castName,
        totalCount: summaryCountByCast.get(castName) ?? dates.size,
        dates,
      };
    });
}
