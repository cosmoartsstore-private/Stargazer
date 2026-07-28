import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserBean } from '@/common/types/entities';
import { drawLotteryWinners, formatSavedLotteryLabel } from '@/features/lottery/services/lottery-draw';

const arrayUtilsMocks = vi.hoisted(() => ({
  shuffleArray: vi.fn(),
}));

vi.mock('@/common/arrayUtils', () => arrayUtilsMocks);

function applicant(name: string, xId: string): UserBean {
  return { name, x_id: xId, casts: [], raw_extra: [] };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('drawLotteryWinners', () => {
  it('確定当選者を抽選候補から除外し、確定枠の後ろへ抽選結果を結合する', () => {
    const applicantA = applicant('応募者A', '@applicant_a');
    const applicantB = applicant('応募者B', '@applicant_b');
    const applicantC = applicant('応募者C', '@applicant_c');
    const guaranteedB = { ...applicantB };
    arrayUtilsMocks.shuffleArray.mockImplementation((items: readonly UserBean[]) => [...items].reverse());

    const winners = drawLotteryWinners(
      [applicantA, applicantB, applicantC],
      [guaranteedB],
      1,
    );

    expect(arrayUtilsMocks.shuffleArray).toHaveBeenCalledWith([applicantA, applicantC]);
    expect(winners).toEqual([
      { ...guaranteedB, is_guaranteed: true },
      { ...applicantC, is_guaranteed: false },
    ]);
    expect(winners[0]).not.toBe(guaranteedB);
    expect(winners[1]).not.toBe(applicantC);
    expect(applicantC.is_guaranteed).toBeUndefined();
  });

  it('抽選人数が候補数を超える場合は候補全員を返す', () => {
    const applicantA = applicant('応募者A', '@applicant_a');
    const applicantB = applicant('応募者B', '@applicant_b');
    arrayUtilsMocks.shuffleArray.mockImplementation((items: readonly UserBean[]) => [...items]);

    expect(drawLotteryWinners([applicantA, applicantB], [], 10)).toEqual([
      { ...applicantA, is_guaranteed: false },
      { ...applicantB, is_guaranteed: false },
    ]);
  });
});

describe('formatSavedLotteryLabel', () => {
  it('保存日時と当選人数を含む表示名を生成する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T09:05:00'));

    expect(formatSavedLotteryLabel(12)).toBe('抽選結果（2026/06/08 09:05・12名）');
  });
});
