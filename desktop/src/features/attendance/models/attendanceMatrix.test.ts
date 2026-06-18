import { describe, expect, it } from 'vitest';
import type { CastAttendanceEvent, CastAttendanceSummary } from '@/db';
import type { CastBean } from '@/common/types/entities';
import { buildAttendanceDates, buildAttendanceRows, groupCastsByGroupName } from './attendanceMatrix';

const casts: CastBean[] = [
  { name: 'Alice', is_present: true, group_name: '1期生' },
  { name: 'Bob', is_present: true, group_name: '2期生' },
  { name: 'Carol', is_present: false },
];

describe('groupCastsByGroupName', () => {
  it('グループ名ごとにキャストをまとめ、未所属は最後に配置する', () => {
    expect(groupCastsByGroupName(casts)).toEqual([
      { groupName: '1期生', casts: [casts[0]] },
      { groupName: '2期生', casts: [casts[1]] },
      { groupName: null, casts: [casts[2]] },
    ]);
  });
});

describe('buildAttendanceDates', () => {
  it('履歴の日付部分を重複なく昇順で返す', () => {
    const history = [
      { recorded_at: '2026-06-10T10:00:00.000Z', cast_names: 'Alice' },
      { recorded_at: '2026-06-09T10:00:00.000Z', cast_names: 'Bob' },
      { recorded_at: '2026-06-10T12:00:00.000Z', cast_names: 'Carol' },
    ] as CastAttendanceEvent[];

    expect(buildAttendanceDates(history)).toEqual(['2026-06-09', '2026-06-10']);
  });
});

describe('buildAttendanceRows', () => {
  it('キャスト順を保ち、履歴とサマリーから出欠行を構築する', () => {
    const history = [
      { recorded_at: '2026-06-10T10:00:00.000Z', cast_names: 'Alice, Bob' },
      { recorded_at: '2026-06-11T10:00:00.000Z', cast_names: 'Alice' },
      { recorded_at: '2026-06-12T10:00:00.000Z', cast_names: 'External' },
    ] as CastAttendanceEvent[];
    const summary = [
      { cast_name: 'Alice', total_count: 7 },
      { cast_name: 'External', total_count: 1 },
    ] as CastAttendanceSummary[];

    const rows = buildAttendanceRows(casts, history, summary);

    expect(rows.map((row) => row.castName)).toEqual(['Alice', 'Bob', 'Carol', 'External']);
    expect(rows[0].totalCount).toBe(7);
    expect([...rows[0].dates]).toEqual(['2026-06-10', '2026-06-11']);
    expect(rows[1].totalCount).toBe(1);
    expect([...rows[1].dates]).toEqual(['2026-06-10']);
    expect(rows[2].totalCount).toBe(0);
    expect(rows[3].totalCount).toBe(1);
  });
});
