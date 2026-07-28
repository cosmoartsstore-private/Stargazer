import { describe, expect, it } from 'vitest';
import type { CastAttendanceRecord } from '@/db';
import type { CastBean } from '@/common/types/entities';
import { buildAttendanceMatrix, groupCastsByGroupName } from '@/features/attendance/models/attendanceMatrix';

const casts: CastBean[] = [
  { id: 1, name: 'Alice', is_present: true, group_name: '1期生' },
  { id: 2, name: 'Bob', is_present: true, group_name: '2期生' },
  { id: 3, name: 'Carol', is_present: false },
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

describe('buildAttendanceMatrix', () => {
  it('1つの構造化履歴から日付列・累計・出欠行を構築する', () => {
    const history: CastAttendanceRecord[] = [
      {
        recordedAt: '2026-06-10T10:00:00.000Z',
        castName: 'Alice',
        attendanceCount: 2,
      },
      {
        recordedAt: '2026-06-11T10:00:00.000Z',
        castName: 'Alice',
        attendanceCount: 1,
      },
      {
        recordedAt: '2026-06-10T10:00:00.000Z',
        castName: 'Bob',
        attendanceCount: 1,
      },
      {
        recordedAt: '2026-06-12T10:00:00.000Z',
        castName: 'External, Guest',
        attendanceCount: 1,
      },
    ];

    const matrix = buildAttendanceMatrix(casts, history);

    expect(matrix.dates).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
    expect(matrix.rows.map((row) => row.castName)).toEqual([
      'Alice',
      'Bob',
      'Carol',
      'External, Guest',
    ]);
    expect(matrix.rows[0].totalCount).toBe(3);
    expect([...matrix.rows[0].dates]).toEqual(['2026-06-10', '2026-06-11']);
    expect(matrix.rows[1].totalCount).toBe(1);
    expect([...matrix.rows[1].dates]).toEqual(['2026-06-10']);
    expect(matrix.rows[2].totalCount).toBe(0);
    expect(matrix.rows[3].totalCount).toBe(1);
    expect([...matrix.rows[3].dates]).toEqual(['2026-06-12']);
  });
});
