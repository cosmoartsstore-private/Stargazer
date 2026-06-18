import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserBean } from '@/common/types/entities';
import {
  assignWithHungarian,
  buildRotation,
  getPreferenceScore,
  shuffleArray,
} from './matching-hungarian-engine';

const rankedUser: UserBean = {
  name: 'Alice',
  x_id: '@alice',
  casts: ['Cast A', 'Cast B', 'Cast C', 'Cast D'],
  raw_extra: [],
};

describe('getPreferenceScore', () => {
  it('ranked 希望では第1から第3希望だけに重みを付ける', () => {
    expect(getPreferenceScore(rankedUser, 'Cast A')).toBe(90);
    expect(getPreferenceScore(rankedUser, 'Cast B')).toBe(70);
    expect(getPreferenceScore(rankedUser, 'Cast C')).toBe(50);
    expect(getPreferenceScore(rankedUser, 'Cast D')).toBe(0);
    expect(getPreferenceScore(rankedUser, 'Other')).toBe(0);
  });

  it('flat 希望では候補内キャストを同じ点数にする', () => {
    const flatUser = { ...rankedUser, preference_mode: 'flat' as const };

    expect(getPreferenceScore(flatUser, 'Cast A')).toBe(50);
    expect(getPreferenceScore(flatUser, 'Cast D')).toBe(50);
    expect(getPreferenceScore(flatUser, 'Other')).toBe(0);
  });
});

describe('shuffleArray', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('入力配列を変更せず、同じ要素を持つ配列を返す', () => {
    const input = ['a', 'b', 'c'];
    const shuffled = shuffleArray(input);

    expect(input).toEqual(['a', 'b', 'c']);
    expect([...shuffled].sort()).toEqual(['a', 'b', 'c']);
  });

  it('Fisher-Yates 法の交換順に従って乱数を使用する', () => {
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.75)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.6);

    expect(shuffleArray([1, 2, 3, 4])).toEqual([3, 2, 1, 4]);
    expect(randomSpy).toHaveBeenCalledTimes(3);
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
