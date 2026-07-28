import type { CastAttendanceRecord } from './types';
import type { CastBean } from '@/common/types/entities';
import type { AttendanceMatrixRow, GroupedCasts } from './types';

/** グループ名ごとにキャストをまとめ、未所属キャストを独立した末尾グループに集約する。 */
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

/** 構造化履歴を1回走査し、出席履歴表の日付列とキャスト行を構築する。 */
export function buildAttendanceMatrix(
  casts: CastBean[],
  history: CastAttendanceRecord[],
): { dates: string[]; rows: AttendanceMatrixRow[] } {
  const castOrder = new Map(casts.map((cast, index) => [cast.name, index]));
  const dates = new Set<string>();
  const rowByCastName = new Map<string, AttendanceMatrixRow>();

  for (const record of history) {
    const date = record.recordedAt.slice(0, 10);
    dates.add(date);
    const current = rowByCastName.get(record.castName);
    if (current) {
      current.totalCount += record.attendanceCount;
      current.dates.add(date);
    } else {
      rowByCastName.set(record.castName, {
        castName: record.castName,
        totalCount: record.attendanceCount,
        dates: new Set([date]),
      });
    }
  }

  for (const cast of casts) {
    if (!rowByCastName.has(cast.name)) {
      rowByCastName.set(cast.name, {
        castName: cast.name,
        totalCount: 0,
        dates: new Set(),
      });
    }
  }

  const rows = Array.from(rowByCastName.values())
    .sort((a, b) => {
      const orderA = castOrder.get(a.castName);
      const orderB = castOrder.get(b.castName);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return a.castName.localeCompare(b.castName, 'ja');
    });

  return {
    dates: Array.from(dates).sort(),
    rows,
  };
}
