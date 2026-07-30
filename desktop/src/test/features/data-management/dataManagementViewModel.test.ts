import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import type { MatchedCast, TableSlot } from '@/features/matching/logics/matching-io';
import { buildDataManagementViewModel } from '@/features/data-management/dataManagementViewModel';

function user(overrides: Partial<UserBean> = {}): UserBean {
  return {
    name: 'Applicant',
    x_id: '@applicant',
    casts: [],
    raw_extra: [],
    ...overrides,
  };
}

function cast(id: number, name: string, isPresent = true): CastBean {
  return { id, name, is_present: isPresent };
}

function match(value: CastBean): MatchedCast {
  return { cast: value, rank: 0 };
}

describe('buildDataManagementViewModel', () => {
  it('現在の出席者と有効な応募・抽選状態から利用可能な工程を構築する', () => {
    const applicant = user();

    const viewModel = buildDataManagementViewModel({
      applicants: [applicant],
      casts: [cast(1, 'Cast A'), cast(2, 'Cast B', false)],
      currentWinners: [applicant],
      matchingResult: null,
      tableSlots: undefined,
      matchingTypeCode: 'M001',
      isLotteryResultCurrent: true,
    });

    expect(viewModel).toEqual({
      attendingCastNames: ['Cast A'],
      hasApplicants: true,
      applicantIdentityIssues: [],
      hasApplicantIdentityIssues: false,
      isLotteryOnly: false,
      showUnavailableCastWarning: false,
      hasUnavailableApplicantCastReferences: false,
      hasUnavailableMatchingResultCasts: false,
      hasUnresolvedCastReferences: false,
      hasDeletedApplicantCastReferences: false,
      hasDeletedCastReferences: false,
      unavailableCastNames: '',
      disabledTabs: new Set(),
    });
  });

  it('空欄と重複したX IDの行を返し、抽選とマッチングを利用不可にする', () => {
    const applicants = [
      user({ name: 'First', x_id: ' Duplicate ' }),
      user({ name: 'Second', x_id: 'duplicate' }),
      user({ name: 'Third', x_id: '   ' }),
    ];

    const viewModel = buildDataManagementViewModel({
      applicants,
      casts: [],
      currentWinners: [applicants[0]],
      matchingResult: null,
      tableSlots: undefined,
      matchingTypeCode: 'M001',
      isLotteryResultCurrent: true,
    });

    expect(viewModel.applicantIdentityIssues).toEqual([
      { rowNumber: 1, xId: ' Duplicate ', kind: 'duplicate' },
      { rowNumber: 2, xId: 'duplicate', kind: 'duplicate' },
      { rowNumber: 3, xId: '   ', kind: 'empty' },
    ]);
    expect(viewModel.hasApplicantIdentityIssues).toBe(true);
    expect(viewModel.disabledTabs).toEqual(new Set(['lottery', 'matching']));
  });

  it('未解決・削除済み・結果内の参照をまとめ、4件以上は先頭3件と残数で表示する', () => {
    const applicants = [
      user({ name: 'Legacy', x_id: '@legacy', casts: ['未解決A'] }),
      user({ name: 'Deleted', x_id: '@deleted', casts: ['削除A'], cast_ids: [99] }),
    ];
    const resultCast = cast(100, '結果A');
    const slotCast = cast(101, '結果B');
    const matchingResult = new Map([['@legacy', [match(resultCast)]]]);
    const tableSlots: TableSlot[] = [
      { user: null, matches: [match(slotCast), match(resultCast)] },
    ];

    const viewModel = buildDataManagementViewModel({
      applicants,
      casts: [cast(1, 'Current')],
      currentWinners: applicants,
      matchingResult,
      tableSlots,
      matchingTypeCode: 'M002',
      isLotteryResultCurrent: true,
    });

    expect(viewModel.showUnavailableCastWarning).toBe(true);
    expect(viewModel.hasUnavailableApplicantCastReferences).toBe(true);
    expect(viewModel.hasUnavailableMatchingResultCasts).toBe(true);
    expect(viewModel.hasUnresolvedCastReferences).toBe(true);
    expect(viewModel.hasDeletedApplicantCastReferences).toBe(true);
    expect(viewModel.hasDeletedCastReferences).toBe(true);
    expect(viewModel.unavailableCastNames).toBe('未解決A、削除A、結果A、ほか1件');
    expect(viewModel.disabledTabs).toEqual(new Set());
  });

  it('抽選のみでも応募者の参照問題を警告し、結果由来の問題は対象外にする', () => {
    const applicant = user({ casts: ['未解決'], cast_ids: [null] });

    const viewModel = buildDataManagementViewModel({
      applicants: [applicant],
      casts: [],
      currentWinners: [applicant],
      matchingResult: null,
      tableSlots: undefined,
      matchingTypeCode: 'M000',
      isLotteryResultCurrent: true,
    });

    expect(viewModel.isLotteryOnly).toBe(true);
    expect(viewModel.hasUnresolvedCastReferences).toBe(true);
    expect(viewModel.showUnavailableCastWarning).toBe(true);
    expect(viewModel.hasUnavailableApplicantCastReferences).toBe(true);
    expect(viewModel.hasUnavailableMatchingResultCasts).toBe(false);
    expect(viewModel.disabledTabs).toEqual(new Set(['matching']));
  });

  it('応募者がいなければ抽選とマッチングを利用不可にする', () => {
    const viewModel = buildDataManagementViewModel({
      applicants: [],
      casts: [],
      currentWinners: [],
      matchingResult: null,
      tableSlots: undefined,
      matchingTypeCode: 'M001',
      isLotteryResultCurrent: false,
    });

    expect(viewModel.hasApplicants).toBe(false);
    expect(viewModel.disabledTabs).toEqual(new Set(['lottery', 'matching']));
  });
});
