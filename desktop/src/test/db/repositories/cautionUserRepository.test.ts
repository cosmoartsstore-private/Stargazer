import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CautionUser } from '@/features/matching/types/matching-system-types';
import {
  deleteCautionUserByAccountId,
  getAllCautionUsers,
  upsertCautionUser,
} from '@/db/repositories/cautionUserRepository';

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
  notes: string | null;
  ng_cast_count: number;
  registered_at: string;
}

const mockState = vi.hoisted(() => ({
  sharedDb: null as FakeDb | null,
  getSharedDbCalls: 0,
}));

vi.mock('@/db/database', () => ({
  getCurrentEventName: () => 'Sample Event',
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
    notes: '運営内メモ',
    ng_cast_count: 2,
    registered_at: '2026-06-19T12:00:00.000Z',
    ...overrides,
  };
}

function sampleUser(overrides: Partial<CautionUser> = {}): CautionUser {
  return {
    username: 'Sample User',
    accountId: 'sample_user',
    notes: '運営内メモ',
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
      if (
        normalizeSql(query)
        === "SELECT account_id FROM caution_users WHERE LOWER(LTRIM(TRIM(account_id), '@')) = LOWER(?)"
      ) {
        const accountId = String(values?.[0] ?? '').trim().replace(/^@/, '').toLowerCase();
        return rows
          .filter(
            (row) => row.account_id.trim().replace(/^@/, '').toLowerCase() === accountId,
          )
          .map((row) => ({ account_id: row.account_id })) as T;
      }
      return rows as T;
    }),
  };
}

beforeEach(() => {
  mockState.sharedDb = createDb();
  mockState.getSharedDbCalls = 0;
});

describe('caution user read operations', () => {
  it('共有 DB の要注意人物を新しい登録順で取得する', async () => {
    await expect(getAllCautionUsers()).resolves.toEqual([sampleUser()]);

    const calls = mockState.sharedDb?.selectCalls ?? [];
    expect(calls).toHaveLength(1);
    expect(normalizeSql(calls[0].query)).toBe(
      'SELECT username, account_id, notes, ng_cast_count, registered_at FROM caution_users ORDER BY registered_at DESC',
    );
  });
});

describe('caution user write operations', () => {
  it('同じ表記の既存要注意人物を更新する', async () => {
    mockState.sharedDb = createDb([sampleRow({ account_id: 'sample_user' })]);

    await upsertCautionUser(sampleUser());

    const calls = mockState.sharedDb?.executeCalls ?? [];
    expect(calls).toHaveLength(1);
    expect(normalizeSql(calls[0].query)).toBe(
      'UPDATE caution_users SET username = ?, account_id = ?, notes = ?, ng_cast_count = ? WHERE account_id = ?',
    );
    expect(calls[0].values).toEqual([
      'Sample User',
      'sample_user',
      '運営内メモ',
      2,
      'sample_user',
    ]);
    expect(mockState.sharedDb?.selectCalls).toEqual([{
      query: `SELECT account_id FROM caution_users
   WHERE LOWER(LTRIM(TRIM(account_id), '@')) = LOWER(?)`,
      values: ['sample_user'],
    }]);
  });

  it('新しい要注意人物を入力時の大文字小文字を保った内部usernameで追加する', async () => {
    mockState.sharedDb = createDb([]);

    await upsertCautionUser(sampleUser({
      accountId: 'Sample_User',
    }));

    expect(mockState.sharedDb?.executeCalls[0]?.values).toEqual([
      'Sample User',
      'Sample_User',
      '運営内メモ',
      2,
      '2026-06-19T12:00:00.000Z',
    ]);
    expect(normalizeSql(mockState.sharedDb?.executeCalls[0]?.query ?? '')).toBe(
      'INSERT INTO caution_users (username, account_id, notes, ng_cast_count, registered_at) VALUES (?, ?, ?, ?, ?)',
    );
  });

  it('簡易更新では既存の補足・NG人数・登録日時を上書きしない', async () => {
    await upsertCautionUser({
      username: 'Updated User',
      accountId: 'sample_user',
    });

    const call = mockState.sharedDb?.executeCalls[0];
    expect(normalizeSql(call?.query ?? '')).toBe(
      'UPDATE caution_users SET username = ?, account_id = ? WHERE account_id = ?',
    );
    expect(call?.values).toEqual([
      'Updated User',
      'sample_user',
      '@sample_user',
    ]);
  });

  it('大小文字と先頭@が異なる既存IDを同じユーザーとして更新する', async () => {
    mockState.sharedDb = createDb([sampleRow({ account_id: '@Sample_User' })]);

    await upsertCautionUser(sampleUser({ accountId: 'sample_user' }));

    expect(normalizeSql(mockState.sharedDb.executeCalls[0]?.query ?? '')).toBe(
      'UPDATE caution_users SET username = ?, account_id = ?, notes = ?, ng_cast_count = ? WHERE account_id = ?',
    );
    expect(mockState.sharedDb.executeCalls[0]?.values).toEqual([
      'Sample User',
      'sample_user',
      '運営内メモ',
      2,
      '@Sample_User',
    ]);
  });

  it('X IDとして解釈できない値は保存しない', async () => {
    await expect(upsertCautionUser(sampleUser({
      accountId: 'https://example.com/sample_user',
    }))).rejects.toThrow('X IDは username または @username 形式で入力してください。');

    expect(mockState.sharedDb?.selectCalls).toEqual([]);
    expect(mockState.sharedDb?.executeCalls).toEqual([]);
  });

  it('先頭@と大小文字を除いて一致する要注意人物を削除する', async () => {
    await deleteCautionUserByAccountId('@SAMPLE_USER');

    const call = mockState.sharedDb?.executeCalls[0];
    expect(normalizeSql(call?.query ?? '')).toBe(
      "DELETE FROM caution_users WHERE LOWER(LTRIM(TRIM(account_id), '@')) = LOWER(?)",
    );
    expect(call?.values).toEqual(['SAMPLE_USER']);
  });

});
