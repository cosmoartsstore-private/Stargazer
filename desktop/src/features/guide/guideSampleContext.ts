import type { SetStateAction } from 'react';
import type { UserBean, CastBean } from '@/common/types/entities';
import type { MatchedCast, TableSlot } from '@/features/matching/logics/matching-io';
import type { MatchingSettingsState } from '@/features/matching/stores/matching-settings-store';
import type { AppContextType } from '@/stores/AppContext';
import type { PageType } from '@/layout/appNavigation';
import { getMsg } from '@/messages/getMsg';

export type FeatureId =
  | 'applicant-data'
  | 'import'
  | 'lottery'
  | 'matching'
  | 'cast'
  | 'ng'
  | 'attendance'
  | 'tweet';

// 実画面プレビューで共有する代表的なキャストと応募者。
const GUIDE_SAMPLE_CASTS: CastBean[] = [
  {
    id: -1,
    name: getMsg('GuidePage.sample.castA'),
    aliases: [getMsg('GuidePage.sample.castAAlias')],
    is_present: true,
    group_name: getMsg('GuidePage.sample.group1'),
    memo: getMsg('GuidePage.sample.profileMemo'),
    contact_urls: [getMsg('GuidePage.sample.castAContact')],
    ng_entries: [{
      username: getMsg('GuidePage.sample.applicant001'),
      accountId: getMsg('GuidePage.sample.xId001'),
      notes: getMsg('GuidePage.sample.ngNoteA'),
    }],
  },
  {
    id: -2,
    name: getMsg('GuidePage.sample.castB'),
    is_present: true,
    group_name: getMsg('GuidePage.sample.group1'),
    contact_urls: [getMsg('GuidePage.sample.castBContact')],
  },
  {
    id: -3,
    name: getMsg('GuidePage.sample.castC'),
    is_present: true,
    group_name: getMsg('GuidePage.sample.group2'),
    contact_urls: [getMsg('GuidePage.sample.castCContact')],
  },
  {
    id: -4,
    name: getMsg('GuidePage.sample.castD'),
    is_present: false,
    group_name: getMsg('GuidePage.sample.group2'),
    contact_urls: [getMsg('GuidePage.sample.castDContact')],
  },
  {
    id: -5,
    name: getMsg('GuidePage.sample.castE'),
    is_present: true,
    group_name: getMsg('GuidePage.sample.group3'),
    contact_urls: [getMsg('GuidePage.sample.castEContact')],
    ng_entries: [{
      username: getMsg('GuidePage.sample.applicant001'),
      accountId: getMsg('GuidePage.sample.xId001'),
      notes: getMsg('GuidePage.sample.ngNoteE'),
    }],
  },
];

const GUIDE_SAMPLE_USERS: UserBean[] = [
  { name: getMsg('GuidePage.sample.applicant001'), x_id: getMsg('GuidePage.sample.xId001'), casts: [getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC')], is_guaranteed: true, raw_extra: [] },
  { name: getMsg('GuidePage.sample.applicant002'), x_id: getMsg('GuidePage.sample.xId002'), casts: [getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC'), getMsg('GuidePage.sample.castE')], raw_extra: [] },
  { name: getMsg('GuidePage.sample.applicant003'), x_id: getMsg('GuidePage.sample.xId003'), casts: [getMsg('GuidePage.sample.castC'), getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB')], raw_extra: [] },
  { name: getMsg('GuidePage.sample.applicant004'), x_id: getMsg('GuidePage.sample.xId004'), casts: [getMsg('GuidePage.sample.castE'), getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castA')], raw_extra: [] },
  { name: getMsg('GuidePage.sample.applicant005'), x_id: getMsg('GuidePage.sample.xId005'), casts: [getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castC'), getMsg('GuidePage.sample.castE')], raw_extra: [] },
  { name: getMsg('GuidePage.sample.applicant006'), x_id: getMsg('GuidePage.sample.xId006'), casts: [getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castE'), getMsg('GuidePage.sample.castC')], raw_extra: [] },
  { name: getMsg('GuidePage.sample.applicant007'), x_id: getMsg('GuidePage.sample.xId007'), casts: [getMsg('GuidePage.sample.castC'), getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castA')], raw_extra: [] },
  { name: getMsg('GuidePage.sample.applicant008'), x_id: getMsg('GuidePage.sample.xId008'), casts: [getMsg('GuidePage.sample.castE'), getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB')], raw_extra: [] },
];

const GUIDE_SAMPLE_WINNERS: UserBean[] = GUIDE_SAMPLE_USERS.slice(0, 5).map((user, index) => ({
  ...user,
  is_guaranteed: index === 0,
}));

// マッチング画面のプレビューだけが利用する確定済み結果。
const GUIDE_SAMPLE_MATCHING_RESULT: Map<string, MatchedCast[]> = new Map([
  [getMsg('GuidePage.sample.xId001'), [{ cast: GUIDE_SAMPLE_CASTS[0], rank: 1, rotationIndex: 0, score: 100 }]],
  [getMsg('GuidePage.sample.xId002'), [{ cast: GUIDE_SAMPLE_CASTS[1], rank: 1, rotationIndex: 0, score: 100 }]],
  [getMsg('GuidePage.sample.xId003'), [{ cast: GUIDE_SAMPLE_CASTS[2], rank: 1, rotationIndex: 0, score: 100 }]],
  [getMsg('GuidePage.sample.xId004'), [{ cast: GUIDE_SAMPLE_CASTS[4], rank: 1, rotationIndex: 0, score: 100 }]],
  [getMsg('GuidePage.sample.xId005'), [{ cast: GUIDE_SAMPLE_CASTS[0], rank: 1, rotationIndex: 1, score: 100 }]],
]);
const GUIDE_SAMPLE_TABLE_SLOTS: TableSlot[] = GUIDE_SAMPLE_WINNERS.map((user, index) => ({
  user,
  tableIndex: index + 1,
  matches: GUIDE_SAMPLE_MATCHING_RESULT.get(user.x_id) ?? [],
}));

const GUIDE_SAMPLE_MATCHING_SETTINGS: MatchingSettingsState = {
  searchMode: 'efficiency',
  caution: {
    candidateThreshold: 2,
    cautionUsers: [{
      username: getMsg('GuidePage.sample.applicant001'),
      accountId: getMsg('GuidePage.sample.xId001'),
      ngCastCount: 2,
      notes: `${getMsg('GuidePage.sample.cautionReason')}\n${getMsg('GuidePage.sample.cautionNote')}`,
      registeredAt: getMsg('GuidePage.sample.registeredAt'),
    }],
  },
};

// Guide上のfeature名を、実画面が参照するPageTypeへ対応付ける。
const GUIDE_FEATURE_PAGE: Record<FeatureId, PageType> = {
  'applicant-data': 'import',
  import: 'import',
  lottery: 'lottery',
  matching: 'matching',
  cast: 'cast',
  ng: 'ngManagement',
  attendance: 'attendance',
  tweet: 'tweet',
};

/** 実画面プレビュー内の操作を状態へ反映しないための共通関数。 */
export function noopGuideSampleAction(): void {}
async function noopAsync(): Promise<void> {}
function noopSetState<T>(_value: SetStateAction<T>): void {}

/** featureごとの代表状態を持つ、操作を伴わない実画面プレビュー用Contextを作る。 */
export function createGuideSampleContext(feature: FeatureId): AppContextType {
  const activePage = GUIDE_FEATURE_PAGE[feature];
  // 取込画面は未取込、抽選画面は抽選済み、マッチング画面は割り当て済みで表示する。
  const applicants = feature === 'import' ? [] : GUIDE_SAMPLE_USERS;
  const casts = feature === 'matching'
    ? GUIDE_SAMPLE_CASTS.map((cast) => ({ ...cast, is_present: true }))
    : GUIDE_SAMPLE_CASTS;
  const currentWinners = feature === 'matching' || feature === 'lottery' ? GUIDE_SAMPLE_WINNERS : [];
  const isMatchingPreview = feature === 'matching';

  return {
    activePage,
    setActivePage: noopGuideSampleAction,
    casts,
    setCasts: noopSetState,
    applicants,
    setApplicants: noopGuideSampleAction,
    currentWinners,
    setCurrentWinners: noopGuideSampleAction,
    isLotteryResultCurrent: true,
    setIsLotteryResultCurrent: noopGuideSampleAction,
    sessionWorkflow: {
      matchingTypeCode: 'M003',
      lotteryCount: 4,
      rotationCount: 2,
      totalTables: 5,
      usersPerTable: 1,
      castsPerRotation: 1,
      allowM003EmptySeats: false,
      m003SameDaySlotCount: 0,
    },
    updateSessionWorkflow: noopAsync,
    hydrateSessionWorkflow: noopGuideSampleAction,
    matchingSettings: GUIDE_SAMPLE_MATCHING_SETTINGS,
    setMatchingSettings: noopGuideSampleAction,
    matchingResultState: {
      result: isMatchingPreview ? GUIDE_SAMPLE_MATCHING_RESULT : null,
      tableSlots: isMatchingPreview ? GUIDE_SAMPLE_TABLE_SLOTS : undefined,
      error: null,
      isLocked: isMatchingPreview,
    },
    updateMatchingResult: noopGuideSampleAction,
    updateMatchingCastName: noopGuideSampleAction,
    resetMatching: noopGuideSampleAction,
    beginSessionUiMutation: () => 0,
    getSessionUiMutationGeneration: () => 0,
    isCurrentSessionUiMutation: () => true,
    isDbReady: true,
    currentEventName: getMsg('GuidePage.sample.eventName'),
    currentSessionTimestamp: '20260720130000',
    sessionReloadGeneration: 0,
    focusedSavedLotteryRunTarget: null,
    clearFocusedSavedLotteryRunTarget: noopGuideSampleAction,
    isSavedLotterySessionReadOnly: false,
    ensureWritableSession: noopAsync,
    events: [getMsg('GuidePage.sample.eventName')],
    setEvents: noopSetState,
    switchEvent: noopAsync,
    activateSavedLotteryRun: noopAsync,
    markCurrentSessionReadOnlyAfterLotterySave: noopGuideSampleAction,
    deleteManagedEvent: noopAsync,
    renameManagedEvent: noopAsync,
  };
}

/** 左側ナビゲーションが応募者管理側になるfeatureか判定する。 */
export function isApplicationFeature(feature: FeatureId): boolean {
  return feature === 'applicant-data' || feature === 'import' || feature === 'lottery' || feature === 'matching';
}
