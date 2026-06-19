import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserBean } from '@/common/types/entities';
import {
  buildLotteryPersistenceRows,
  countGuaranteedPersistenceRows,
  restoreLotteryWinners,
  summarizeLotteryPersistenceRows,
  type LotteryRestoreRow,
} from './lottery-result-persistence';

interface FakeDb {
  select: ReturnType<typeof vi.fn>;
}

const mockState = vi.hoisted(() => ({
  sessionDb: null as FakeDb | null,
}));

vi.mock('@/db/database', () => ({
  getSessionDb: () => {
    if (!mockState.sessionDb) throw new Error('session db is not set');
    return mockState.sessionDb;
  },
}));

function user(name: string, xId: string, isGuaranteed?: boolean): UserBean {
  return {
    name,
    x_id: xId,
    casts: ['Cast A'],
    is_guaranteed: isGuaranteed,
    raw_extra: [],
  };
}

function createDb(rows = [
  { id: 10, x_id: '@sample_a' },
  { id: 20, x_id: '@sample_b' },
  { id: 30, x_id: '@sample_c' },
]): FakeDb {
  return {
    select: vi.fn(async () => rows),
  };
}

beforeEach(() => {
  mockState.sessionDb = createDb();
});

describe('buildLotteryPersistenceRows', () => {
  it('当選者の X ID を現在セッションの applicant_id に変換する', async () => {
    const rows = await buildLotteryPersistenceRows([
      user('Sample A', '@sample_a', true),
      user('Missing', '@missing_user', true),
      user('Sample B', '@sample_b'),
    ]);

    expect(rows).toEqual([
      { applicant_id: 10, is_guaranteed: true },
      { applicant_id: 20, is_guaranteed: false },
    ]);
    expect(mockState.sessionDb?.select).toHaveBeenCalledWith('SELECT id, x_id FROM applicants');
  });

  it('同じ応募者が複数回含まれる場合は最初の1件だけを保存対象にする', async () => {
    const rows = await buildLotteryPersistenceRows([
      user('Sample A', '@sample_a'),
      user('Sample A Again', '@sample_a', true),
    ]);

    expect(rows).toEqual([
      { applicant_id: 10, is_guaranteed: false },
    ]);
  });
});

describe('countGuaranteedPersistenceRows', () => {
  it('保存対象行だけを基準に確定枠当選数を数える', () => {
    expect(countGuaranteedPersistenceRows([
      { applicant_id: 10, is_guaranteed: false },
      { applicant_id: 20, is_guaranteed: true },
      { applicant_id: 30, is_guaranteed: true },
    ])).toBe(2);
  });
});

describe('summarizeLotteryPersistenceRows', () => {
  it('保存対象行から抽選当選・確定枠・合計の件数を算出する', async () => {
    const rows = await buildLotteryPersistenceRows([
      user('Sample A', '@sample_a'),
      user('Sample A Again', '@sample_a', true),
      user('Sample B', '@sample_b', true),
    ]);

    expect(summarizeLotteryPersistenceRows(rows)).toEqual({
      lotteryCount: 1,
      guaranteedCount: 1,
      winnerCount: 2,
    });
  });
});

describe('restoreLotteryWinners', () => {
  it('保存済み applicant_id 行を現在の応募者一覧へ保存順で復元する', async () => {
    const applicants = [
      user('Sample A', '@sample_a'),
      user('Sample B', '@sample_b', true),
      user('Sample C', '@sample_c'),
    ];
    const persistedRows: LotteryRestoreRow[] = [
      { applicant_id: 20, is_guaranteed: 0 },
      { applicant_id: 10, is_guaranteed: 1 },
    ];

    const restored = await restoreLotteryWinners(persistedRows, applicants);

    expect(restored.map((row) => row.x_id)).toEqual(['@sample_b', '@sample_a']);
    expect(restored.map((row) => row.is_guaranteed)).toEqual([false, true]);
    expect(applicants[1].is_guaranteed).toBe(true);
    expect(mockState.sessionDb?.select).toHaveBeenCalledWith('SELECT id, x_id FROM applicants');
  });

  it('DB に存在しない applicant_id と現在一覧に存在しない X ID は復元しない', async () => {
    mockState.sessionDb = createDb([
      { id: 10, x_id: '@sample_a' },
      { id: 40, x_id: '@archived_user' },
    ]);

    const restored = await restoreLotteryWinners([
      { applicant_id: 999, is_guaranteed: 1 },
      { applicant_id: 40, is_guaranteed: 1 },
      { applicant_id: 10, is_guaranteed: 0 },
    ], [user('Sample A', '@sample_a', true)]);

    expect(restored).toEqual([
      {
        name: 'Sample A',
        x_id: '@sample_a',
        casts: ['Cast A'],
        is_guaranteed: false,
        raw_extra: [],
      },
    ]);
  });
});
