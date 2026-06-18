import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import type { CautionUser, NGException } from '@/features/matching/types/matching-system-types';
import {
  computeAutoCautionUsers,
  getCautionNGCastNames,
  isCautionUser,
  isNGException,
} from './caution-user';

const user: UserBean = {
  name: 'Alice',
  x_id: '@alice',
  casts: [],
  raw_extra: [],
};

const casts: CastBean[] = [
  { name: 'Cast A', is_present: true, ng_entries: [{ accountId: 'alice' }] },
  { name: 'Cast B', is_present: true, ng_entries: [{ accountId: '@alice' }] },
  { name: 'Cast C', is_present: true, ng_entries: [{ accountId: '@other' }] },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('getCautionNGCastNames', () => {
  it('対象ユーザーを NG 登録しているキャスト名だけを返す', () => {
    expect(getCautionNGCastNames(user, casts, 'accountId')).toEqual(['Cast A', 'Cast B']);
  });
});

describe('isCautionUser', () => {
  it('accountId が一致し、両方の名前がある場合は名前も一致したときだけ true を返す', () => {
    const cautionUsers: CautionUser[] = [
      { username: 'Other', accountId: '@alice', registrationType: 'manual', registeredAt: '2026-01-01T00:00:00.000Z' },
      { username: 'Alice', accountId: 'alice', registrationType: 'manual', registeredAt: '2026-01-01T00:00:00.000Z' },
    ];

    expect(isCautionUser(user, cautionUsers)).toBe(true);
  });

  it('応募ユーザーの accountId が空なら判定しない', () => {
    expect(isCautionUser({ ...user, x_id: '' }, [
      { username: 'Alice', accountId: '', registrationType: 'manual', registeredAt: '2026-01-01T00:00:00.000Z' },
    ])).toBe(false);
  });
});

describe('isNGException', () => {
  it('ユーザー名と accountId の両方が一致した場合だけ例外扱いにする', () => {
    const exceptions: NGException[] = [
      { username: 'Alice', accountId: '@other', registeredAt: '2026-01-01T00:00:00.000Z' },
      { username: 'Alice', accountId: '@alice', registeredAt: '2026-01-01T00:00:00.000Z' },
    ];

    expect(isNGException(user, exceptions)).toBe(true);
    expect(isNGException({ ...user, name: 'Other' }, exceptions)).toBe(false);
  });
});

describe('computeAutoCautionUsers', () => {
  it('NG キャスト数が閾値以上の応募者を自動登録形式に変換する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:34:56.000Z'));

    expect(computeAutoCautionUsers(casts, [user], 'accountId', 2)).toEqual([
      {
        username: 'Alice',
        accountId: '@alice',
        registrationType: 'auto',
        ngCastCount: 2,
        registeredAt: '2026-06-18T12:34:56.000Z',
      },
    ]);
  });

  it('名前または accountId が空の応募者は自動登録しない', () => {
    expect(computeAutoCautionUsers(casts, [{ ...user, name: '' }, { ...user, x_id: '' }], 'accountId', 1)).toEqual([]);
  });
});
