import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CautionUser } from '@/features/matching/types/matching-system-types';
import {
  deleteCautionUserByAccountId,
  getAllCautionUsers,
  persistAllCautionUsers,
  upsertCautionUser,
} from './cautionUserRepository';

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

interface CautionRow {
  id: number;
  username: string;
  account_id: string;
  registration_type: string;
  reason: string | null;
  notes: string | null;
  ng_cast_count: number;
  registered_at: string;
}

const mockState = vi.hoisted(() => ({
  sharedDb: null as FakeDb | null,
  getSharedDbCalls: 0,
}));

vi.mock('../database', () => ({
  getSharedDb: () => {
    mockState.getSharedDbCalls += 1;
    if (!mockState.sharedDb) throw new Error('shared db is not set');
    return mockState.sharedDb;
  },
}));

function normalizeSql(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

function sampleRow(overrides: Partial<CautionRow> = {}): CautionRow {
  return {
    id: 1,
    username: 'Sample User',
    account_id: '@sample_user',
    registration_type: 'manual',
    reason: '複数キャストのNG対象',
    notes: '確認済み',
    ng_cast_count: 2,
    registered_at: '2026-06-19T12:00:00.000Z',
    ...overrides,
  };
}

function sampleUser(overrides: Partial<CautionUser> = {}): CautionUser {
  return {
    username: 'Sample User',
    accountId: '@sample_user',
    registrationType: 'manual',
    reason: '複数キャストのNG対象',
    notes: '確認済み',
    ngCastCount: 2,
    registeredAt: '2026-06-19T12:00:00.000Z',
    ...overrides,
  };
}

function createDb(rows: CautionRow[] = [sampleRow()]): FakeDb {
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
  mockState.getSharedDbCalls = 0;
  vi.useRealTimers();
});

describe('caution user read operations', () => {
  it('共有 DB の要注意人物を新しい登録順で取得する', async () => {
    await expect(getAllCautionUsers()).resolves.toEqual([sampleUser()]);

    expect(mockState.sharedDb?.selectCalls).toEqual([
      {
        query: 'SELECT * FROM caution_users ORDER BY registered_at DESC',
        values: undefined,
      },
    ]);
  });

  it('null の補足情報は undefined に戻す', async () => {
    mockState.sharedDb = createDb([
      sampleRow({
        reason: null,
        notes: null,
        registration_type: 'auto',
        ng_cast_count: 3,
      }),
    ]);

    await expect(getAllCautionUsers()).resolves.toEqual([
      sampleUser({
        registrationType: 'auto',
        reason: undefined,
        notes: undefined,
        ngCastCount: 3,
      }),
    ]);
  });
});

describe('caution user write operations', () => {
  it('要注意人物を account_id をキーに upsert する', async () => {
    await upsertCautionUser(sampleUser());

    const calls = mockState.sharedDb?.executeCalls ?? [];
    expect(calls).toHaveLength(1);
    expect(normalizeSql(calls[0].query)).toBe(
      'INSERT INTO caution_users (username, account_id, registration_type, reason, notes, ng_cast_count, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET username = excluded.username, registration_type = excluded.registration_type, reason = excluded.reason, notes = excluded.notes, ng_cast_count = excluded.ng_cast_count',
    );
    expect(calls[0].values).toEqual([
      'Sample User',
      '@sample_user',
      'manual',
      '複数キャストのNG対象',
      '確認済み',
      2,
      '2026-06-19T12:00:00.000Z',
    ]);
  });

  it('未指定の任意項目を null と既定値に補完して upsert する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T09:00:00.000Z'));

    await upsertCautionUser(sampleUser({
      reason: undefined,
      notes: undefined,
      ngCastCount: undefined,
      registeredAt: undefined,
    }));

    expect(mockState.sharedDb?.executeCalls[0]?.values).toEqual([
      'Sample User',
      '@sample_user',
      'manual',
      null,
      null,
      0,
      '2026-06-20T09:00:00.000Z',
    ]);
  });

  it('account_id が一致する要注意人物を削除する', async () => {
    await deleteCautionUserByAccountId('@sample_user');

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query: 'DELETE FROM caution_users WHERE account_id = ?',
        values: ['@sample_user'],
      },
    ]);
  });

  it('要注意人物リストを全置換する', async () => {
    await persistAllCautionUsers([
      sampleUser({ accountId: '@sample_user_a', username: 'Sample User A' }),
      sampleUser({
        accountId: '@sample_user_b',
        username: 'Sample User B',
        registrationType: 'auto',
        ngCastCount: 4,
      }),
    ]);

    const calls = mockState.sharedDb?.executeCalls ?? [];
    expect(calls.map((call) => normalizeSql(call.query))).toEqual([
      'DELETE FROM caution_users',
      'INSERT INTO caution_users (username, account_id, registration_type, reason, notes, ng_cast_count, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET username = excluded.username, registration_type = excluded.registration_type, reason = excluded.reason, notes = excluded.notes, ng_cast_count = excluded.ng_cast_count',
      'INSERT INTO caution_users (username, account_id, registration_type, reason, notes, ng_cast_count, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET username = excluded.username, registration_type = excluded.registration_type, reason = excluded.reason, notes = excluded.notes, ng_cast_count = excluded.ng_cast_count',
    ]);
    expect(calls[1].values?.slice(0, 3)).toEqual(['Sample User A', '@sample_user_a', 'manual']);
    expect(calls[2].values?.slice(0, 6)).toEqual([
      'Sample User B',
      '@sample_user_b',
      'auto',
      '複数キャストのNG対象',
      '確認済み',
      4,
    ]);
    expect(mockState.getSharedDbCalls).toBe(1);
  });

  it('空配列への全置換では既存行の削除だけ行う', async () => {
    await persistAllCautionUsers([]);

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query: 'DELETE FROM caution_users',
        values: undefined,
      },
    ]);
  });
});
