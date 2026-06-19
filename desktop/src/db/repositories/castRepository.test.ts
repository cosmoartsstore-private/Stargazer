import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CastBean } from '@/common/types/entities';
import {
  deleteCast,
  getAllCasts,
  getCastCount,
  insertCast,
  persistAllCasts,
  renameCast,
  updateCastAttend,
  updateCastFields,
} from './castRepository';

interface ExecuteCall {
  query: string;
  values?: unknown[];
}

interface FakeDb {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  calls: ExecuteCall[];
}

const invokeMock = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({
  sharedDb: null as FakeDb | null,
  eventName: 'Sample Event' as string | null,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('../database', () => ({
  getSharedDb: () => {
    if (!mockState.sharedDb) throw new Error('shared db is not set');
    return mockState.sharedDb;
  },
  getCurrentEventName: () => mockState.eventName,
}));

function createDb(options?: {
  emptyRelations?: boolean;
  noPresentRows?: boolean;
  nullFields?: boolean;
}): FakeDb {
  const calls: ExecuteCall[] = [];
  return {
    calls,
    execute: vi.fn(async (query: string, values?: unknown[]) => {
      calls.push({ query, values });
      return {};
    }),
    select: vi.fn(async <T>(query: string): Promise<T> => {
      if (query === 'SELECT * FROM casts ORDER BY id') {
        return [
          {
            id: 1,
            name: 'Cast A',
            group_name: options?.nullFields ? null : 'Group 1',
            is_attend: 1,
            photo_data_url: null,
            memo: options?.nullFields ? null : 'memo',
          },
        ] as T;
      }
      if (query === 'SELECT url FROM cast_urls WHERE cast_id = ?') {
        return (options?.emptyRelations ? [] : [{ url: 'https://example.test/profile' }]) as T;
      }
      if (query === 'SELECT username, userid FROM cast_ng_entries WHERE cast_id = ?') {
        return (options?.emptyRelations ? [] : [{ username: 'Sample User', userid: '@sample_user' }]) as T;
      }
      if (query === 'SELECT is_present FROM event_cast_present WHERE cast_id = ?') {
        return (options?.noPresentRows ? [] : [{ is_present: 0 }]) as T;
      }
      if (query === 'SELECT COUNT(*) AS n FROM casts') {
        return [{ n: 3 }] as T;
      }
      return [] as T;
    }),
  };
}

function sampleCast(): CastBean {
  return {
    name: 'Cast A',
    is_present: true,
    group_name: 'Group 1',
    contact_urls: ['https://example.test/profile'],
    ng_entries: [{ username: 'Sample User', accountId: '@sample_user' }],
    memo: 'memo',
  };
}

beforeEach(() => {
  mockState.sharedDb = createDb();
  mockState.eventName = 'Sample Event';
  invokeMock.mockReset();
});

describe('getAllCasts', () => {
  it('関連テーブルとイベント内出席状態を統合して返す', async () => {
    await expect(getAllCasts()).resolves.toEqual([
      {
        name: 'Cast A',
        is_present: false,
        group_name: 'Group 1',
        photo_data_url: undefined,
        memo: 'memo',
        contact_urls: ['https://example.test/profile'],
        ng_entries: [{ username: 'Sample User', accountId: '@sample_user' }],
      },
    ]);
  });

  it('関連データとイベント内出席状態がない場合は既定値で返す', async () => {
    mockState.sharedDb = createDb({ emptyRelations: true, noPresentRows: true, nullFields: true });

    await expect(getAllCasts()).resolves.toEqual([
      {
        name: 'Cast A',
        is_present: true,
        group_name: undefined,
        photo_data_url: undefined,
        memo: undefined,
        contact_urls: undefined,
        ng_entries: undefined,
      },
    ]);
  });
});

describe('cast write operations', () => {
  it('キャスト数を取得する', async () => {
    await expect(getCastCount()).resolves.toBe(3);
  });

  it('出席状態を backend command で保存する', async () => {
    await updateCastAttend('Cast A', false);

    expect(invokeMock).toHaveBeenCalledWith('update_cast_attend_atomic', {
      eventName: 'Sample Event',
      name: 'Cast A',
      isPresent: false,
    });
  });

  it('キャスト一覧の全置換 payload を作る', async () => {
    await persistAllCasts([sampleCast()]);

    expect(invokeMock).toHaveBeenCalledWith('persist_all_casts_atomic', {
      eventName: 'Sample Event',
      casts: [
        {
          name: 'Cast A',
          is_present: true,
          contact_urls: ['https://example.test/profile'],
          ng_entries: [{ username: 'Sample User', accountId: '@sample_user' }],
          group_name: 'Group 1',
          photo_data_url: null,
          memo: 'memo',
        },
      ],
    });
  });

  it('キャスト追加 payload では未指定関連データを空配列と null に補完する', async () => {
    await insertCast({ name: 'Cast A', is_present: false });

    expect(invokeMock).toHaveBeenCalledWith('insert_cast_atomic', {
      eventName: 'Sample Event',
      cast: {
        name: 'Cast A',
        is_present: false,
        contact_urls: [],
        ng_entries: [],
        group_name: null,
        photo_data_url: null,
        memo: null,
      },
    });
  });

  it('部分更新 payload は指定された項目だけを更新対象にする', async () => {
    await updateCastFields('Cast A', {
      is_present: false,
      contact_urls: ['https://example.test/new-profile'],
      ng_entries: undefined,
    });

    expect(invokeMock).toHaveBeenCalledWith('update_cast_fields_atomic', {
      eventName: 'Sample Event',
      name: 'Cast A',
      patch: {
        update_is_present: true,
        is_present: false,
        update_group_name: false,
        group_name: null,
        update_photo_data_url: false,
        photo_data_url: null,
        update_memo: false,
        memo: null,
        update_contact_urls: true,
        contact_urls: ['https://example.test/new-profile'],
        update_ng_entries: true,
        ng_entries: [],
      },
    });
  });

  it('scalar 項目の null クリアを payload で表現する', async () => {
    await updateCastFields('Cast A', { group_name: undefined, memo: 'updated' });

    expect(invokeMock).toHaveBeenCalledWith('update_cast_fields_atomic', {
      eventName: 'Sample Event',
      name: 'Cast A',
      patch: expect.objectContaining({
        update_group_name: true,
        group_name: null,
        update_memo: true,
        memo: 'updated',
      }),
    });
  });

  it('キャスト名変更は backend command を呼ぶ', async () => {
    await renameCast('Cast A', 'Cast B');

    expect(invokeMock).toHaveBeenCalledWith('rename_cast_atomic', {
      eventName: 'Sample Event',
      oldName: 'Cast A',
      newName: 'Cast B',
    });
  });

  it('キャスト削除は backend command を呼ぶ', async () => {
    await deleteCast('Cast A');

    expect(invokeMock).toHaveBeenCalledWith('delete_cast_atomic', {
      eventName: 'Sample Event',
      name: 'Cast A',
    });
  });

  it('イベント未オープン時は保存 command を呼ばない', async () => {
    mockState.eventName = null;

    await expect(deleteCast('Cast A')).rejects.toThrow('イベントが開かれていません。');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
