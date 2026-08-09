import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import {
  attachCastIdsToUsers,
  findCastNameUsages,
  findUnavailableCastReferences,
  getCastPreferenceIndex,
  renameCastInPreferences,
} from '@/common/castReferences';

function user(overrides: Partial<UserBean> = {}): UserBean {
  return {
    name: '応募者A',
    x_id: '@applicant_a',
    casts: ['同名キャスト', '第二希望'],
    raw_extra: [],
    ...overrides,
  };
}

const currentCasts: CastBean[] = [
  { id: 10, name: '同名キャスト', aliases: ['別名キャスト'], is_present: true },
  { id: 20, name: '第二希望', is_present: true },
];

describe('castReferences', () => {
  it('cast_ids があれば同名でもIDが異なるキャストを希望として扱わない', () => {
    const applicant = user({ cast_ids: [10, 20] });

    expect(getCastPreferenceIndex(applicant, { id: 10, name: '改名後', is_present: true })).toBe(0);
    expect(getCastPreferenceIndex(applicant, { id: 99, name: '同名キャスト', is_present: true })).toBe(-1);
  });

  it('cast_ids が明示された場合は null 参照を名前で補完しない', () => {
    expect(getCastPreferenceIndex(
      user({ cast_ids: [null, 20] }),
      currentCasts[0],
    )).toBe(-1);
  });

  it('cast_ids がないデータを名前だけで希望へ結び付けない', () => {
    expect(getCastPreferenceIndex(user(), currentCasts[0])).toBe(-1);
  });

  it('cast_ids がないデータでは別名を希望キーとして使わない', () => {
    expect(getCastPreferenceIndex(
      user({ casts: ['別名キャスト'] }),
      currentCasts[0],
    )).toBe(-1);
  });

  it('現在のキャスト名と完全一致するIDを希望順位へ付与する', () => {
    const [resolved] = attachCastIdsToUsers([
      user({ casts: ['同名キャスト', '同名キャスト ', '', '不明'] }),
    ], currentCasts);

    expect(resolved.cast_ids).toEqual([10, null, null, null]);
  });

  it('検索用の別名を安定IDへ解決しない', () => {
    const [resolved] = attachCastIdsToUsers([
      user({ casts: ['別名キャスト', '第二希望'] }),
    ], currentCasts);

    expect(resolved.cast_ids).toEqual([null, 20]);
  });

  it('正式名だけを解決し、別名との衝突は希望判定へ持ち込まない', () => {
    const casts: CastBean[] = [
      { id: 10, name: 'Cast A', aliases: ['共通名', 'Cast B'], is_present: true },
      { id: 20, name: 'Cast B', aliases: ['共通名'], is_present: true },
    ];
    const [resolved] = attachCastIdsToUsers([
      user({ casts: ['共通名', 'Cast B', 'Cast A'] }),
    ], casts);

    expect(resolved.cast_ids).toEqual([null, 20, 10]);
  });

  it('名称が使われている正式名・別名と所有キャストを返す', () => {
    const casts: CastBean[] = [
      { id: 10, name: 'Cast A', aliases: ['共通名'], is_present: true },
      { id: 20, name: '共通名', aliases: ['別名B'], is_present: true },
    ];

    expect(findCastNameUsages('共通名', casts)).toEqual([
      { castId: 10, castName: 'Cast A', source: 'alias', aliasIndex: 0 },
      { castId: 20, castName: '共通名', source: 'name' },
    ]);
  });

  it('null参照・削除済みID・ID未設定の名前不一致を応募者情報つきで返す', () => {
    const users = [
      user({ cast_ids: [null, 999] }),
      user({
        name: '応募者B',
        x_id: '@applicant_b',
        casts: ['存在しないキャスト', ''],
      }),
    ];

    expect(findUnavailableCastReferences(users, currentCasts)).toEqual([
      {
        applicantName: '応募者A',
        xId: '@applicant_a',
        preferenceIndex: 0,
        castName: '同名キャスト',
        castId: null,
        reason: 'unresolved',
      },
      {
        applicantName: '応募者A',
        xId: '@applicant_a',
        preferenceIndex: 1,
        castName: '第二希望',
        castId: 999,
        reason: 'deleted',
      },
      {
        applicantName: '応募者B',
        xId: '@applicant_b',
        preferenceIndex: 0,
        castName: '存在しないキャスト',
        castId: null,
        reason: 'unresolved',
      },
    ]);
  });

  it('順位の空欄と、現在キャストへ解決できる参照は問題にしない', () => {
    expect(findUnavailableCastReferences([
      user({ casts: ['同名キャスト', '', '第二希望'], cast_ids: [10, null, 20] }),
    ], currentCasts)).toEqual([]);
  });

  it('cast_ids がないデータでは別名を未解決として返す', () => {
    expect(findUnavailableCastReferences([
      user({ casts: ['別名キャスト'] }),
    ], currentCasts)).toEqual([
      {
        applicantName: '応募者A',
        xId: '@applicant_a',
        preferenceIndex: 0,
        castName: '別名キャスト',
        castId: null,
        reason: 'unresolved',
      },
    ]);
  });

  it('安定IDで参照している希望は表示名が古くても改名後の名称へ更新する', () => {
    const users = [
      user({ casts: ['過去の表示名', '第二希望'], cast_ids: [10, 20] }),
      user({ name: '応募者B', casts: ['同名キャスト'], cast_ids: [99] }),
    ];

    const renamed = renameCastInPreferences(
      users,
      { id: 10, name: '改名後', is_present: true },
      '改名後',
    );

    expect(renamed[0]?.casts).toEqual(['改名後', '第二希望']);
    expect(renamed[1]).toBe(users[1]);
    expect(users[0]?.casts).toEqual(['過去の表示名', '第二希望']);
  });

  it('cast_ids がないデータは表示名が一致しても改名対象にしない', () => {
    const userWithoutIds = user({ casts: ['同名キャスト', '同名キャスト ', '第二希望'] });

    const [renamed] = renameCastInPreferences(
      [userWithoutIds],
      { id: 10, name: '改名後', is_present: true },
      '改名後',
    );

    expect(renamed).toBe(userWithoutIds);
    expect(userWithoutIds.casts).toEqual(['同名キャスト', '同名キャスト ', '第二希望']);
  });
});
