import { describe, expect, it } from 'vitest';
import type { UserBean } from '@/common/types/entities';
import {
  buildLotteryPersistenceRows,
  restoreLotteryWinners,
  type LotteryRestoreRow,
} from '@/features/lottery/services/lottery-result-persistence';

function user(name: string, xId: string, isGuaranteed?: boolean): UserBean {
  return {
    name,
    x_id: xId,
    casts: ['Cast A'],
    is_guaranteed: isGuaranteed,
    raw_extra: [],
  };
}

describe('buildLotteryPersistenceRows', () => {
  it('当選者をDB command用のX ID行へ変換する', () => {
    const rows = buildLotteryPersistenceRows([
      user('Sample A', '@sample_a', true),
      user('Sample B', '@sample_b'),
    ]);

    expect(rows).toEqual([
      { x_id: '@sample_a', is_guaranteed: true },
      { x_id: '@sample_b', is_guaranteed: false },
    ]);
  });

  it('同じ応募者が複数回含まれる場合は保存を拒否する', () => {
    expect(() => buildLotteryPersistenceRows([
      user('Sample A', '@sample_a'),
      user('Sample A Again', '@sample_a', true),
    ])).toThrow('重複しています');
  });
});

describe('restoreLotteryWinners', () => {
  it('JOIN済みのX IDを使って現在の応募者一覧へ保存順で復元する', () => {
    const applicants = [
      user('Sample A', '@sample_a'),
      user('Sample B', '@sample_b', true),
      user('Sample C', '@sample_c'),
    ];
    const persistedRows: LotteryRestoreRow[] = [
      { is_guaranteed: 0, x_id: '@sample_b' },
      { is_guaranteed: 1, x_id: '@sample_a' },
    ];

    const restored = restoreLotteryWinners(persistedRows, applicants);

    expect(restored.map((row) => row.x_id)).toEqual(['@sample_b', '@sample_a']);
    expect(restored.map((row) => row.is_guaranteed)).toEqual([false, true]);
    expect(applicants[1].is_guaranteed).toBe(true);
  });

  it('現在の応募者一覧に存在しないX IDがあれば部分復元しない', () => {
    expect(() => restoreLotteryWinners([
      { is_guaranteed: 1, x_id: '@missing' },
      { is_guaranteed: 1, x_id: '@archived_user' },
      { is_guaranteed: 0, x_id: '@sample_a' },
    ], [user('Sample A', '@sample_a', true)])).toThrow('現在の取込データに存在しません');
  });
});
