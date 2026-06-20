import { describe, expect, it } from 'vitest';
import { getVisiblePage, isSidebarPageDisabled, requiresOpenEvent } from './appNavigation';

describe('requiresOpenEvent', () => {
  it('応募管理と内部管理の代表ページはイベント選択を必要とする', () => {
    expect(requiresOpenEvent('dataManagement')).toBe(true);
    expect(requiresOpenEvent('internalManagement')).toBe(true);
  });

  it('イベント管理とガイドはイベント未選択でも利用できる', () => {
    expect(requiresOpenEvent('eventManagement')).toBe(false);
    expect(requiresOpenEvent('guide')).toBe(false);
  });

  it('応募管理・内部管理配下のページはイベント選択を必要とする', () => {
    expect(requiresOpenEvent('import')).toBe(true);
    expect(requiresOpenEvent('lottery')).toBe(true);
    expect(requiresOpenEvent('matching')).toBe(true);
    expect(requiresOpenEvent('cast')).toBe(true);
    expect(requiresOpenEvent('ngManagement')).toBe(true);
    expect(requiresOpenEvent('tweet')).toBe(true);
    expect(requiresOpenEvent('attendance')).toBe(true);
  });
});

describe('isSidebarPageDisabled', () => {
  it('イベント未選択時は応募管理と内部管理を非活性にする', () => {
    expect(isSidebarPageDisabled('dataManagement', null)).toBe(true);
    expect(isSidebarPageDisabled('internalManagement', null)).toBe(true);
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
