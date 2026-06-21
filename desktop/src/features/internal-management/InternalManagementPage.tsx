import React, { useEffect, useState } from 'react';
import { CastManagementPage } from '@/features/cast-management/CastManagementPage';
import { NGUserManagementPage } from '@/features/ng-management/NGUserManagementPage';
import { TweetPage } from '@/features/tweet/TweetPage';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import { useAppContext, type PageType } from '@/stores/AppContext';
import shared from '@/styles/shared.module.css';

type InternalTab = 'cast' | 'ngManagement' | 'tweet' | 'attendance';

function toInternalTab(page: PageType): InternalTab {
  if (page === 'ngManagement' || page === 'tweet' || page === 'attendance') return page;
  return 'cast';
}

export const InternalManagementPage: React.FC = () => {
  const { activePage, setActivePage } = useAppContext();
  const [activeTab, setActiveTab] = useState<InternalTab>(() => toInternalTab(activePage));

  useEffect(() => {
    setActiveTab(toInternalTab(activePage));
  }, [activePage]);

  const tabs: { id: InternalTab; label: string }[] = [
    { id: 'cast',         label: 'キャスト名簿' },
    { id: 'ngManagement', label: 'NG管理' },
    { id: 'tweet',        label: '投稿テンプレ' },
    { id: 'attendance',   label: '出席管理' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'cast':         return <CastManagementPage />;
      case 'ngManagement': return <NGUserManagementPage />;
      case 'tweet':        return <TweetPage />;
      case 'attendance':   return <AttendancePage />;
      default:             return null;
    }
  };

  return (
    <div className={shared.pageWrapper}>
      <div className={shared.pageTabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${shared.pageTab} ${activeTab === tab.id ? shared.pageTabActive : ''}`}
            onClick={() => {
              setActiveTab(tab.id);
              setActivePage(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={shared.pageTabContent}>{renderContent()}</div>
    </div>
  );
};
