import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import type { CautionUser } from '@/features/matching/types/matching-system-types';
import {
  computeCautionCandidates,
  getCautionNGCastNames,
  isCautionUser,
} from '@/features/matching/logics/caution-user';

const user: UserBean = {
  name: 'Alice',
  x_id: '@alice',
  casts: [],
  raw_extra: [],
};

const casts: CastBean[] = [
  { id: 1, name: 'Cast A', is_present: true, ng_entries: [{ accountId: 'alice' }] },
  { id: 2, name: 'Cast B', is_present: true, ng_entries: [{ accountId: '@alice' }] },
  { id: 3, name: 'Cast C', is_present: true, ng_entries: [{ accountId: '@other' }] },
];

describe('getCautionNGCastNames', () => {
  it('対象ユーザーを NG 登録しているキャスト名だけを返す', () => {
    expect(getCautionNGCastNames(user, casts)).toEqual(['Cast A', 'Cast B']);
  });
});

describe('isCautionUser', () => {
  it('表示名が双方にあり異なる場合は accountId が同じでも判定しない', () => {
    const cautionUsers: CautionUser[] = [{ username: 'Other', accountId: '@alice' }];

    expect(isCautionUser(user, cautionUsers)).toBe(false);
  });

  it('表示名と accountId が一致すれば要注意と判定する', () => {
    expect(isCautionUser(user, [
      { username: 'Alice', accountId: '@alice' },
    ])).toBe(true);
  });

  it('どちらかの表示名が空なら accountId だけで判定する', () => {
    expect(isCautionUser({ ...user, name: '' }, [
      { username: 'Other', accountId: '@alice' },
    ])).toBe(true);
  });

  it('名前未入力時にX IDから補完した表示名は名前照合へ使わない', () => {
    expect(isCautionUser(user, [
      { username: '@alice', accountId: 'alice' },
    ])).toBe(true);
  });

  it('応募ユーザーの accountId が空なら判定しない', () => {
    expect(isCautionUser({ ...user, x_id: '' }, [
      { username: 'Alice', accountId: '' },
    ])).toBe(false);
  });
});

describe('computeCautionCandidates', () => {
  it('正規化後に同じIDを集計し、登録済みのIDを候補から除外する', () => {
    const candidateCasts: CastBean[] = [
      {
        id: 1,
        name: 'Cast A',
        is_present: true,
        ng_entries: [
          { accountId: '@alice_id', username: 'Alice' },
          { accountId: '@bob_id', username: 'Bob' },
          { accountId: '@registered_id', username: '登録済み' },
        ],
      },
      {
        id: 2,
        name: 'Cast B',
        is_present: true,
        ng_entries: [
          { accountId: '@alice_id', username: 'Alice B' },
          { accountId: '@bob_id', username: 'Bob' },
          { accountId: '@registered_id', username: '登録済み B' },
        ],
      },
      {
        id: 3,
        name: 'Cast C',
        is_present: true,
        ng_entries: [{ accountId: '@bob_id', username: 'Bob' }],
      },
    ];

    expect(computeCautionCandidates(candidateCasts, 2, ['@registered_id'])).toEqual([
      {
        accountId: 'bob_id',
        usernames: ['Bob'],
        castCount: 3,
      },
      {
        accountId: 'alice_id',
        usernames: ['Alice', 'Alice B'],
        castCount: 2,
      },
    ]);
  });

  it('大小文字や先頭@が異なるIDを同じ候補として扱う', () => {
    const variedIds: CastBean[] = [
      { id: 1, name: 'Cast A', is_present: true, ng_entries: [{ accountId: '@Alice' }] },
      { id: 2, name: 'Cast B', is_present: true, ng_entries: [{ accountId: 'alice' }] },
    ];

    expect(computeCautionCandidates(variedIds, 2, [])).toEqual([
      { accountId: 'Alice', usernames: [], castCount: 2 },
    ]);
  });
});
