import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLotteryResults,
  getLotteryResults,
  getSavedLotteryResults,
  listSavedLotteryRuns,
  replaceLotteryResults,
  saveLotteryRun,
} from './lotteryRepository';

interface ExecuteCall {
  query: string;
  values?: unknown[];
}

interface FakeDb {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  calls: ExecuteCall[];
  selectQueries: string[];
}

const invokeMock = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({
  sessionDb: null as FakeDb | null,
  eventName: 'Sample Event' as string | null,
  timestamp: '20260618120000' as string | null,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('../database', () => ({
  getSessionDb: () => {
    if (!mockState.sessionDb) throw new Error('session db is not set');
    return mockState.sessionDb;
  },
  getCurrentEventName: () => mockState.eventName,
  getCurrentSessionTimestamp: () => mockState.timestamp,
}));

function createDb(): FakeDb {
  const calls: ExecuteCall[] = [];
  const selectQueries: string[] = [];
  return {
    calls,
    selectQueries,
    execute: vi.fn(async (query: string, values?: unknown[]) => {
      calls.push({ query, values });
      return {};
    }),
    select: vi.fn(async <T>(query: string, values?: unknown[]): Promise<T> => {
      selectQueries.push(query);
      if (query.startsWith('SELECT applicant_id, is_guaranteed FROM lottery_results')) {
        return [{ applicant_id: 1, is_guaranteed: 1 }] as T;
      }
      if (query.includes('FROM lottery_saved_runs') && query.includes('ORDER BY id DESC')) {
        return [{
          id: 10,
          label: '抽選結果',
          matching_type_code: 'M002',
          lottery_count: 5,
          guaranteed_count: 1,
          winner_count: 2,
          created_at: '2026-06-18T10:00:00',
        }] as T;
      }
      if (query.includes('FROM lottery_saved_run_results')) {
        return [{ applicant_id: values?.[0], is_guaranteed: 0, result_order: 0 }] as T;
      }
      return [] as T;
    }),
  };
}

beforeEach(() => {
  mockState.sessionDb = createDb();
  mockState.eventName = 'Sample Event';
  mockState.timestamp = '20260618120000';
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(99);
});

describe('lottery result operations', () => {
  it('現在セッションの抽選結果を取得する', async () => {
    await expect(getLotteryResults()).resolves.toEqual([{ applicant_id: 1, is_guaranteed: 1 }]);
  });

  it('抽選結果の全置換 payload を backend command に渡す', async () => {
    await replaceLotteryResults([{ applicant_id: 1, is_guaranteed: true }]);

    expect(invokeMock).toHaveBeenCalledWith('replace_lottery_results_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      rows: [{ applicant_id: 1, is_guaranteed: true }],
    });
  });

  it('現在セッションの抽選結果削除 command を呼ぶ', async () => {
    await clearLotteryResults();

    expect(invokeMock).toHaveBeenCalledWith('clear_lottery_results_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
    });
  });
});

describe('saved lottery run operations', () => {
  it('保存済み抽選結果一覧を取得する前に追加テーブルを確保する', async () => {
    const db = createDb();
    mockState.sessionDb = db;

    const rows = await listSavedLotteryRuns();

    expect(rows[0]?.id).toBe(10);
    expect(db.calls.map((call) => call.query.trim().split(/\s+/).slice(0, 5).join(' '))).toEqual([
      'CREATE TABLE IF NOT EXISTS',
      'CREATE TABLE IF NOT EXISTS',
      'CREATE INDEX IF NOT EXISTS',
    ]);
  });

  it('保存済み抽選結果の当選者行を保存順で取得する', async () => {
    const rows = await getSavedLotteryResults(99);

    expect(rows).toEqual([{ applicant_id: 99, is_guaranteed: 0, result_order: 0 }]);
  });

  it('保存済み抽選結果 payload を backend command に渡して ID を返す', async () => {
    const runId = await saveLotteryRun({
      label: '抽選結果',
      matchingTypeCode: 'M002',
      lotteryCount: 5,
      guaranteedCount: 1,
      rows: [{ applicant_id: 1, is_guaranteed: true }],
    });

    expect(runId).toBe(99);
    expect(invokeMock).toHaveBeenCalledWith('save_lottery_run_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      label: '抽選結果',
      matchingTypeCode: 'M002',
      lotteryCount: 5,
      guaranteedCount: 1,
      rows: [{ applicant_id: 1, is_guaranteed: true }],
    });
  });

  it('セッション未オープン時は保存 command を呼ばない', async () => {
    mockState.timestamp = null;

    await expect(saveLotteryRun({
      label: '抽選結果',
      matchingTypeCode: 'M002',
      lotteryCount: 5,
      guaranteedCount: 1,
      rows: [],
    })).rejects.toThrow('取込セッションが開かれていません。');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
