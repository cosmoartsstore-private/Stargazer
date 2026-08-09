import { describe, expect, it } from 'vitest';
import { createEmptyColumnMapping } from '@/common/importFormat';
import { mapRowToUserBeanWithMapping } from '@/common/sheetParsers';

describe('mapRowToUserBeanWithMapping', () => {
  it('標準の3希望列と@形式のX IDを内部usernameへ変換する', () => {
    const user = mapRowToUserBeanWithMapping(
      ['Alice', '@sample_user', 'https://vrchat.com/home/user/usr_sample_user', 'Cast A', 'Cast B', 'Cast C'],
      { name: 0, x_id: 1, vrc_url: 2, cast1: 3, cast2: 4, cast3: 5, castInputType: 'single' },
    );

    expect(user).toMatchObject({
      name: 'Alice',
      x_id: 'sample_user',
      vrc_url: 'https://vrchat.com/home/user/usr_sample_user',
      casts: ['Cast A', 'Cast B', 'Cast C'],
      preference_mode: 'ranked',
    });
  });

  it('選択した名前列が空なら空のままにし、追加列を raw_extra に保持する', () => {
    const user = mapRowToUserBeanWithMapping(
      ['', 'VRC Alice', '@alice', 'memo value'],
      {
        name: 0,
        x_id: 2,
        vrc_url: -1,
        cast1: -1,
        cast2: -1,
        cast3: -1,
        castInputType: 'single',
        extraColumns: [{ columnIndex: 3, label: '備考' }],
      },
    );

    expect(user.name).toBe('');
    expect(user.raw_extra).toEqual([{ key: '備考', value: 'memo value' }]);
  });

  it('X ID形式に合わない値は問題行を確認できるよう原文を保持する', () => {
    const user = mapRowToUserBeanWithMapping(
      ['Alice', 'https://x.com/sample_user'],
      { name: 0, x_id: 1, vrc_url: -1, cast1: -1, cast2: -1, cast3: -1, castInputType: 'single' },
    );

    expect(user.x_id).toBe('https://x.com/sample_user');
  });

  it('順位ありで希望列を1列だけ指定した場合はカンマ区切りを分割しない', () => {
    const user = mapRowToUserBeanWithMapping(
      ['Alice', '@alice', 'Cast A, Cast B, Cast A, ,Cast C'],
      { name: 0, x_id: 1, vrc_url: -1, cast1: 2, cast2: -1, cast3: -1, castInputType: 'single' },
    );

    expect(user.preference_mode).toBe('ranked');
    expect(user.casts).toEqual(['Cast A, Cast B, Cast A, ,Cast C', '', '']);
  });

  it('複数指定形式では単一列の順不同希望をすべて変換する', () => {
    const castNames = Array.from({ length: 25 }, (_, index) => `Cast ${index + 1}`).join(',');
    const user = mapRowToUserBeanWithMapping(
      ['Alice', '@alice', castNames],
      {
        name: 0,
        x_id: 1,
        vrc_url: -1,
        cast1: 2,
        cast2: -1,
        cast3: -1,
        castInputType: 'multiple',
      },
    );

    expect(user.preference_mode).toBe('flat');
    expect(user.casts).toHaveLength(25);
    expect(user.casts[24]).toBe('Cast 25');
  });

  it('順位なし希望は件数を制限せず、同じ名称の重複だけを先頭の1件へまとめる', () => {
    const castNames = [
      'Cast A',
      'Cast B',
      'Cast A',
      ...Array.from({ length: 23 }, (_, index) => `Cast ${index + 1}`),
      'Cast B',
    ].join(',');
    const user = mapRowToUserBeanWithMapping(
      ['Alice', '@alice', castNames],
      {
        name: 0,
        x_id: 1,
        vrc_url: -1,
        cast1: 2,
        cast2: -1,
        cast3: -1,
        castInputType: 'multiple',
      },
    );

    expect(user.casts).toHaveLength(25);
    expect(user.casts.slice(0, 3)).toEqual(['Cast A', 'Cast B', 'Cast 1']);
    expect(user.casts.filter((name) => name === 'Cast A')).toHaveLength(1);
    expect(user.casts.filter((name) => name === 'Cast B')).toHaveLength(1);
  });
});

describe('ColumnMapping helpers', () => {
  it('空マッピングは全列を未選択にする', () => {
    expect(createEmptyColumnMapping()).toEqual({
      name: -1,
      x_id: -1,
      vrc_url: -1,
      cast1: -1,
      cast2: -1,
      cast3: -1,
      castInputType: 'single',
    });
  });
});
