import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import { getNGReasonForCast, isUserNGForCast } from './ng-judgment';

const user: UserBean = {
  name: ' Alice ',
  x_id: '@Alice_ID',
  casts: [],
  raw_extra: [],
};

describe('isUserNGForCast', () => {
  it('accountId 判定では @ と大小文字を無視して一致させる', () => {
    const cast: CastBean = {
      name: 'Cast A',
      is_present: true,
      ng_entries: [{ accountId: 'alice_id' }],
    };

    expect(isUserNGForCast(user, cast, 'accountId')).toBe(true);
  });

  it('username 判定ではユーザー名だけを比較する', () => {
    const cast: CastBean = {
      name: 'Cast A',
      is_present: true,
      ng_entries: [{ username: 'alice', accountId: 'other' }],
    };

    expect(isUserNGForCast(user, cast, 'username')).toBe(true);
    expect(isUserNGForCast(user, cast, 'accountId')).toBe(false);
  });

  it('either 判定ではユーザー名または accountId の一致で NG とする', () => {
    const cast: CastBean = {
      name: 'Cast A',
      is_present: true,
      ng_entries: [{ username: 'other', accountId: '@alice_id' }],
    };

    expect(isUserNGForCast(user, cast, 'either')).toBe(true);
  });

  it('NG リストが空なら NG と判定しない', () => {
    expect(isUserNGForCast(user, { name: 'Cast A', is_present: true }, 'either')).toBe(false);
  });
});

describe('getNGReasonForCast', () => {
  it('警告表示用の理由文言にキャスト名を含める', () => {
    expect(getNGReasonForCast('Cast A')).toBe('このユーザーはキャスト「Cast A」のNG対象です');
  });
});
