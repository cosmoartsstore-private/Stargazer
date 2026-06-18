import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatSavedLotteryLabel, shuffle } from './lottery-draw';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('shuffle', () => {
  it('入力配列を変更せず、同じ要素を持つ抽選順配列を返す', () => {
    const input = [1, 2, 3, 4];
    const result = shuffle(input);

    expect(input).toEqual([1, 2, 3, 4]);
    expect([...result].sort()).toEqual([1, 2, 3, 4]);
  });

  it('Fisher-Yates 法の交換順に従って乱数を使用する', () => {
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.75)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.6);

    expect(shuffle([1, 2, 3, 4])).toEqual([3, 2, 1, 4]);
    expect(randomSpy).toHaveBeenCalledTimes(3);
  });
});

describe('formatSavedLotteryLabel', () => {
  it('現在日時と当選人数から保存済み抽選結果の表示名を生成する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T09:05:00'));

    expect(formatSavedLotteryLabel(12)).toBe('抽選結果 2026/06/08 09:05（12名）');
  });
});
