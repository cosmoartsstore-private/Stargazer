import { describe, expect, it } from 'vitest';
import { validateLotteryConditions, type LotteryValidationParams } from '@/features/lottery/services/lottery-validation';

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
    expect(result.info[0]).toBe('抽選のみを行うため、席数・ラウンド数・出席キャスト数は使用しません。');
    expect(result.info[result.info.length - 1]).toBe('合計当選者数：抽選2名＋確定1名＝8名');
  });

  it('M001/M002 系では席数不足と出席キャスト不足を error にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M002',
      totalWinners: 4,
      totalTables: 2,
      activeCastCount: 3,
    }));

    expect(result.errors).toEqual([
      '総テーブル数（2）が当選者数（4名）より少なくなっています。',
      '当選者数（4名）が出席キャスト数（3名）を上回るため、全員を同時に割り当てられません。',
    ]);
    expect(result.info).toContain('合計席数：2席');
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
      '出席キャスト数（4名）が当選者数（2名）を上回るため、待機キャストが生じる可能性があります。',
    ]);
    expect(result.info[result.info.length - 1]).toBe('合計当選者数：抽選2名＋確定0名＝2名');
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

    expect(result.errors).toContain('当選者数（3名）が1テーブルのゲスト数（2名）で割り切れないため、空席が生じます。「当日枠を含める」を選択してください。');
    expect(result.errors).toContain('総テーブル数を3にすると空のテーブルが生じます。当選者数に必要な2テーブルに変更してください。');
    expect(result.warnings).toContain('当選者数（3名）が1ラウンドの接客枠（4名）を下回るため、空席または待機キャストが生じる可能性があります。');
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
    expect(result.info).toContain('合計席数：通常4席＋当日枠1席＝5席');
    expect(result.warnings).toEqual([
      '合計席数が当選者数より1席多いため、当日枠または空席として扱います。',
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
      '当選者8名を配置するには8席必要ですが、合計席数は4席です。',
      '出席キャスト数（5名）が1ラウンドあたりのキャスト数（2名）で割り切れません。',
      '当選者数（8名）が1ラウンドの接客枠（2テーブル×2名＝4名）を超えています。出席キャスト数またはテーブル設定を見直してください。',
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

    expect(result.errors).toContain('出席キャスト数（5名）が1ラウンドあたりのキャスト数（2名）で割り切れません。');
    expect(result.errors).toContain('当選者数（6名）が1ラウンドの接客枠（2テーブル×2名＝4名）を超えています。出席キャスト数またはテーブル設定を見直してください。');
    expect(result.errors.join('\n')).not.toContain('2.5テーブル');
  });
});
