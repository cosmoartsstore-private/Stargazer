import { describe, expect, it } from 'vitest';
import { validateLotteryConditions, type LotteryValidationParams } from './lottery-validation';

function baseParams(overrides: Partial<LotteryValidationParams> = {}): LotteryValidationParams {
  return {
    matchingTypeCode: 'M001',
    totalWinners: 3,
    lotteryCount: 2,
    guaranteedCount: 1,
    totalTables: 3,
    activeCastCount: 3,
    castsPerRotation: 1,
    usersPerTable: 1,
    allowM003EmptySeats: false,
    sameDaySlotCount: 0,
    ...overrides,
  };
}

describe('validateLotteryConditions', () => {
  it('M000 は席数とキャスト数を検証対象外として扱う', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M000',
      totalWinners: 8,
      totalTables: 1,
      activeCastCount: 0,
    }));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.info[0]).toBe('抽選のみ行うため、席数・ラウンド数・出席キャスト数は検証対象外です。');
    expect(result.info[result.info.length - 1]).toBe('合計当選者数: 抽選 2 名 + 確定 1 名 = 合計 8 名です。');
  });

  it('M001/M002 系では席数不足と出席キャスト不足を error にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M002',
      totalWinners: 4,
      totalTables: 2,
      activeCastCount: 3,
    }));

    expect(result.errors).toEqual([
      '総テーブル数（2）が当選者数（4 名）より少なくなっています。',
      '当選者数（4名）が出勤キャスト数（3名）を上回っています。現在のマッチング方式では全員に同時割り当てできません。',
    ]);
    expect(result.info).toContain('合計席数: 総テーブル数 2 = 合計 2 席です。');
  });

  it('M001/M002 系では出席キャストが余る場合を warning にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M001',
      totalWinners: 2,
      totalTables: 2,
      activeCastCount: 4,
      lotteryCount: undefined,
      guaranteedCount: 0,
    }));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      '出勤キャスト数（4名）が当選者数（2名）を上回っています。待機状態となるキャストが発生する可能性があります。',
    ]);
    expect(result.info[result.info.length - 1]).toBe('合計当選者数: 抽選 2 名 + 確定 0 名 = 合計 2 名です。');
  });

  it('M003 は当日枠なしの端数席と空きテーブルを error にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 3,
      totalTables: 3,
      activeCastCount: 4,
      castsPerRotation: 2,
      usersPerTable: 2,
      allowM003EmptySeats: false,
    }));

    expect(result.errors).toContain('当選者数（3 名）が「1テーブルのユーザー数（2）」で割り切れないため端数の空席が発生します。「当日枠を含める」を有効にしてください。');
    expect(result.errors).toContain('指定された条件（総テーブル数3）では誰も座らない空きテーブルが発生します。総テーブル数は当選者配置に必要な2に合わせてください。');
    expect(result.warnings).toContain('当選者数（3名）が1ローテの接客枠（4名）を下回っています。空席や待機状態のキャストが発生する可能性があります。');
  });

  it('M003 は当日枠を整数化し、席数超過を warning にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 4,
      totalTables: 2,
      activeCastCount: 4,
      castsPerRotation: 2,
      usersPerTable: 2,
      allowM003EmptySeats: true,
      sameDaySlotCount: 1.8,
    }));

    expect(result.errors).toEqual([]);
    expect(result.info).toContain('合計席数: 通常 4 席 + 当日枠 1 席 = 合計 5 席です。');
    expect(result.warnings).toEqual([
      '当選者数より合計席数が 1 席多くなっています。当日枠または空席として扱います。',
    ]);
  });

  it('M003 は席数不足、キャスト数の割り切れなさ、接客枠不足を error にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 8,
      totalTables: 2,
      activeCastCount: 5,
      castsPerRotation: 2,
      usersPerTable: 2,
      allowM003EmptySeats: true,
      sameDaySlotCount: Number.NaN,
    }));

    expect(result.errors).toEqual([
      '合計席数（4 席）が当選者配置に必要な席数（8 席）より少なくなっています。',
      '出席キャスト数（5 名）が「1ローテあたりのキャスト数（2）」で割り切れません。',
      '当選者数（8名）が1ローテの接客枠（2テーブル × 2人 = 4名）を上回っています。出勤キャスト数またはテーブル設定を見直してください。',
    ]);
  });

  it('M003 の接客枠は完全なキャストグループ数だけで表示する', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 6,
      totalTables: 3,
      activeCastCount: 5,
      castsPerRotation: 2,
      usersPerTable: 2,
      allowM003EmptySeats: true,
    }));

    expect(result.errors).toContain('出席キャスト数（5 名）が「1ローテあたりのキャスト数（2）」で割り切れません。');
    expect(result.errors).toContain('当選者数（6名）が1ローテの接客枠（2テーブル × 2人 = 4名）を上回っています。出勤キャスト数またはテーブル設定を見直してください。');
    expect(result.errors.join('\n')).not.toContain('2.5テーブル');
  });
});
