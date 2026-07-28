import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import {
  assignWithHungarian,
  buildRotation,
  getPreferenceScore,
} from '@/features/matching/logics/matching-hungarian-engine';

const rankedUser: UserBean = {
  name: 'Alice',
  x_id: '@alice',
  casts: ['Cast A', 'Cast B', 'Cast C', 'Cast D'],
  raw_extra: [],
};

function cast(name: string, id = 0): CastBean {
  return { id, name, is_present: true };
}

describe('getPreferenceScore', () => {
  it('ranked 希望では第1から第3希望だけに重みを付ける', () => {
    expect(getPreferenceScore(rankedUser, cast('Cast A'))).toBe(90);
    expect(getPreferenceScore(rankedUser, cast('Cast B'))).toBe(70);
    expect(getPreferenceScore(rankedUser, cast('Cast C'))).toBe(50);
    expect(getPreferenceScore(rankedUser, cast('Cast D'))).toBe(0);
    expect(getPreferenceScore(rankedUser, cast('Other'))).toBe(0);
  });

  it('flat 希望では候補内キャストを同じ点数にする', () => {
    const flatUser = { ...rankedUser, preference_mode: 'flat' as const };

    expect(getPreferenceScore(flatUser, cast('Cast A'))).toBe(50);
    expect(getPreferenceScore(flatUser, cast('Cast D'))).toBe(50);
    expect(getPreferenceScore(flatUser, cast('Other'))).toBe(0);
  });

  it('cast_ids がある場合は同名の別IDへ希望点を付けない', () => {
    const idBasedUser: UserBean = {
      ...rankedUser,
      casts: ['同名キャスト'],
      cast_ids: [10],
    };

    expect(getPreferenceScore(idBasedUser, cast('改名後キャスト', 10))).toBe(90);
    expect(getPreferenceScore(idBasedUser, cast('同名キャスト', 11))).toBe(0);
    expect(getPreferenceScore(
      { ...idBasedUser, cast_ids: [null] },
      cast('同名キャスト', 10),
    )).toBe(0);
  });
});

describe('buildRotation', () => {
  it('ローテーション数を最低1に補正して巡回表を作る', () => {
    expect(buildRotation(['A', 'B', 'C'], 0)).toEqual([['A', 'B', 'C']]);
  });

  it('ラウンドごとに先頭を1つずつずらす', () => {
    expect(buildRotation(['A', 'B', 'C'], 3)).toEqual([
      ['A', 'B', 'C'],
      ['B', 'C', 'A'],
      ['C', 'A', 'B'],
    ]);
  });
});

describe('assignWithHungarian', () => {
  it('総得点が最大になるように行へスロットを割り当てる', () => {
    const result = assignWithHungarian(2, ['slot-1', 'slot-2'], (rowIndex, _, slotIndex) => {
      const scores = [
        [1, 10],
        [8, 2],
      ];
      return scores[rowIndex][slotIndex];
    });

    expect(result).toEqual({ assignment: [1, 0], hasInfeasible: false });
  });

  it('実行不能なスロットだけが選ばれる行を検出する', () => {
    const result = assignWithHungarian(1, ['slot-1'], () => Number.NEGATIVE_INFINITY);

    expect(result.assignment).toEqual([0]);
    expect(result.hasInfeasible).toBe(true);
  });
});
