type DataManagementTab = 'import' | 'lottery' | 'matching';

export interface DataManagementNavigationState {
  hasApplyUsers: boolean;
  hasWinners: boolean;
  isLotteryOnly: boolean;
  isLotteryResultCurrent: boolean;
}

/** 応募管理タブの利用可否を、抽選結果の鮮度を含めて判定する。 */
export function getDisabledDataManagementTabs(state: DataManagementNavigationState): Set<DataManagementTab> {
  const disabledTabs = new Set<DataManagementTab>();
  if (!state.hasApplyUsers) disabledTabs.add('lottery');
  if (!state.hasWinners || state.isLotteryOnly || !state.isLotteryResultCurrent) {
    disabledTabs.add('matching');
  }
  return disabledTabs;
}

/** 表示中のマッチングタブが無効化されたときの退避先を返す。 */
export function getFallbackDataManagementTab(state: Pick<DataManagementNavigationState, 'hasApplyUsers'>): DataManagementTab {
  return state.hasApplyUsers ? 'lottery' : 'import';
}
