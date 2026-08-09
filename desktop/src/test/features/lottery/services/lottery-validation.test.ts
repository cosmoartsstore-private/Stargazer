import { describe, expect, it } from 'vitest';
import { validateLotteryConditions, type LotteryValidationParams } from '@/features/lottery/services/lottery-validation';

function baseParams(overrides: Partial<LotteryValidationParams> = {}): LotteryValidationParams {
  return {
    matchingTypeCode: 'M001',
    totalWinners: 3,
    lotteryCount: 2,
    guaranteedCount: 1,
    rotationCount: 2,
    totalTables: 3,
    activeCastCount: 3,
    castsPerRotation: 1,
    usersPerTable: 1,
    reserveSameDaySlots: false,
    sameDaySlotCount: 0,
    sameDaySlotUnit: 'table',
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

  it('M001/M002 は抽選対象テーブルと担当キャストの不足を error にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M002',
      totalWinners: 4,
      totalTables: 2,
      activeCastCount: 3,
    }));

    expect(result.errors).toEqual([
      '当日枠を除いた抽選対象テーブル数（2）が当選者数（4名）より少なくなっています。',
      '当選者と当日枠に必要なテーブル数（4）が出席キャスト数（3名）を上回るため、すべてのテーブルを同時に担当できません。',
    ]);
    expect(result.info).toContain('抽選対象テーブル数：総2テーブル－当日枠0テーブル＝2テーブル');
  });

  it('M001/M002 は出席キャストが余る場合を warning にする', () => {
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
      '出席キャスト数（4名）が当選者と当日枠に必要なテーブル数（2）を上回るため、待機キャストが生じる可能性があります。',
    ]);
    expect(result.info[result.info.length - 1]).toBe('合計当選者数：抽選2名＋確定0名＝2名');
  });

  it('M001/M002 の当日枠は1件を1テーブルとして総テーブル数から確保する', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M001',
      totalWinners: 2,
      totalTables: 3,
      activeCastCount: 3,
      reserveSameDaySlots: true,
      sameDaySlotCount: 1,
      sameDaySlotUnit: 'person',
    }));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.info).toContain('抽選対象テーブル数：総3テーブル－当日枠1テーブル＝2テーブル');
  });

  it('M003 は当日枠なしの空席と空きテーブルを error にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 3,
      totalTables: 3,
      activeCastCount: 4,
      castsPerRotation: 2,
      usersPerTable: 2,
    }));

    expect(result.errors).toContain('抽選対象席に3席の空きが生じます。当日枠として確保する場合は「当日枠を確保する」を有効にしてください。');
    expect(result.errors).toContain('総テーブル数を3にすると、当選者に必要な2テーブル以外が空きます。当日枠として確保するか、総テーブル数を変更してください。');
    expect(result.warnings).toContain('当選者数（3名）が、出席キャスト数で稼働できる2テーブルから当日枠0席を確保した接客枠（4名）を下回るため、空席または待機キャストが生じる可能性があります。');
  });

  it('M003 の1名単位は指定人数分の席を総席数から確保する', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 3,
      totalTables: 2,
      activeCastCount: 4,
      castsPerRotation: 2,
      usersPerTable: 2,
      reserveSameDaySlots: true,
      sameDaySlotCount: 1.8,
      sameDaySlotUnit: 'person',
    }));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.info).toContain('抽選対象席数：全2テーブル（4席）－当日枠1名分（1席）＝3席');
  });

  it('M003 の1テーブル単位は1テーブル分の全席を確保する', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 2,
      totalTables: 2,
      activeCastCount: 4,
      castsPerRotation: 2,
      usersPerTable: 2,
      reserveSameDaySlots: true,
      sameDaySlotCount: 1,
      sameDaySlotUnit: 'table',
    }));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.info).toContain('抽選対象席数：全2テーブル（4席）－当日枠1テーブル（2席）＝2席');
  });

  it('M003 は席数不足、キャスト数の割り切れなさ、接客枠不足を error にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 8,
      totalTables: 2,
      activeCastCount: 5,
      castsPerRotation: 2,
      usersPerTable: 2,
      reserveSameDaySlots: true,
      sameDaySlotCount: Number.NaN,
    }));

    expect(result.errors).toEqual([
      '当選者8名を配置するには8席必要ですが、当日枠を除いた抽選対象席数は4席です。',
      '出席キャスト数（5名）が1テーブル・1ラウンドあたりのキャスト数（2名）で割り切れません。',
      '当選者数（8名）が、出席キャスト数で稼働できる2テーブルから当日枠0席を確保した接客枠（4名）を超えています。出席キャスト数またはテーブル設定を見直してください。',
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
      reserveSameDaySlots: true,
    }));

    expect(result.errors).toContain('出席キャスト数（5名）が1テーブル・1ラウンドあたりのキャスト数（2名）で割り切れません。');
    expect(result.errors).toContain('当選者数（6名）が、出席キャスト数で稼働できる2テーブルから当日枠0席を確保した接客枠（4名）を超えています。出席キャスト数またはテーブル設定を見直してください。');
    expect(result.errors.join('\n')).not.toContain('2.5テーブル');
  });

  it('M003 は10テーブルにゲスト2名、担当キャスト10名なら20名を接客枠内とする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 20,
      lotteryCount: 20,
      guaranteedCount: 0,
      totalTables: 10,
      activeCastCount: 10,
      castsPerRotation: 1,
      usersPerTable: 2,
    }));

    expect(result.errors).toEqual([]);
    expect(result.info).toContain('抽選対象席数：全10テーブル（20席）－当日枠0テーブル（0席）＝20席');
  });

  it('M003 で当日枠を1テーブル確保すると20席中18席を抽選対象にする', () => {
    const result = validateLotteryConditions(baseParams({
      matchingTypeCode: 'M003',
      totalWinners: 20,
      lotteryCount: 20,
      guaranteedCount: 0,
      totalTables: 10,
      activeCastCount: 10,
      castsPerRotation: 1,
      usersPerTable: 2,
      reserveSameDaySlots: true,
      sameDaySlotCount: 1,
      sameDaySlotUnit: 'table',
    }));

    expect(result.info).toContain('抽選対象席数：全10テーブル（20席）－当日枠1テーブル（2席）＝18席');
    expect(result.errors).toContain('当選者20名を配置するには20席必要ですが、当日枠を除いた抽選対象席数は18席です。');
  });
});
