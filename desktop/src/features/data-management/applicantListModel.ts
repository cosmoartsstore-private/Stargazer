import type { CastBean, CautionUser, UserBean } from '@/common/types/entities';
import { findUnavailableCastReferences } from '@/common/castReferences';
import { findXIdIdentityIssues, normalizeXAccountId } from '@/common/xIdUtils';
import {
  getCautionNGCastNames,
  isCautionUser,
} from '@/features/matching/logics/caution-user';

export type ApplicantFilterMode = 'all' | 'caution' | 'castIssue';

export interface ApplicantRowData {
  isCaution: boolean;
  hasIdentityIssue: boolean;
  ngCastNames: string[];
  unavailablePreferenceIndexes: number[];
}

export interface ApplicantListViewModel {
  rowDataMap: Map<UserBean, ApplicantRowData>;
  cautionCount: number;
  castIssueCount: number;
  filteredUsers: UserBean[];
  isFlatList: boolean;
  flatCastColumnIndexes: number[];
}

export const EMPTY_APPLICANT_ROW_DATA: Readonly<ApplicantRowData> = {
  isCaution: false,
  hasIdentityIssue: false,
  ngCastNames: [],
  unavailablePreferenceIndexes: [],
};

/** 応募者を一度だけ走査し、警告・絞り込み・希望列構造を同時に確定する。 */
export function buildApplicantListViewModel(
  applicants: UserBean[],
  casts: CastBean[],
  filterMode: ApplicantFilterMode,
  cautionUsers: CautionUser[],
  candidateThreshold: number,
): ApplicantListViewModel {
  const identityIssueUsers = new Set(
    findXIdIdentityIssues(applicants.map((user, index) => ({
      rowNumber: index + 1,
      xId: user.x_id,
    }))).map((issue) => applicants[issue.rowNumber - 1]),
  );
  const rowDataMap = new Map<UserBean, ApplicantRowData>();
  const filteredUsers: UserBean[] = [];
  let cautionCount = 0;
  let castIssueCount = 0;
  let isFlatList = false;
  let flatCastColumnCount = 1;

  for (const user of applicants) {
    const ngCastNames = getCautionNGCastNames(user, casts);
    const hasCandidateIdentity = user.name.trim() !== ''
      && normalizeXAccountId(user.x_id) !== null;
    const isAutoCaution = hasCandidateIdentity && ngCastNames.length >= candidateThreshold;
    const isCaution = isAutoCaution || isCautionUser(user, cautionUsers);
    const unavailablePreferenceIndexes = findUnavailableCastReferences([user], casts)
      .map((reference) => reference.preferenceIndex);
    rowDataMap.set(user, {
      isCaution,
      hasIdentityIssue: identityIssueUsers.has(user),
      ngCastNames,
      unavailablePreferenceIndexes,
    });
    if (isCaution) cautionCount += 1;
    if (unavailablePreferenceIndexes.length > 0) castIssueCount += 1;
    if (
      filterMode === 'all'
      || (filterMode === 'caution' && isCaution)
      || (filterMode === 'castIssue' && unavailablePreferenceIndexes.length > 0)
    ) filteredUsers.push(user);
    if (user.preference_mode === 'flat') isFlatList = true;
    flatCastColumnCount = Math.max(flatCastColumnCount, user.casts.length);
  }

  return {
    rowDataMap,
    cautionCount,
    castIssueCount,
    filteredUsers,
    isFlatList,
    flatCastColumnIndexes: Array.from({ length: flatCastColumnCount }, (_, index) => index),
  };
}
