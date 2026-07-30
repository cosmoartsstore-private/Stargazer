import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import { getNGReasonForCast, isUserNGForCast } from '@/features/matching/logics/ng-judgment';

const user: UserBean = {
  name: ' Alice ',
  x_id: '@Alice_ID',
  casts: [],
  raw_extra: [],
};

describe('isUserNGForCast', () => {
  it('accountId 判定では @ と大小文字を無視して一致させる', () => {
    const cast: CastBean = {
      id: 1,
      name: 'Cast A',
      is_present: true,
      ng_entries: [{ accountId: 'alice_id' }],
    };

    expect(isUserNGForCast(user, cast)).toBe(true);
  });

  it('usernameが一致してもX IDが異なればNGと判定しない', () => {
    const cast: CastBean = {
      id: 1,
      name: 'Cast A',
      is_present: true,
      ng_entries: [{ username: 'alice', accountId: 'other' }],
    };

    expect(isUserNGForCast(user, cast)).toBe(false);
  });

  it('usernameが異なってもX IDが一致すればNGと判定する', () => {
    const cast: CastBean = {
      id: 1,
      name: 'Cast A',
      is_present: true,
      ng_entries: [{ username: 'other', accountId: '@alice_id' }],
    };

    expect(isUserNGForCast(user, cast)).toBe(true);
  });

  it('NG リストが空なら NG と判定しない', () => {
    expect(isUserNGForCast(user, { id: 1, name: 'Cast A', is_present: true })).toBe(false);
  });
});

describe('getNGReasonForCast', () => {
  it('警告表示用の理由文言にキャスト名を含める', () => {
    expect(getNGReasonForCast('Cast A')).toBe('キャスト「Cast A」のNG対象です');
  });
});
