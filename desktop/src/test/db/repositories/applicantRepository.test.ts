import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserBean } from '@/common/types/entities';
import {
  deleteApplicant,
  flushApplicantWrites,
  loadApplicants,
  persistApplicants,
  replaceApplicantGuarantees,
  updateApplicantCastPreferences,
} from '@/db/repositories/applicantRepository';

interface FakeDb {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
}

const invokeMock = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({
  sessionDb: null as FakeDb | null,
  sharedDb: null as FakeDb | null,
  applicantRows: [
    { id: 1, x_id: '@sample_user', name: 'Sample User', vrc_url: null, is_guaranteed: 1 },
  ] as Array<{
    id: number;
    x_id: string;
    name: string | null;
    vrc_url: string | null;
    is_guaranteed: number;
  }>,
  castPrefs: [
    { applicant_id: 1, preference_order: 0, cast_name: 'Cast A at import', cast_id: 1 },
    { applicant_id: 1, preference_order: 2, cast_name: 'Cast C', cast_id: 999 },
  ] as Array<{
    applicant_id: number;
    preference_order: number;
    cast_name: string;
    cast_id: number | null;
  }>,
  extras: [
    { applicant_id: 1, field_key: '__preference_mode', field_value: 'flat' },
    { applicant_id: 1, field_key: '備考', field_value: 'メモ' },
  ] as Array<{
    applicant_id: number;
    field_key: string;
    field_value: string | null;
  }>,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/db/database', () => ({
  getSessionDb: () => {
    if (!mockState.sessionDb) throw new Error('session db is not set');
    return mockState.sessionDb;
  },
  getSharedDb: () => {
    if (!mockState.sharedDb) throw new Error('shared db is not set');
    return mockState.sharedDb;
  },
}));

const SESSION_CONTEXT = {
  eventName: 'Sample Event',
  timestamp: '20260618120000',
  generation: 1,
};

function createDb(): FakeDb {
  return {
    execute: vi.fn(),
    select: vi.fn(async <T>(query: string): Promise<T> => {
      if (query.includes('FROM applicants')) {
        return mockState.applicantRows as T;
      }
      if (query.includes('FROM applicant_casts')) {
        return mockState.castPrefs as T;
      }
      if (query.includes('FROM applicant_extra')) {
        return mockState.extras as T;
      }
      return [] as T;
    }),
  };
}

function createSharedDb(): FakeDb {
  return {
    execute: vi.fn(),
    select: vi.fn(async <T>(query: string): Promise<T> => {
      if (query === 'SELECT id, name FROM casts') {
        return [
          { id: 1, name: 'Cast A renamed' },
          { id: 3, name: 'Cast C current' },
        ] as T;
      }
      return [] as T;
    }),
  };
}

beforeEach(() => {
  mockState.sessionDb = createDb();
  mockState.sharedDb = createSharedDb();
  mockState.applicantRows = [
    { id: 1, x_id: '@sample_user', name: 'Sample User', vrc_url: null, is_guaranteed: 1 },
  ];
  mockState.castPrefs = [
    { applicant_id: 1, preference_order: 0, cast_name: 'Cast A at import', cast_id: 1 },
    { applicant_id: 1, preference_order: 2, cast_name: 'Cast C', cast_id: 999 },
  ];
  mockState.extras = [
    { applicant_id: 1, field_key: '__preference_mode', field_value: 'flat' },
    { applicant_id: 1, field_key: '備考', field_value: 'メモ' },
  ];
  invokeMock.mockReset();
});

describe('loadApplicants', () => {
  it('応募者、希望キャスト、追加列を内部Xユーザー名の UserBean に復元する', async () => {
    const users = await loadApplicants();

    expect(users).toEqual<UserBean[]>([
      {
        id: 1,
        name: 'Sample User',
        x_id: 'sample_user',
        vrc_url: undefined,
        is_guaranteed: true,
        casts: ['Cast A renamed', 'Cast C'],
        cast_ids: [1, 999],
        preference_mode: 'flat',
        raw_extra: [{ key: '備考', value: 'メモ' }],
      },
    ]);
  });

  it('順位あり希望は空欄の順位を詰めずに復元する', async () => {
    mockState.extras[0].field_value = 'ranked';

    const users = await loadApplicants();

    expect(users[0]).toMatchObject({
      casts: ['Cast A renamed', '', 'Cast C'],
      cast_ids: [1, null, 999],
      preference_mode: 'ranked',
    });
  });

  it('cast_id が null の希望は同名の現行キャストへ名前で再接続しない', async () => {
    mockState.castPrefs = [
      {
        applicant_id: 1,
        preference_order: 0,
        cast_name: 'Cast C at import',
        cast_id: null,
      },
    ];

    const users = await loadApplicants();

    expect(users[0]).toMatchObject({
      casts: ['Cast C at import'],
      cast_ids: [null],
    });
  });

  it('応募者数によらず固定4クエリで子行を応募者ごとに復元する', async () => {
    mockState.applicantRows.push({
      id: 2,
      x_id: 'second_user',
      name: null,
      vrc_url: 'https://vrchat.com/home/user/usr_second',
      is_guaranteed: 0,
    });
    mockState.castPrefs.push({
      applicant_id: 2,
      preference_order: 0,
      cast_name: 'Cast C at import',
      cast_id: 3,
    });
    mockState.extras.push(
      { applicant_id: 2, field_key: '__preference_mode', field_value: 'ranked' },
      { applicant_id: 2, field_key: '連絡事項', field_value: null },
    );

    const users = await loadApplicants();

    expect(mockState.sharedDb?.select).toHaveBeenCalledTimes(1);
    expect(mockState.sessionDb?.select).toHaveBeenCalledTimes(3);
    expect(users[1]).toEqual<UserBean>({
      id: 2,
      name: '',
      x_id: 'second_user',
      vrc_url: 'https://vrchat.com/home/user/usr_second',
      is_guaranteed: false,
      casts: ['Cast C current'],
      cast_ids: [3],
      preference_mode: 'ranked',
      raw_extra: [{ key: '連絡事項', value: '' }],
    });
    expect(users[0].raw_extra).toEqual([{ key: '備考', value: 'メモ' }]);
  });
});

describe('persistApplicants', () => {
  it('応募者一覧を backend command 用 payload に渡す', async () => {
    await persistApplicants([
      {
        name: 'Sample User',
        x_id: 'sample_user',
        vrc_url: 'https://vrchat.com/home/user/usr_sample_user',
        is_guaranteed: true,
        casts: ['Cast A', '', 'Cast C'],
        cast_ids: [1, null, 3],
        preference_mode: 'ranked',
        raw_extra: [{ key: '備考', value: 'メモ' }],
      },
    ], SESSION_CONTEXT);

    expect(invokeMock).toHaveBeenCalledWith('persist_applicants_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      users: [
        {
          name: 'Sample User',
          x_id: 'sample_user',
          vrc_url: 'https://vrchat.com/home/user/usr_sample_user',
          casts: ['Cast A', '', 'Cast C'],
          cast_ids: [1, null, 3],
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
        x_id: 'sample_user',
        casts: [],
        cast_ids: [],
        raw_extra: [{ key: '備考', value: '' }],
      },
    ], SESSION_CONTEXT);

    expect(invokeMock).toHaveBeenCalledWith('persist_applicants_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      users: [
        {
          name: null,
          x_id: 'sample_user',
          vrc_url: null,
          casts: [],
          cast_ids: [],
          preference_mode: 'ranked',
          is_guaranteed: false,
          raw_extra: [{ key: '備考', value: '' }],
        },
      ],
    });
  });

  it('希望キャストIDが未確定の応募者は backend へ渡さない', async () => {
    await expect(persistApplicants([{
      name: 'Sample User',
      x_id: 'sample_user',
      casts: ['Cast A'],
      raw_extra: [],
    }], SESSION_CONTEXT)).rejects.toThrow('希望キャストIDが確定していません');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('deleteApplicant', () => {
  it('応募者の安定IDをセッション単位の backend command へ渡す', async () => {
    await deleteApplicant(42, SESSION_CONTEXT);

    expect(invokeMock).toHaveBeenCalledWith('delete_applicant_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      applicantId: 42,
    });
  });

  it('同じセッションへの削除と再取込を呼出順に実行する', async () => {
    let finishDelete: (() => void) | undefined;
    invokeMock
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishDelete = resolve;
      }))
      .mockResolvedValueOnce(undefined);

    const deletion = deleteApplicant(42, SESSION_CONTEXT);
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const reimport = persistApplicants([], SESSION_CONTEXT);
    const pendingWrites = flushApplicantWrites(SESSION_CONTEXT);
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    finishDelete?.();
    await Promise.all([deletion, reimport, pendingWrites]);
    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
      'delete_applicant_atomic',
      'persist_applicants_atomic',
    ]);
  });
});

describe('updateApplicantCastPreferences', () => {
  it('希望キャストIDを応募者の安定IDとともに backend command へ渡す', async () => {
    await updateApplicantCastPreferences(42, [1, null, 3], SESSION_CONTEXT);

    expect(invokeMock).toHaveBeenCalledWith('update_applicant_cast_preferences_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      applicantId: 42,
      preferences: { cast_ids: [1, null, 3] },
    });
  });
});

describe('replaceApplicantGuarantees', () => {
  it('次回抽選の確定当選者をセッション単位の backend command へ渡す', async () => {
    await replaceApplicantGuarantees(['sample_user', 'sample_other'], SESSION_CONTEXT);

    expect(invokeMock).toHaveBeenCalledWith('replace_applicant_guarantees_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      guaranteedXIds: ['sample_user', 'sample_other'],
    });
  });
});
