// サイドバーと各featureが共有する画面識別子。
export type PageType = 'guide' | 'dataManagement' | 'internalManagement' | 'eventManagement' | 'importNew' | 'savedLottery' | 'matchingHistory' | 'import' | 'cast' | 'ngManagement' | 'lottery' | 'matching' | 'attendance' | 'tweet';

const EVENT_REQUIRED_PAGES: PageType[] = [
  'dataManagement',
  'importNew',
  'savedLottery',
  'matchingHistory',
  'lottery',
  'matching',
  'import',
  'internalManagement',
  'cast',
  'ngManagement',
  'tweet',
  'attendance',
];

// サイドバー上では、各管理領域の子ページも親項目を選択中として扱う。
const INTERNAL_PAGES: PageType[] = ['internalManagement', 'cast', 'ngManagement', 'tweet', 'attendance'];
export const APPLICATION_PAGES: PageType[] = [
  'dataManagement',
  'importNew',
  'savedLottery',
  'matchingHistory',
  'lottery',
  'matching',
  'import',
];

/** イベント共有 DB を開いていない状態では遷移できないページかを判定する。 */
function requiresOpenEvent(page: PageType): boolean {
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

/** 子ページを含めて、サイドバー項目が現在の表示領域に対応するか判定する。 */
export function isPageActive(current: PageType, buttonPage: PageType): boolean {
  if (buttonPage === 'internalManagement') return INTERNAL_PAGES.includes(current);
  if (buttonPage === 'dataManagement') return APPLICATION_PAGES.includes(current);
  return current === buttonPage;
}
