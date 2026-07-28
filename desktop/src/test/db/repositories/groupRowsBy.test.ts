import { describe, expect, it } from 'vitest';
import { groupRowsBy } from '@/db/repositories/groupRowsBy';

describe('groupRowsBy', () => {
  it('キーの初出順と各行の入力順を保ってグループ化する', () => {
    const rows = Object.freeze([
      { id: 1, group: 'B' },
      { id: 2, group: 'A' },
      { id: 3, group: 'B' },
      { id: 4, group: 'A' },
    ]);
    const originalRows = [...rows];

    const groups = groupRowsBy(rows, (row) => row.group);

    expect([...groups]).toEqual([
      ['B', [rows[0], rows[2]]],
      ['A', [rows[1], rows[3]]],
    ]);
    expect([...rows]).toEqual(originalRows);
  });

  it('Mapのキー比較に従い、同じオブジェクト参照だけを同じグループにする', () => {
    const sharedKey = { value: 1 };
    const distinctKey = { value: 1 };
    const rows = [
      { id: 1, key: sharedKey },
      { id: 2, key: distinctKey },
      { id: 3, key: sharedKey },
    ];

    const groups = groupRowsBy(rows, (row) => row.key);

    expect(groups.size).toBe(2);
    expect(groups.get(sharedKey)).toEqual([rows[0], rows[2]]);
    expect(groups.get(distinctKey)).toEqual([rows[1]]);
  });

  it('各行のキーを1回だけ評価する', () => {
    const rows = [1, 2, 3, 4];
    const evaluated: number[] = [];

    groupRowsBy(rows, (row) => {
      evaluated.push(row);
      return row % 2;
    });

    expect(evaluated).toEqual(rows);
  });

  it('空入力ではキーを評価せず空のMapを返す', () => {
    let evaluationCount = 0;

    const groups = groupRowsBy([], () => {
      evaluationCount += 1;
      return 'unused';
    });

    expect(groups.size).toBe(0);
    expect(evaluationCount).toBe(0);
  });
});
