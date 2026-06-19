import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserBean } from '@/common/types/entities';
import { loadApplicants, persistApplicants } from './applicantRepository';

interface FakeDb {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
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
  return {
    execute: vi.fn(),
    select: vi.fn(async <T>(query: string): Promise<T> => {
      if (query.startsWith('SELECT * FROM applicants')) {
        return [
          { id: 1, x_id: '@sample_user', name: 'Sample User', vrc_url: null, is_guaranteed: 1 },
        ] as T;
      }
      if (query.startsWith('SELECT preference_order')) {
        return [
          { preference_order: 0, cast_name: 'Cast A' },
          { preference_order: 2, cast_name: 'Cast C' },
        ] as T;
      }
      return [
        { field_key: '__preference_mode', field_value: 'flat' },
        { field_key: '備考', field_value: 'メモ' },
      ] as T;
    }),
  };
}

beforeEach(() => {
  mockState.sessionDb = createDb();
  mockState.eventName = 'Sample Event';
  mockState.timestamp = '20260618120000';
  invokeMock.mockReset();
});

describe('loadApplicants', () => {
  it('応募者、希望キャスト、追加列を UserBean に復元する', async () => {
    const users = await loadApplicants();

    expect(users).toEqual<UserBean[]>([
      {
        name: 'Sample User',
        x_id: '@sample_user',
        vrc_url: undefined,
        is_guaranteed: true,
        casts: ['Cast A', 'Cast C'],
        preference_mode: 'flat',
        raw_extra: [{ key: '備考', value: 'メモ' }],
      },
    ]);
  });
});

describe('persistApplicants', () => {
  it('応募者一覧を backend command 用 payload に正規化して渡す', async () => {
    await persistApplicants([
      {
        name: 'Sample User',
        x_id: '@sample_user',
        vrc_url: 'https://vrchat.com/home/user/usr_sample_user',
        is_guaranteed: true,
        casts: ['Cast A', '', 'Cast C'],
        preference_mode: 'ranked',
        raw_extra: [{ key: '備考', value: 'メモ' }, { key: '', value: 'skip' }, 'invalid'],
      },
    ]);

    expect(invokeMock).toHaveBeenCalledWith('persist_applicants_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      users: [
        {
          name: 'Sample User',
          x_id: '@sample_user',
          vrc_url: 'https://vrchat.com/home/user/usr_sample_user',
          casts: ['Cast A', '', 'Cast C'],
          preference_mode: 'ranked',
          is_guaranteed: true,
          raw_extra: [{ key: '備考', value: 'メモ' }],
        },
      ],
    });
  });

  it('省略値と null 値を backend command 用に補完する', async () => {
    await persistApplicants([
      {
        name: '',
        x_id: '@sample_user',
        casts: [],
        raw_extra: [{ key: '備考', value: null }],
      },
    ]);

    expect(invokeMock).toHaveBeenCalledWith('persist_applicants_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      users: [
        {
          name: null,
          x_id: '@sample_user',
          vrc_url: null,
          casts: [],
          preference_mode: 'ranked',
          is_guaranteed: false,
          raw_extra: [{ key: '備考', value: null }],
        },
      ],
    });
  });

  it('セッション未オープン時は保存 command を呼ばない', async () => {
    mockState.timestamp = null;

    await expect(persistApplicants([])).rejects.toThrow('取込セッションが開かれていません。');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
