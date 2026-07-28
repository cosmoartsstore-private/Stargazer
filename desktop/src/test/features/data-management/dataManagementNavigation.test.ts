import { describe, expect, it } from 'vitest';
import {
  buildPreLotteryChecks,
  getDisabledDataManagementTabs,
  type DataManagementNavigationState,
} from '@/features/data-management/dataManagementNavigation';

function navigationState(
  overrides: Partial<DataManagementNavigationState> = {},
): DataManagementNavigationState {
  return {
    hasApplicants: false,
    hasApplicantIdentityIssues: false,
    hasWinners: false,
    isLotteryOnly: false,
    isLotteryResultCurrent: false,
    ...overrides,
  };
}

describe('getDisabledDataManagementTabs', () => {
  it('応募データがない場合は抽選とマッチングを非活性にする', () => {
    const disabled = getDisabledDataManagementTabs(navigationState());

    expect(disabled.has('lottery')).toBe(true);
    expect(disabled.has('matching')).toBe(true);
  });

  it('抽選結果が現在条件と一致している場合だけマッチングを活性にする', () => {
    const disabled = getDisabledDataManagementTabs(navigationState({
      hasApplicants: true,
      hasWinners: true,
      isLotteryResultCurrent: true,
    }));

    expect(disabled.has('lottery')).toBe(false);
    expect(disabled.has('matching')).toBe(false);
  });

  it('抽選のみの結果では当選者がいてもマッチングを非活性にする', () => {
    const disabled = getDisabledDataManagementTabs(navigationState({
      hasApplicants: true,
      hasWinners: true,
      isLotteryOnly: true,
      isLotteryResultCurrent: true,
    }));

    expect(disabled.has('matching')).toBe(true);
  });

  it('条件変更後の古い抽選結果では当選者がいてもマッチングを非活性にする', () => {
    const disabled = getDisabledDataManagementTabs(navigationState({
      hasApplicants: true,
      hasWinners: true,
    }));

    expect(disabled.has('lottery')).toBe(false);
    expect(disabled.has('matching')).toBe(true);
  });

  it('空または重複したX IDが存在する間は抽選とマッチングを非活性にする', () => {
    const disabled = getDisabledDataManagementTabs(navigationState({
      hasApplicants: true,
      hasApplicantIdentityIssues: true,
      hasWinners: true,
      isLotteryResultCurrent: true,
    }));

    expect(disabled.has('lottery')).toBe(true);
    expect(disabled.has('matching')).toBe(true);
  });

});

describe('buildPreLotteryChecks', () => {
  it('抽選のみモードでは出席キャストを検証しない', () => {
    expect(buildPreLotteryChecks({
      attendingCastNames: [],
      currentWinnerCount: 0,
      isLotteryOnly: true,
    })).toEqual([
      {
        level: 'ok',
        label: '抽選結果',
        detail: 'なし',
      },
    ]);
  });

  it('マッチングを伴う抽選では出席キャスト未設定をエラーにする', () => {
    expect(buildPreLotteryChecks({
      attendingCastNames: [],
      currentWinnerCount: 0,
      isLotteryOnly: false,
    })[0]).toEqual({
      level: 'error',
      label: '出席キャスト',
      detail: '0名 — 出席管理で出席状態を設定してください',
    });
  });

  it('出席キャストが4名以上の場合は先頭3名と残り人数を表示する', () => {
    expect(buildPreLotteryChecks({
      attendingCastNames: ['Cast A', 'Cast B', 'Cast C', 'Cast D'],
      currentWinnerCount: 2,
      isLotteryOnly: false,
    })).toEqual([
      {
        level: 'ok',
        label: '出席キャスト',
        detail: '4名（Cast A, Cast B, Cast C、ほか1名）',
      },
      {
        level: 'warning',
        label: '抽選結果',
        detail: '2件（再実行すると上書き）',
      },
    ]);
  });
});
