import { getMsg } from '@/messages/getMsg';

type DataManagementTab = 'import' | 'lottery' | 'matching';

export interface DataManagementNavigationState {
  hasApplicants: boolean;
  hasApplicantIdentityIssues: boolean;
  hasWinners: boolean;
  isLotteryOnly: boolean;
  isLotteryResultCurrent: boolean;
}

export type PreLotteryCheckLevel = 'ok' | 'warning' | 'error';

export interface PreLotteryCheckItem {
  level: PreLotteryCheckLevel;
  label: string;
  detail: string;
}

export interface PreLotteryCheckState {
  attendingCastNames: string[];
  currentWinnerCount: number;
  isLotteryOnly: boolean;
}

function formatCastNames(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return getMsg('dataManagementNavigation.moreCastNames', {
    names: names.slice(0, 3).join(', '),
    count: names.length - 3,
  });
}

/** 応募管理タブの利用可否を、抽選結果の鮮度を含めて判定する。 */
export function getDisabledDataManagementTabs(state: DataManagementNavigationState): Set<DataManagementTab> {
  const disabledTabs = new Set<DataManagementTab>();
  if (!state.hasApplicants || state.hasApplicantIdentityIssues) disabledTabs.add('lottery');

  const canUseMatching =
    !state.isLotteryOnly
    && !state.hasApplicantIdentityIssues
    && state.hasWinners
    && state.isLotteryResultCurrent;
  if (!canUseMatching) disabledTabs.add('matching');
  return disabledTabs;
}

/** 抽選画面へ移動する前に、現在の条件で利用者へ知らせる項目を返す。 */
export function buildPreLotteryChecks(state: PreLotteryCheckState): PreLotteryCheckItem[] {
  const checks: PreLotteryCheckItem[] = [];

  // M000 はギフト抽選などの単純抽選用であり、キャストを使わない。
  if (!state.isLotteryOnly) {
    checks.push({
      level: state.attendingCastNames.length === 0 ? 'error' : 'ok',
      label: getMsg('dataManagementNavigation.attendingCasts'),
      detail: state.attendingCastNames.length === 0
        ? getMsg('dataManagementNavigation.noAttendingCasts')
        : getMsg('dataManagementNavigation.attendingCastSummary', {
            count: state.attendingCastNames.length,
            names: formatCastNames(state.attendingCastNames),
          }),
    });
  }

  checks.push({
    level: state.currentWinnerCount > 0 ? 'warning' : 'ok',
    label: getMsg('dataManagementNavigation.lotteryResult'),
    detail: state.currentWinnerCount > 0
      ? getMsg('dataManagementNavigation.lotteryResultOverwrite', {
          count: state.currentWinnerCount,
        })
      : getMsg('common.none'),
  });

  return checks;
}
