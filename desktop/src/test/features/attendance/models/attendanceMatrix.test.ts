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

  it('同じグループのキャストを入力順でまとめ、空一覧ではグループを作らない', () => {
    const sameGroup = [casts[0], { ...casts[1], group_name: '1期生' }];

    expect(groupCastsByGroupName(sameGroup)).toEqual([
      { groupName: '1期生', casts: sameGroup },
    ]);
    expect(groupCastsByGroupName([])).toEqual([]);
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

  it('記録日と履歴を指定期間で絞り、出席者0人の日付も列へ残す', () => {
    const history: CastAttendanceRecord[] = [
      { recordedAt: '2026-06-09T10:00:00.000Z', castName: '過去キャスト', attendanceCount: 1 },
      { recordedAt: '2026-06-10T10:00:00.000Z', castName: 'Alice', attendanceCount: 1 },
      { recordedAt: '2026-06-12T10:00:00.000Z', castName: '将来キャスト', attendanceCount: 1 },
    ];

    const matrix = buildAttendanceMatrix(
      casts,
      history,
      { startDate: '2026-06-10', endDate: '2026-06-11' },
      ['2026-06-09T12:00:00.000Z', '2026-06-11', '2026-06-12'],
    );

    expect(matrix.dates).toEqual(['2026-06-10', '2026-06-11']);
    expect(matrix.rows.map((row) => row.castName)).toEqual([
      'Alice', 'Bob', 'Carol', '過去キャスト', '将来キャスト',
    ]);
    expect(matrix.rows.find((row) => row.castName === '過去キャスト')).toMatchObject({
      totalCount: 0,
    });
    expect(matrix.rows.find((row) => row.castName === '将来キャスト')).toMatchObject({
      totalCount: 0,
    });
  });
});
