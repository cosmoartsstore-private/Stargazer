import { findUnavailableCastReferences } from '@/common/castReferences';
import type { CastBean, UserBean } from '@/common/types/entities';
import { findXIdIdentityIssues, type XIdIdentityIssue } from '@/common/xIdUtils';
import type { MatchedCast, TableSlot } from '@/features/matching/logics/matching-io';
import { findUnavailableMatchingResultCasts } from '@/features/matching/logics/matching-result-integrity';
import type { MatchingTypeCode } from '@/common/types/sessionWorkflow';
import { getMsg } from '@/messages/getMsg';
import { getDisabledDataManagementTabs } from './dataManagementNavigation';

export interface DataManagementViewModel {
  attendingCastNames: string[];
  hasApplicants: boolean;
  applicantIdentityIssues: XIdIdentityIssue[];
  hasApplicantIdentityIssues: boolean;
  isLotteryOnly: boolean;
  showUnavailableCastWarning: boolean;
  hasUnavailableApplicantCastReferences: boolean;
  hasUnavailableMatchingResultCasts: boolean;
  hasUnresolvedCastReferences: boolean;
  hasDeletedApplicantCastReferences: boolean;
  hasDeletedCastReferences: boolean;
  unavailableCastNames: string;
  disabledTabs: Set<'import' | 'lottery' | 'matching'>;
}

interface BuildDataManagementViewModelParams {
  applicants: UserBean[];
  casts: CastBean[];
  currentWinners: UserBean[];
  matchingResult: Map<string, MatchedCast[]> | null;
  tableSlots: TableSlot[] | undefined;
  matchingTypeCode: MatchingTypeCode;
  isLotteryResultCurrent: boolean;
}

/** 応募管理の工程可否と、入力・結果に残る参照警告を同じsnapshotから導出する。 */
export function buildDataManagementViewModel({
  applicants,
  casts,
  currentWinners,
  matchingResult,
  tableSlots,
  matchingTypeCode,
  isLotteryResultCurrent,
}: BuildDataManagementViewModelParams): DataManagementViewModel {
  const attendingCastNames = casts.filter((cast) => cast.is_present).map((cast) => cast.name);
  const applicantIdentityIssues = findXIdIdentityIssues(applicants.map((applicant, index) => ({
    rowNumber: index + 1,
    xId: applicant.x_id,
  })));
  const hasApplicants = applicants.length > 0;
  const hasApplicantIdentityIssues = applicantIdentityIssues.length > 0;
  const hasWinners = currentWinners.length > 0;
  const isLotteryOnly = matchingTypeCode === 'M000';

  const unavailableCastReferences = findUnavailableCastReferences(applicants, casts);
  const unavailableResultCasts = findUnavailableMatchingResultCasts(
    matchingResult,
    tableSlots,
    casts,
  );
  const relevantUnavailableResultCasts = isLotteryOnly ? [] : unavailableResultCasts;
  const hasUnavailableCastReferences = unavailableCastReferences.length > 0
    || relevantUnavailableResultCasts.length > 0;
  const hasUnavailableApplicantCastReferences = unavailableCastReferences.length > 0;
  const hasUnavailableMatchingResultCasts = relevantUnavailableResultCasts.length > 0;
  const hasUnresolvedCastReferences = unavailableCastReferences.some(
    (reference) => reference.reason === 'unresolved',
  );
  const hasDeletedApplicantCastReferences = unavailableCastReferences.some(
    (reference) => reference.reason === 'deleted',
  );
  const hasDeletedCastReferences = relevantUnavailableResultCasts.length > 0
    || unavailableCastReferences.some((reference) => reference.reason === 'deleted');
  const names = [...new Set(
    unavailableCastReferences
      .map((reference) => reference.castName)
      .concat(relevantUnavailableResultCasts.map((cast) => cast.name))
      .filter(Boolean),
  )];
  const unavailableCastNames = names.length <= 3
    ? names.join('、')
    : getMsg('DataManagementPage.moreUnavailableCasts', {
        names: names.slice(0, 3).join('、'),
        count: names.length - 3,
      });

  return {
    attendingCastNames,
    hasApplicants,
    applicantIdentityIssues,
    hasApplicantIdentityIssues,
    isLotteryOnly,
    showUnavailableCastWarning: hasUnavailableCastReferences,
    hasUnavailableApplicantCastReferences,
    hasUnavailableMatchingResultCasts,
    hasUnresolvedCastReferences,
    hasDeletedApplicantCastReferences,
    hasDeletedCastReferences,
    unavailableCastNames,
    disabledTabs: getDisabledDataManagementTabs({
      hasApplicants,
      hasApplicantIdentityIssues,
      hasWinners,
      isLotteryOnly,
      isLotteryResultCurrent,
    }),
  };
}
