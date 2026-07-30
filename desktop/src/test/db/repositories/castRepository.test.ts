import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteCast,
  getAllCasts,
  insertCast,
  renameCast,
  setAllCastPresence,
  updateCastFields,
} from '@/db/repositories/castRepository';

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

vi.mock('@/db/database', () => ({
  getSharedDb: () => {
    if (!mockState.sharedDb) throw new Error('shared db is not set');
    return mockState.sharedDb;
  },
  getCurrentEventName: () => mockState.eventName,
}));

function createDb(options?: {
  emptyRelations?: boolean;
  multipleCasts?: boolean;
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
      if (
        query
        === 'SELECT id, name, group_name, is_attend, photo_data_url, memo FROM casts ORDER BY id'
      ) {
        return [
          {
            id: 1,
            name: 'Cast A',
            group_name: options?.nullFields ? null : 'Group 1',
            is_attend: options?.noPresentRows ? 1 : 0,
            photo_data_url: null,
            memo: options?.nullFields ? null : 'memo',
          },
          ...(options?.multipleCasts
            ? [
                {
                  id: 2,
                  name: 'Cast B',
                  group_name: 'Group 2',
                  is_attend: 1,
                  photo_data_url: 'data:image/png;base64,photo',
                  memo: null,
                },
                {
                  id: 3,
                  name: 'Cast C',
                  group_name: null,
                  is_attend: 0,
                  photo_data_url: null,
                  memo: null,
                },
              ]
            : []),
        ] as T;
      }
      if (query === 'SELECT cast_id, url FROM cast_urls ORDER BY cast_id, id') {
        return (options?.emptyRelations
          ? []
          : [
              { cast_id: 1, url: 'https://example.test/profile' },
              ...(options?.multipleCasts
                ? [
                    { cast_id: 2, url: 'https://example.test/b-first' },
                    { cast_id: 2, url: 'https://example.test/b-second' },
                  ]
                : []),
            ]) as T;
      }
      if (query === 'SELECT cast_id, alias FROM cast_aliases ORDER BY cast_id, id') {
        return (options?.emptyRelations
          ? []
          : [
              { cast_id: 1, alias: 'Alias A' },
              ...(options?.multipleCasts
                ? [
                    { cast_id: 2, alias: 'Alias B1' },
                    { cast_id: 2, alias: 'Alias B2' },
                  ]
                : []),
            ]) as T;
      }
      if (
        query === 'SELECT cast_id, username, userid, notes FROM cast_ng_entries ORDER BY cast_id, id'
      ) {
        return (options?.emptyRelations
          ? []
          : [
              {
                cast_id: 1,
                username: 'Sample User',
                userid: '@sample_user',
                notes: '受付で確認',
              },
              ...(options?.multipleCasts
                ? [
                    { cast_id: 2, username: 'Blocked First', userid: null, notes: null },
                    { cast_id: 2, username: null, userid: '@blocked_second', notes: '連絡不要' },
                    { cast_id: 3, username: null, userid: null, notes: null },
                  ]
                : []),
            ]) as T;
      }
      return [] as T;
    }),
  };
}

beforeEach(() => {
  mockState.sharedDb = createDb();
  mockState.eventName = 'Sample Event';
  invokeMock.mockReset();
});

describe('getAllCasts', () => {
  it('関連テーブルを統合し、NGのX IDを内部ユーザー名で返す', async () => {
    await expect(getAllCasts()).resolves.toEqual([
      {
        id: 1,
        name: 'Cast A',
        aliases: ['Alias A'],
        is_present: false,
        group_name: 'Group 1',
        photo_data_url: undefined,
        memo: 'memo',
        contact_urls: ['https://example.test/profile'],
        ng_entries: [{
          username: 'Sample User',
          accountId: 'sample_user',
          notes: '受付で確認',
        }],
      },
    ]);
  });

  it('関連データがない場合もキャスト本体の出席状態を返す', async () => {
    mockState.sharedDb = createDb({ emptyRelations: true, noPresentRows: true, nullFields: true });

    await expect(getAllCasts()).resolves.toEqual([
      {
        id: 1,
        name: 'Cast A',
        aliases: undefined,
        is_present: true,
        group_name: undefined,
        photo_data_url: undefined,
        memo: undefined,
        contact_urls: undefined,
        ng_entries: undefined,
      },
    ]);
  });

  it('キャスト数に関係なく4回の一括クエリで関連データを取得する', async () => {
    const singleCastDb = createDb();
    mockState.sharedDb = singleCastDb;
    await getAllCasts();

    const multipleCastsDb = createDb({ multipleCasts: true });
    mockState.sharedDb = multipleCastsDb;
    const casts = await getAllCasts();

    expect(singleCastDb.select).toHaveBeenCalledTimes(4);
    expect(multipleCastsDb.select).toHaveBeenCalledTimes(4);
    expect(multipleCastsDb.select.mock.calls.map(([query]) => query)).toEqual([
      'SELECT id, name, group_name, is_attend, photo_data_url, memo FROM casts ORDER BY id',
      'SELECT cast_id, alias FROM cast_aliases ORDER BY cast_id, id',
      'SELECT cast_id, url FROM cast_urls ORDER BY cast_id, id',
      'SELECT cast_id, username, userid, notes FROM cast_ng_entries ORDER BY cast_id, id',
    ]);
    expect(casts.map((cast) => cast.id)).toEqual([1, 2, 3]);
    expect(casts[1]?.aliases).toEqual(['Alias B1', 'Alias B2']);
    expect(casts[1]?.contact_urls).toEqual([
      'https://example.test/b-first',
      'https://example.test/b-second',
    ]);
    expect(casts[1]?.ng_entries).toEqual([
      { username: 'Blocked First', accountId: undefined, notes: undefined },
      { username: undefined, accountId: 'blocked_second', notes: '連絡不要' },
    ]);
    expect(casts[2]?.contact_urls).toBeUndefined();
    expect(casts[2]?.ng_entries).toBeUndefined();
  });
});

describe('cast write operations', () => {
  it('キャスト追加 payload を補完し、backend が採番したIDを返す', async () => {
    invokeMock.mockResolvedValueOnce(42);

    await expect(insertCast({ name: 'Cast A', is_present: false })).resolves.toBe(42);

    expect(invokeMock).toHaveBeenCalledWith('insert_cast_atomic', {
      eventName: 'Sample Event',
      cast: {
        name: 'Cast A',
        aliases: [],
        is_present: false,
        contact_urls: [],
        ng_entries: [],
        group_name: null,
        photo_data_url: null,
        memo: null,
      },
    });
  });

  it('キャスト追加時のNGエントリを内部Xユーザー名へ変換する', async () => {
    invokeMock.mockResolvedValueOnce(43);

    await expect(insertCast({
      name: 'Cast B',
      is_present: true,
      ng_entries: [{
        username: 'Blocked User',
        accountId: '@Blocked_User',
        notes: '受付で確認',
      }],
    })).resolves.toBe(43);

    expect(invokeMock).toHaveBeenCalledWith('insert_cast_atomic', {
      eventName: 'Sample Event',
      cast: expect.objectContaining({
        ng_entries: [{
          username: 'Blocked User',
          accountId: 'Blocked_User',
          notes: '受付で確認',
        }],
      }),
    });
  });

  it('部分更新 payload は指定された項目だけを更新対象にする', async () => {
    await updateCastFields(10, {
      is_present: false,
      contact_urls: ['https://example.test/new-profile'],
      ng_entries: undefined,
    });

    expect(invokeMock).toHaveBeenCalledWith('update_cast_fields_atomic', {
      eventName: 'Sample Event',
      castId: 10,
      patch: {
        update_is_present: true,
        is_present: false,
        update_aliases: false,
        aliases: [],
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
    await updateCastFields(10, { group_name: undefined, memo: 'updated' });

    expect(invokeMock).toHaveBeenCalledWith('update_cast_fields_atomic', {
      eventName: 'Sample Event',
      castId: 10,
      patch: expect.objectContaining({
        update_group_name: true,
        group_name: null,
        update_memo: true,
        memo: 'updated',
      }),
    });
  });

  it('別名とNG理由・メモを部分更新 payload へ渡す', async () => {
    await updateCastFields(10, {
      aliases: ['Alias A', 'Alias B'],
      ng_entries: [{
        username: 'Blocked User',
        accountId: 'blocked_user',
        notes: '受付で責任者へ確認',
      }],
    });

    expect(invokeMock).toHaveBeenCalledWith('update_cast_fields_atomic', {
      eventName: 'Sample Event',
      castId: 10,
      patch: expect.objectContaining({
        update_aliases: true,
        aliases: ['Alias A', 'Alias B'],
        update_ng_entries: true,
        ng_entries: [{
          username: 'Blocked User',
          accountId: 'blocked_user',
          notes: '受付で責任者へ確認',
        }],
      }),
    });
  });

  it('全キャストの出席状態を一括更新 command へ渡す', async () => {
    await setAllCastPresence(true);

    expect(invokeMock).toHaveBeenCalledWith('set_all_cast_presence_atomic', {
      eventName: 'Sample Event',
      isPresent: true,
    });
  });

  it('個別変更と一括変更を同じイベント内で呼出順に実行する', async () => {
    let finishUpdate: (() => void) | undefined;
    invokeMock
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishUpdate = resolve;
      }))
      .mockResolvedValueOnce(undefined);

    const update = updateCastFields(10, { is_present: false });
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const setAll = setAllCastPresence(true);
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    finishUpdate?.();
    await Promise.all([update, setAll]);
    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
      'update_cast_fields_atomic',
      'set_all_cast_presence_atomic',
    ]);
  });

  it('キャスト名変更は backend command を呼ぶ', async () => {
    await renameCast(10, 'Cast B');

    expect(invokeMock).toHaveBeenCalledWith('rename_cast_atomic', {
      eventName: 'Sample Event',
      castId: 10,
      newName: 'Cast B',
    });
  });

  it('キャスト削除は backend command を呼ぶ', async () => {
    await deleteCast(10);

    expect(invokeMock).toHaveBeenCalledWith('delete_cast_atomic', {
      eventName: 'Sample Event',
      castId: 10,
    });
  });

  it('イベント未オープン時は保存 command を呼ばない', async () => {
    mockState.eventName = null;

    await expect(deleteCast(10)).rejects.toThrow('イベントが開かれていません。');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
