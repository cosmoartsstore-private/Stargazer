import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteSetting, getSetting, setSetting } from './settingsRepository';

interface ExecuteCall {
  query: string;
  values?: unknown[];
}

interface SelectCall {
  query: string;
  values?: unknown[];
}

interface FakeDb {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  executeCalls: ExecuteCall[];
  selectCalls: SelectCall[];
}

const mockState = vi.hoisted(() => ({
  sharedDb: null as FakeDb | null,
}));

vi.mock('../database', () => ({
  getSharedDb: () => {
    if (!mockState.sharedDb) throw new Error('shared db is not set');
    return mockState.sharedDb;
  },
}));

function createDb(rows: Array<{ value: string }> = [{ value: '保存済みテンプレート' }]): FakeDb {
  const executeCalls: ExecuteCall[] = [];
  const selectCalls: SelectCall[] = [];
  return {
    executeCalls,
    selectCalls,
    execute: vi.fn(async (query: string, values?: unknown[]) => {
      executeCalls.push({ query, values });
      return {};
    }),
    select: vi.fn(async <T>(query: string, values?: unknown[]): Promise<T> => {
      selectCalls.push({ query, values });
      return rows as T;
    }),
  };
}

beforeEach(() => {
  mockState.sharedDb = createDb();
});

describe('settings read operations', () => {
  it('共有 DB から指定 key の設定値を取得する', async () => {
    await expect(getSetting('tweet_template')).resolves.toBe('保存済みテンプレート');

    expect(mockState.sharedDb?.selectCalls).toEqual([
      {
        query: 'SELECT value FROM settings WHERE key = ?',
        values: ['tweet_template'],
      },
    ]);
  });

  it('設定値が未保存の場合は null を返す', async () => {
    mockState.sharedDb = createDb([]);

    await expect(getSetting('tweet_template')).resolves.toBeNull();
  });

  it('空文字の設定値は保存済み値として返す', async () => {
    mockState.sharedDb = createDb([{ value: '' }]);

    await expect(getSetting('tweet_template')).resolves.toBe('');
  });
});

describe('settings write operations', () => {
  it('指定 key の設定値を upsert する', async () => {
    await setSetting('tweet_template', '本文テンプレート');

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query:
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['tweet_template', '本文テンプレート'],
      },
    ]);
  });

  it('空文字の設定値も upsert する', async () => {
    await setSetting('tweet_template', '');

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query:
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['tweet_template', ''],
      },
    ]);
  });

  it('指定 key の設定値を削除する', async () => {
    await deleteSetting('tweet_template');

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query: 'DELETE FROM settings WHERE key = ?',
        values: ['tweet_template'],
      },
    ]);
  });
});
