// キャスト・NGユーザー・投稿・出欠の内部管理画面を切り替えるページ。

import React, { useEffect, useState } from 'react';
import { flushPendingPageCommits } from '@/common/pageCommitRegistry';
import { CastManagementPage } from '@/features/cast-management/CastManagementPage';
import { NGUserManagementPage, type NgManagementTab } from '@/features/ng-management/NGUserManagementPage';
import { TweetPage } from '@/features/tweet/TweetPage';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import { getMsg } from '@/messages/getMsg';
import { useAppContext } from '@/stores/AppContext';
import type { PageType } from '@/layout/appNavigation';
import shared from '@/styles/shared.module.css';

type InternalTab = 'cast' | 'ngManagement' | 'tweet' | 'attendance';

// 内部管理で表示するタブ定義。
const INTERNAL_TABS: { id: InternalTab; label: string }[] = [
  { id: 'cast', label: getMsg('InternalManagementPage.castTab') },
  { id: 'ngManagement', label: getMsg('InternalManagementPage.ngManagementTab') },
  { id: 'tweet', label: getMsg('InternalManagementPage.tweetTab') },
  { id: 'attendance', label: getMsg('InternalManagementPage.attendanceTab') },
];

function toInternalTab(page: PageType): InternalTab {
  if (page === 'ngManagement' || page === 'tweet' || page === 'attendance') return page;
  return 'cast';
}

function getTabClassName(isActive: boolean): string {
  return [
    shared.pageTab,
    isActive ? shared.pageTabActive : '',
  ].filter(Boolean).join(' ');
}

interface InternalTabButtonProps {
  id: InternalTab;
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: (tab: InternalTab) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, tab: InternalTab) => void;
}

function InternalTabButton({ id, label, selected, disabled, onSelect, onKeyDown }: InternalTabButtonProps) {
  // 子画面のblur保存でタブが先に無効化され、続くclickが失われることを防ぐ。
  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) event.preventDefault();
  };
  const handleClick = () => {
    if (!disabled) onSelect(id);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, id);

  return <button id={`internal-tab-${id}`} type="button" role="tab" aria-controls="internal-tabpanel" aria-selected={selected} tabIndex={selected ? 0 : -1} className={getTabClassName(selected)} disabled={disabled} onMouseDown={handleMouseDown} onClick={handleClick} onKeyDown={handleKeyDown}>{label}</button>;
}

interface InternalManagementPageProps {
  initialSelectedCastId?: number;
  initialNgTab?: NgManagementTab;
  previewMode?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export const InternalManagementPage: React.FC<InternalManagementPageProps> = ({
  initialSelectedCastId,
  initialNgTab,
  previewMode = false,
  onBusyChange,
}) => {
  // アプリ全体のページ状態を、内部管理の4タブへ正規化する。
  const { activePage, setActivePage } = useAppContext();
  const activeTab = toInternalTab(activePage);
  const [isChildBusy, setIsChildBusy] = useState(false);
  const [pendingFocusTab, setPendingFocusTab] = useState<InternalTab | null>(null);

  useEffect(() => {
    onBusyChange?.(isChildBusy);
  }, [isChildBusy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => {
    if (pendingFocusTab === null || isChildBusy || activeTab !== pendingFocusTab) return;
    document.getElementById(`internal-tab-${pendingFocusTab}`)?.focus();
    setPendingFocusTab(null);
  }, [activeTab, isChildBusy, pendingFocusTab]);

  const selectInternalTab = async (nextTab: InternalTab): Promise<boolean> => {
    if (nextTab === activeTab) return true;
    if (isChildBusy || !await flushPendingPageCommits()) return false;
    setActivePage(nextTab);
    setPendingFocusTab(nextTab);
    return true;
  };

  const handleTabSelect = (nextTab: InternalTab): void => {
    void selectInternalTab(nextTab);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: InternalTab) => {
    if (isChildBusy) return;
    const currentIndex = INTERNAL_TABS.findIndex((item) => item.id === tab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % INTERNAL_TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + INTERNAL_TABS.length) % INTERNAL_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = INTERNAL_TABS.length - 1;
    else return;

    event.preventDefault();
    const nextTab = INTERNAL_TABS[nextIndex];
    void selectInternalTab(nextTab.id);
  };

  // 選択中のタブに対応する管理画面だけを生成する。
  const renderContent = () => {
    switch (activeTab) {
      case 'cast':
        return <CastManagementPage initialSelectedCastId={initialSelectedCastId} onBusyChange={setIsChildBusy} />;
      case 'ngManagement':
        return <NGUserManagementPage initialTab={initialNgTab} onBusyChange={setIsChildBusy} />;
      case 'tweet':
        return <TweetPage previewMode={previewMode} />;
      case 'attendance':
        return <AttendancePage previewMode={previewMode} />;
      default:
        return null;
    }
  };

  return (
    <div className={shared.pageWrapper}>
      <div className={shared.pageTabs} role="tablist" aria-label={getMsg('InternalManagementPage.tabListLabel')}>
        {INTERNAL_TABS.map((tab) => (
          <InternalTabButton key={tab.id} id={tab.id} label={tab.label} selected={activeTab === tab.id} disabled={isChildBusy} onSelect={handleTabSelect} onKeyDown={handleTabKeyDown} />
        ))}
      </div>
      <div id="internal-tabpanel" className={shared.pageTabContent} role="tabpanel" aria-labelledby={`internal-tab-${activeTab}`} tabIndex={0}>{renderContent()}</div>
    </div>
  );
};
