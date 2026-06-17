import React, { useEffect, useState } from 'react';
import { ApplicantDataPage } from '@/features/data-management/ApplicantDataPage';
import { LotteryPage } from '@/features/lottery/LotteryPage';
import { MatchingPage } from '@/features/matching/MatchingPage';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useAppContext, type PageType } from '@/stores/AppContext';
import shared from '@/styles/shared.module.css';
import styles from './DataManagementPage.module.css';

type DataManagementTab = 'import' | 'lottery' | 'matching';

interface DataManagementPageProps {
  onImportUserRows: (
    rows: string[][],
    mapping: import('@/common/importFormat').ColumnMapping,
    options?: import('@/common/sheetParsers').MapRowOptions,
    nextPage?: PageType
  ) => void;
}

type CheckLevel = 'ok' | 'warning' | 'error';

interface CheckItem {
  level: CheckLevel;
  label: string;
  detail: string;
}

function toTab(page: PageType): DataManagementTab {
  if (page === 'lottery' || page === 'matching') return page;
  return 'import';
}

function formatCastNames(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} … 他${names.length - 3}名`;
}

export const DataManagementPage: React.FC<DataManagementPageProps> = ({ onImportUserRows }) => {
  const {
    activePage,
    setActivePage,
    applicants,
    casts,
    currentWinners,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<DataManagementTab>(() => toTab(activePage));
  const [showCastConfirm, setShowCastConfirm] = useState(false);
  const [preLotteryChecks, setPreLotteryChecks] = useState<CheckItem[]>([]);

  useEffect(() => {
    setActiveTab(toTab(activePage));
  }, [activePage]);

  const attendingCasts = casts.filter((c) => c.is_present);
  const hasApplyUsers = applicants.length > 0;
  const hasWinners = currentWinners.length > 0;

  const disabledTabs = new Set<DataManagementTab>();
  if (!hasApplyUsers) disabledTabs.add('lottery');
  if (!hasWinners)    disabledTabs.add('matching');

  const tabs: Array<{ id: DataManagementTab; label: string }> = [
    { id: 'import',   label: '一覧' },
    { id: 'lottery',  label: '抽選' },
    { id: 'matching', label: 'マッチング' },
  ];

  const buildChecks = (): CheckItem[] => [
    {
      level: attendingCasts.length === 0 ? 'error' : 'ok',
      label: '出席キャスト',
      detail: attendingCasts.length === 0
        ? '0名 ― キャスト管理で出席状態を設定してください'
        : `${attendingCasts.length}名 (${formatCastNames(attendingCasts.map(c => c.name))})`,
    },
    {
      level: currentWinners.length > 0 ? 'warning' : 'ok',
      label: '抽選結果',
      detail: currentWinners.length > 0
        ? `${currentWinners.length}件 ― 再実行すると上書きされます`
        : 'なし',
    },
  ];

  const handleTabClick = (tabId: DataManagementTab) => {
    if (tabId === 'lottery' && activeTab !== 'lottery') {
      const checks = buildChecks();
      const anyIssues = checks.some(c => c.level !== 'ok');
      if (!anyIssues) {
        setActiveTab('lottery');
        setActivePage('lottery');
        return;
      }
      setPreLotteryChecks(checks);
      setShowCastConfirm(true);
      return;
    }
    setActiveTab(tabId);
    setActivePage(tabId as PageType);
  };

  const modalHasErrors   = preLotteryChecks.some(c => c.level === 'error');

  return (
    <div className={shared.pageWrapper}>
      <div className={shared.pageTabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${shared.pageTab} ${activeTab === tab.id ? shared.pageTabActive : ''} ${disabledTabs.has(tab.id) ? shared.pageTabDisabled : ''}`}
            disabled={disabledTabs.has(tab.id)}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={shared.pageTabContent}>
        {activeTab === 'import'   && <ApplicantDataPage onImportUserRows={onImportUserRows} />}
        {activeTab === 'lottery'  && <LotteryPage />}
        {activeTab === 'matching' && <MatchingPage />}
      </div>

      {showCastConfirm && (
        <ConfirmModal
          type="confirm"
          title="抽選前チェック"
          message={
            modalHasErrors
              ? 'エラーを解消してから進めてください。'
              : '警告があります。このまま進めますか？'
          }
          confirmLabel="進める"
          cancelLabel={modalHasErrors ? '閉じる' : 'キャンセル'}
          confirmDisabled={modalHasErrors}
          size="wide"
          onConfirm={() => {
            setShowCastConfirm(false);
            setActiveTab('lottery');
            setActivePage('lottery');
          }}
          onCancel={() => setShowCastConfirm(false)}
        >
          <div className={styles.preLotteryTerminal}>
            {preLotteryChecks.map((item, i) => (
              <div key={i} className={styles.terminalLine}>
                <span className={`${styles.terminalBadge} ${item.level === 'ok' ? styles.terminalBadgeOk : item.level === 'warning' ? styles.terminalBadgeWarning : styles.terminalBadgeError}`}>
                  {item.level === 'ok' ? '[-]' : item.level === 'warning' ? '[WARN]' : '[ERR]'}
                </span>
                <span className={styles.terminalItemLabel}>{item.label}</span>
                <span className={`${styles.terminalItemDetail} ${item.level === 'ok' ? styles.terminalItemDetailOk : item.level === 'warning' ? styles.terminalItemDetailWarning : styles.terminalItemDetailError}`}>{item.detail}</span>
              </div>
            ))}
          </div>
        </ConfirmModal>
      )}
    </div>
  );
};
