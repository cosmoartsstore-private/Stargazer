import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLotteryResults,
  getSavedLotteryResults,
  listSavedLotteryRuns,
  replaceLotteryResults,
  restoreSavedLotteryRun,
  saveLotteryRun,
} from '@/db/repositories/lotteryRepository';

interface FakeDb {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
}

const invokeMock = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({
  sessionDb: null as FakeDb | null,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/db/database', () => ({
  getSessionDb: () => {
    if (!mockState.sessionDb) throw new Error('session db is not set');
    return mockState.sessionDb;
  },
}));

const SESSION_CONTEXT = {
  eventName: 'Sample Event',
  timestamp: '20260618120000',
  generation: 1,
};

function createDb(): FakeDb {
  return {
    execute: vi.fn(async () => ({})),
    select: vi.fn(async <T>(query: string): Promise<T> => {
      if (query.includes('FROM lottery_results lr')) {
        return [{ is_guaranteed: 1, x_id: '@sample' }] as T;
      }
      if (query.includes('FROM lottery_saved_runs') && query.includes('ORDER BY id DESC')) {
        return [{
          id: 10,
          label: '抽選結果',
          matching_type_code: 'M002',
          lottery_count: 1,
          guaranteed_count: 1,
          winner_count: 2,
          created_at: '2026-06-19 12:00:00',
        }] as T;
      }
      if (query.includes('FROM lottery_saved_run_results')) {
        return [{
          is_guaranteed: 0,
          x_id: '@sample',
        }] as T;
      }
      return [] as T;
    }),
  };
}

beforeEach(() => {
  mockState.sessionDb = createDb();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(99);
});

describe('lottery result operations', () => {
  it('現在セッションの抽選結果を取得する', async () => {
    await expect(getLotteryResults()).resolves.toEqual([
      { is_guaranteed: 1, x_id: '@sample' },
    ]);
  });

  it('抽選結果の全置換 payload を backend command に渡す', async () => {
    await replaceLotteryResults(
      [{ x_id: '@sample', is_guaranteed: true }],
      4,
      SESSION_CONTEXT,
    );

    expect(invokeMock).toHaveBeenCalledWith('replace_lottery_results_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      rows: [{ x_id: '@sample', is_guaranteed: true }],
      expectedConditionRevision: 4,
    });
  });

  it('同じセッションへの抽選結果更新と履歴保存を呼出順に実行する', async () => {
    let finishReplacement: (() => void) | undefined;
    invokeMock
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishReplacement = resolve;
      }))
      .mockResolvedValueOnce(99);

    const replacement = replaceLotteryResults(
      [{ x_id: '@sample', is_guaranteed: true }],
      4,
      SESSION_CONTEXT,
    );
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const save = saveLotteryRun('抽選結果', SESSION_CONTEXT);
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    finishReplacement?.();
    await expect(Promise.all([replacement, save])).resolves.toEqual([undefined, 99]);
    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
      'replace_lottery_results_atomic',
      'save_lottery_run_atomic',
    ]);
  });

  it('保存済みrunを期待revision付きで一括復元する', async () => {
    invokeMock.mockResolvedValueOnce({
      matchingTypeCode: 'M002',
      lotteryCount: 4,
    });

    await expect(restoreSavedLotteryRun(
      10,
      5,
      SESSION_CONTEXT,
    )).resolves.toEqual({
      matchingTypeCode: 'M002',
      lotteryCount: 4,
    });

    expect(invokeMock).toHaveBeenCalledWith('restore_lottery_run_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      runId: 10,
      expectedConditionRevision: 5,
    });
  });

});

describe('saved lottery run operations', () => {
  it('migration 済みセッションから保存済み抽選結果一覧を取得する', async () => {
    const db = createDb();
    mockState.sessionDb = db;

    const rows = await listSavedLotteryRuns();

    expect(rows).toEqual([{
      id: 10,
      label: '抽選結果',
      matching_type_code: 'M002',
      lottery_count: 1,
      guaranteed_count: 1,
      winner_count: 2,
      created_at: '2026-06-19 12:00:00',
    }]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining('matching_type_code'));
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('保存済み抽選結果の当選者行を保存順で取得する', async () => {
    const rows = await getSavedLotteryResults(99);

    expect(rows).toEqual([{
      is_guaranteed: 0,
      x_id: '@sample',
    }]);
  });

  it('保存済み抽選結果 payload を backend command に渡して ID を返す', async () => {
    const runId = await saveLotteryRun('抽選結果', SESSION_CONTEXT);

    expect(runId).toBe(99);
    expect(invokeMock).toHaveBeenCalledWith('save_lottery_run_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      label: '抽選結果',
    });
  });
});
