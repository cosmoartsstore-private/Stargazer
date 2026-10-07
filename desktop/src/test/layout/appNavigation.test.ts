import { describe, expect, it } from 'vitest';
import {
  getDataManagementSidebarTarget,
  getVisiblePage,
  isPageActive,
  isSidebarPageDisabled,
} from '@/layout/appNavigation';

describe('isSidebarPageDisabled', () => {
  it('イベント未選択時は応募管理と内部管理を非活性にする', () => {
    expect(isSidebarPageDisabled('dataManagement', null)).toBe(true);
    expect(isSidebarPageDisabled('internalManagement', null)).toBe(true);
    expect(isSidebarPageDisabled('import', null)).toBe(true);
    expect(isSidebarPageDisabled('lottery', null)).toBe(true);
    expect(isSidebarPageDisabled('matching', null)).toBe(true);
    expect(isSidebarPageDisabled('cast', null)).toBe(true);
    expect(isSidebarPageDisabled('ngManagement', null)).toBe(true);
    expect(isSidebarPageDisabled('tweet', null)).toBe(true);
    expect(isSidebarPageDisabled('attendance', null)).toBe(true);
  });

  it('イベント未選択時でもイベント管理とガイドは非活性にしない', () => {
    expect(isSidebarPageDisabled('eventManagement', null)).toBe(false);
    expect(isSidebarPageDisabled('guide', null)).toBe(false);
  });

  it('イベント選択済みなら応募管理と内部管理を有効にする', () => {
    expect(isSidebarPageDisabled('dataManagement', 'event-a')).toBe(false);
    expect(isSidebarPageDisabled('internalManagement', 'event-a')).toBe(false);
  });
});

describe('getVisiblePage', () => {
  it('イベント未選択時に応募管理を表示しようとした場合はイベント管理を表示対象にする', () => {
    expect(getVisiblePage('dataManagement', null)).toBe('eventManagement');
  });

  it('イベント未選択時でもガイドは表示対象のままにする', () => {
    expect(getVisiblePage('guide', null)).toBe('guide');
  });

  it('イベント選択済みなら現在ページを表示対象にする', () => {
    expect(getVisiblePage('dataManagement', 'event-a')).toBe('dataManagement');
  });
});

describe('isPageActive', () => {
  it('内部管理の親項目は配下の各ページを選択中として扱う', () => {
    expect(isPageActive('internalManagement', 'internalManagement')).toBe(true);
    expect(isPageActive('cast', 'internalManagement')).toBe(true);
    expect(isPageActive('ngManagement', 'internalManagement')).toBe(true);
    expect(isPageActive('tweet', 'internalManagement')).toBe(true);
    expect(isPageActive('attendance', 'internalManagement')).toBe(true);
    expect(isPageActive('dataManagement', 'internalManagement')).toBe(false);
  });

  it('応募管理の親項目は配下の各ページを選択中として扱う', () => {
    expect(isPageActive('dataManagement', 'dataManagement')).toBe(true);
    expect(isPageActive('lottery', 'dataManagement')).toBe(true);
    expect(isPageActive('matching', 'dataManagement')).toBe(true);
    expect(isPageActive('import', 'dataManagement')).toBe(true);
    expect(isPageActive('guide', 'dataManagement')).toBe(false);
  });

  it('親項目ではないページは画面識別子が一致するときだけ選択中として扱う', () => {
    expect(isPageActive('guide', 'guide')).toBe(true);
    expect(isPageActive('eventManagement', 'guide')).toBe(false);
  });
});

describe('getDataManagementSidebarTarget', () => {
  it('保存結果の閲覧画面では応募管理の開始画面へ戻す', () => {
    expect(getDataManagementSidebarTarget('savedLottery')).toBe('dataManagement');
    expect(getDataManagementSidebarTarget('matchingHistory')).toBe('dataManagement');
  });

  it('作業中画面では現在の工程を再表示する', () => {
    expect(getDataManagementSidebarTarget('importNew')).toBe('importNew');
    expect(getDataManagementSidebarTarget('import')).toBe('import');
    expect(getDataManagementSidebarTarget('lottery')).toBe('lottery');
    expect(getDataManagementSidebarTarget('matching')).toBe('matching');
  });

  it('応募管理の開始画面では同じ画面を表示する', () => {
    expect(getDataManagementSidebarTarget('dataManagement')).toBe('dataManagement');
  });
});
