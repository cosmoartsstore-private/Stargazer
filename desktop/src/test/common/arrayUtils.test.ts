import { afterEach, describe, expect, it, vi } from 'vitest';
import { shuffleArray } from '@/common/arrayUtils';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shuffleArray', () => {
  it('入力配列を変更せず、同じ要素を持つ配列を返す', () => {
    const input = [1, 2, 3, 4];
    const result = shuffleArray(input);

    expect(input).toEqual([1, 2, 3, 4]);
    expect([...result].sort()).toEqual([1, 2, 3, 4]);
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
