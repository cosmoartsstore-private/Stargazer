import type { PageType } from '@/stores/AppContext';

const EVENT_REQUIRED_PAGES: PageType[] = [
  'dataManagement',
  'lottery',
  'matching',
  'import',
  'internalManagement',
  'cast',
  'ngManagement',
  'tweet',
  'attendance',
];

/** イベント共有 DB を開いていない状態では遷移できないページかを判定する。 */
export function requiresOpenEvent(page: PageType): boolean {
  return EVENT_REQUIRED_PAGES.includes(page);
}

/** 現在イベントが未選択のとき、サイドバー項目を非活性にする必要があるかを判定する。 */
export function isSidebarPageDisabled(page: PageType, currentEventName: string | null): boolean {
  return currentEventName === null && requiresOpenEvent(page);
}

/** イベント未選択時に実際に表示されるページを、サイドバーの選択表示へ反映する。 */
export function getVisiblePage(activePage: PageType, currentEventName: string | null): PageType {
  if (currentEventName === null && activePage !== 'guide') {
    return 'eventManagement';
  }
  return activePage;
}
