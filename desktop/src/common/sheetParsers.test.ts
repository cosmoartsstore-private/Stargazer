import { describe, expect, it } from 'vitest';
import { createEmptyColumnMapping, hasRequiredIdentityColumn } from './importFormat';
import { mapRowToUserBeanWithMapping } from './sheetParsers';

describe('mapRowToUserBeanWithMapping', () => {
  it('標準の3希望列と X URL を UserBean に変換する', () => {
    const user = mapRowToUserBeanWithMapping(
      ['Alice', 'https://x.com/sample_user', 'https://vrchat.com/home/user/usr_sample_user', 'Cast A', 'Cast B', 'Cast C'],
      { name: 0, x_id: 1, vrc_url: 2, cast1: 3, cast2: 4, cast3: 5 },
    );

    expect(user).toMatchObject({
      name: 'Alice',
      x_id: 'sample_user',
      vrc_url: 'https://vrchat.com/home/user/usr_sample_user',
      casts: ['Cast A', 'Cast B', 'Cast C'],
      preference_mode: 'ranked',
    });
  });

  it('名前の主列が空なら代替列を使い、追加列を raw_extra に保持する', () => {
    const user = mapRowToUserBeanWithMapping(
      ['', 'VRC Alice', '@alice', 'memo value'],
      {
        name: 0,
        nameColumn2: 1,
        x_id: 2,
        vrc_url: -1,
        cast1: -1,
        cast2: -1,
        cast3: -1,
        extraColumns: [{ columnIndex: 3, label: '備考' }],
      },
    );

    expect(user.name).toBe('VRC Alice');
    expect(user.raw_extra).toEqual([{ key: '備考', value: 'memo value' }]);
  });

  it('単一希望列は順不同希望として重複を除外する', () => {
    const user = mapRowToUserBeanWithMapping(
      ['Alice', '@alice', 'Cast A, Cast B, Cast A, ,Cast C'],
      { name: 0, x_id: 1, vrc_url: -1, cast1: 2, cast2: -1, cast3: -1 },
    );

    expect(user.preference_mode).toBe('flat');
    expect(user.casts).toEqual(['Cast A', 'Cast B', 'Cast C']);
  });

  it('splitCommaColumnIndex 指定時は単一列を最大20件の順不同希望に変換する', () => {
    const castNames = Array.from({ length: 25 }, (_, index) => `Cast ${index + 1}`).join(',');
    const user = mapRowToUserBeanWithMapping(
      ['Alice', '@alice', castNames],
      { name: 0, x_id: 1, vrc_url: -1, cast1: 2, cast2: 3, cast3: 4 },
      { splitCommaColumnIndex: 2 },
    );

    expect(user.preference_mode).toBe('flat');
    expect(user.casts).toHaveLength(20);
    expect(user.casts[19]).toBe('Cast 20');
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
    });
  });

  it('X ID 列が選択されている場合だけ必須列ありと判定する', () => {
    expect(hasRequiredIdentityColumn({ ...createEmptyColumnMapping(), x_id: 2 })).toBe(true);
    expect(hasRequiredIdentityColumn(createEmptyColumnMapping())).toBe(false);
  });
});
