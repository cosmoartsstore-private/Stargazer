import { describe, expect, it } from 'vitest';
import {
  getDisabledDataManagementTabs,
  getFallbackDataManagementTab,
} from './dataManagementNavigation';

describe('getDisabledDataManagementTabs', () => {
  it('応募データがない場合は抽選とマッチングを非活性にする', () => {
    const disabled = getDisabledDataManagementTabs({
      hasApplyUsers: false,
      hasWinners: false,
      isLotteryOnly: false,
      isLotteryResultCurrent: false,
    });

    expect(disabled.has('lottery')).toBe(true);
    expect(disabled.has('matching')).toBe(true);
  });

  it('抽選結果が現在条件と一致している場合だけマッチングを活性にする', () => {
    const disabled = getDisabledDataManagementTabs({
      hasApplyUsers: true,
      hasWinners: true,
      isLotteryOnly: false,
      isLotteryResultCurrent: true,
    });

    expect(disabled.has('lottery')).toBe(false);
    expect(disabled.has('matching')).toBe(false);
  });

  it('抽選のみの結果では当選者がいてもマッチングを非活性にする', () => {
    const disabled = getDisabledDataManagementTabs({
      hasApplyUsers: true,
      hasWinners: true,
      isLotteryOnly: true,
      isLotteryResultCurrent: true,
    });

    expect(disabled.has('matching')).toBe(true);
  });

  it('条件変更後の古い抽選結果では当選者がいてもマッチングを非活性にする', () => {
    const disabled = getDisabledDataManagementTabs({
      hasApplyUsers: true,
      hasWinners: true,
      isLotteryOnly: false,
      isLotteryResultCurrent: false,
    });

    expect(disabled.has('lottery')).toBe(false);
    expect(disabled.has('matching')).toBe(true);
  });
});

describe('getFallbackDataManagementTab', () => {
  it('応募データがある場合は抽選タブへ退避する', () => {
    expect(getFallbackDataManagementTab({ hasApplyUsers: true })).toBe('lottery');
  });

  it('応募データがない場合はデータ取込タブへ退避する', () => {
    expect(getFallbackDataManagementTab({ hasApplyUsers: false })).toBe('import');
  });
});
