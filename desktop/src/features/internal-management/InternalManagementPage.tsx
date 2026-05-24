import React, { useState } from 'react';
import { CastManagementPage } from '@/features/cast-management/CastManagementPage';
import { NGUserManagementPage } from '@/features/ng-management/NGUserManagementPage';
import { TweetPage } from '@/features/tweet/TweetPage';
import { TagMasterPage } from '@/features/tweet/TagMasterPage';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import { DiscordIntegrationPage } from '@/features/discord-integration/DiscordIntegrationPage';
import shared from '@/styles/shared.module.css';

type InternalTab = 'cast' | 'ngManagement' | 'tweet' | 'tagMaster' | 'attendance' | 'discord';

export const InternalManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InternalTab>('cast');

  const tabs: { id: InternalTab; label: string }[] = [
    { id: 'cast',         label: 'キャスト名簿' },
    { id: 'ngManagement', label: 'NG管理' },
    { id: 'tweet',        label: '投稿テンプレ' },
    { id: 'tagMaster',    label: 'タグマスタ' },
    { id: 'attendance',   label: '出席管理' },
    { id: 'discord',      label: 'Discord 連携' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'cast':         return <CastManagementPage />;
      case 'ngManagement': return <NGUserManagementPage />;
      case 'tweet':        return <TweetPage />;
      case 'tagMaster':    return <TagMasterPage />;
      case 'attendance':   return <AttendancePage />;
      case 'discord':      return <DiscordIntegrationPage />;
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
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={shared.pageTabContent}>{renderContent()}</div>
    </div>
  );
};
