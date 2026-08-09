import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSessionFromSavedLotteryForLifecycle,
  getLotteryResults,
  listEventSavedLotteryResults,
  replaceLotteryResults,
  saveLotteryResult,
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
  it('現在セッションの抽選結果を内部Xユーザー名で取得する', async () => {
    await expect(getLotteryResults()).resolves.toEqual([
      { is_guaranteed: 1, x_id: 'sample' },
    ]);
  });

  it('形式不正な保存値は自動補正せず、前後空白だけを除いて返す', async () => {
    mockState.sessionDb = {
      execute: vi.fn(async () => ({})),
      select: vi.fn(async () => [{ is_guaranteed: 0, x_id: ' invalid value ' }]),
    };

    await expect(getLotteryResults()).resolves.toEqual([
      { is_guaranteed: 0, x_id: 'invalid value' },
    ]);
  });

  it('抽選結果の全置換 payload を backend command に渡す', async () => {
    await replaceLotteryResults(
      [{ x_id: 'sample', is_guaranteed: true }],
      4,
      SESSION_CONTEXT,
    );

    expect(invokeMock).toHaveBeenCalledWith('replace_lottery_results_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      rows: [{ x_id: 'sample', is_guaranteed: true }],
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
      [{ x_id: 'sample', is_guaranteed: true }],
      4,
      SESSION_CONTEXT,
    );
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const save = saveLotteryResult('抽選結果', SESSION_CONTEXT);
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    finishReplacement?.();
    await expect(Promise.all([replacement, save])).resolves.toEqual([undefined, 99]);
    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
      'replace_lottery_results_atomic',
      'save_lottery_result_atomic',
    ]);
  });
});

describe('saved lottery result operations', () => {
  it('イベント共有DBに固定した抽選結果一覧を backend から取得する', async () => {
    const summaries = [{
      savedResultId: 10,
      label: '抽選結果',
      matchingTypeCode: 'M002' as const,
      lotteryCount: 1,
      guaranteedCount: 1,
      winnerCount: 2,
      createdAt: '2026-06-19 12:00:00',
    }];
    invokeMock.mockResolvedValueOnce(summaries);

    await expect(listEventSavedLotteryResults('Sample Event')).resolves.toEqual(summaries);
    expect(invokeMock).toHaveBeenCalledWith('list_event_saved_lottery_results', {
      eventName: 'Sample Event',
    });
  });

  it('保存済み抽選結果から読取専用セッションを作成する', async () => {
    invokeMock.mockResolvedValueOnce('20260619120000');

    await expect(createSessionFromSavedLotteryForLifecycle('Sample Event', {
      savedResultId: 10,
    })).resolves.toBe('20260619120000');
    expect(invokeMock).toHaveBeenCalledWith('create_session_from_saved_lottery_atomic', {
      eventName: 'Sample Event',
      savedResultId: 10,
    });
  });

  it('保存済み抽選結果 payload を backend command に渡して ID を返す', async () => {
    const resultId = await saveLotteryResult('抽選結果', SESSION_CONTEXT);

    expect(resultId).toBe(99);
    expect(invokeMock).toHaveBeenCalledWith('save_lottery_result_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      label: '抽選結果',
    });
  });
});
