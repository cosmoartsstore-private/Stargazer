// 応募者取込・抽選・マッチングの工程を切り替え、各工程への遷移条件を制御するページ。

import React, { useEffect, useMemo, useState } from 'react';
import { ApplicantDataPage } from '@/features/data-management/ApplicantDataPage';
import { LotteryPage } from '@/features/lottery/LotteryPage';
import { MatchingPage } from '@/features/matching/MatchingPage';
import { AppDialog } from '@/components/AppDialog';
import dialogStyles from '@/components/ConfirmModal.module.css';
import type { UserBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';
import { useAppContext } from '@/stores/AppContext';
import type { PageType } from '@/layout/appNavigation';
import {
  buildPreLotteryChecks,
  type PreLotteryCheckItem,
} from './dataManagementNavigation';
import { buildDataManagementViewModel } from './dataManagementViewModel';
import shared from '@/styles/shared.module.css';
import styles from './DataManagementPage.module.css';

type DataManagementTab = 'import' | 'lottery' | 'matching';

// データ管理画面で遷移できる工程と表示名を定義する。
const DATA_MANAGEMENT_TABS: Array<{ id: DataManagementTab; label: string }> = [
  { id: 'import', label: getMsg('DataManagementPage.importTab') },
  { id: 'lottery', label: getMsg('DataManagementPage.lotteryTab') },
  { id: 'matching', label: getMsg('DataManagementPage.matchingTab') },
];

interface DataManagementPageProps {
  onImportUsers: (users: UserBean[], nextPage?: PageType) => void;
}

function toTab(page: PageType): DataManagementTab {
  if (page === 'lottery' || page === 'matching') return page;
  return 'import';
}

interface DataManagementTabButtonProps {
  id: DataManagementTab;
  label: string;
  className: string;
  selected: boolean;
  disabled: boolean;
  onSelect: (tab: DataManagementTab) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, tab: DataManagementTab) => void;
}

function DataManagementTabButton({ id, label, className, selected, disabled, onSelect, onKeyDown }: DataManagementTabButtonProps) {
  const handleClick = () => onSelect(id);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, id);

  return <button id={`data-management-tab-${id}`} type="button" role="tab" aria-controls="data-management-tabpanel" aria-selected={selected} tabIndex={selected ? 0 : -1} className={className} disabled={disabled} onClick={handleClick} onKeyDown={handleKeyDown}>{label}</button>;
}

export const DataManagementPage: React.FC<DataManagementPageProps> = ({ onImportUsers }) => {
  // 工程切替と各工程の利用可否判定に使う共有データを取得する。
  const {
    activePage,
    setActivePage,
    applicants,
    casts,
    currentWinners,
    matchingResultState: {
      result: globalMatchingResult,
      tableSlots: globalTableSlots,
    },
    isLotteryResultCurrent,
    sessionWorkflow,
  } = useAppContext();

  // 現在の工程と抽選前確認ダイアログの状態を管理する。
  const activeTab = toTab(activePage);
  const [preLotteryChecks, setPreLotteryChecks] = useState<PreLotteryCheckItem[] | null>(null);

  // 工程可否と参照警告を、現在の応募者・キャスト・結果snapshotから導出する。
  const {
    attendingCastNames,
    hasApplicants,
    applicantIdentityIssues,
    hasApplicantIdentityIssues,
    isLotteryOnly,
    showUnavailableCastWarning,
    hasUnresolvedCastReferences,
    hasDeletedCastReferences,
    unavailableCastNames,
    disabledTabs,
  } = useMemo(() => buildDataManagementViewModel({
    applicants,
    casts,
    currentWinners,
    matchingResult: globalMatchingResult,
    tableSlots: globalTableSlots,
    matchingTypeCode: sessionWorkflow.matchingTypeCode,
    isLotteryResultCurrent,
  }), [
    applicants,
    casts,
    currentWinners,
    globalMatchingResult,
    globalTableSlots,
    sessionWorkflow.matchingTypeCode,
    isLotteryResultCurrent,
  ]);

  // 入力条件が変わって現在の工程を維持できない場合は、安全な工程へ戻す。
  useEffect(() => {
    if (hasApplicantIdentityIssues && activeTab !== 'import') {
      setActivePage('import');
      return;
    }
    if (activeTab === 'matching' && disabledTabs.has('matching')) {
      setActivePage(hasApplicants ? 'lottery' : 'import');
    }
  }, [
    activeTab,
    disabledTabs,
    hasApplicantIdentityIssues,
    hasApplicants,
    setActivePage,
  ]);

  // 工程遷移前に抽選条件を確認し、必要な場合だけ確認ダイアログを開く。
  const handleTabClick = (tabId: DataManagementTab) => {
    if (disabledTabs.has(tabId)) return;
    if (tabId === 'lottery' && activeTab !== 'lottery') {
      const checks = buildPreLotteryChecks({
        attendingCastNames,
        currentWinnerCount: currentWinners.length,
        isLotteryOnly,
      });
      const anyIssues = checks.some((check) => check.level !== 'ok');
      if (!anyIssues) {
        setActivePage('lottery');
        return;
      }
      setPreLotteryChecks(checks);
      return;
    }
    setActivePage(tabId as PageType);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabId: DataManagementTab) => {
    const enabledTabs = DATA_MANAGEMENT_TABS.filter((tab) => !disabledTabs.has(tab.id));
    const currentIndex = enabledTabs.findIndex((tab) => tab.id === tabId);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % enabledTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = enabledTabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = enabledTabs[nextIndex];
    handleTabClick(nextTab.id);
    document.getElementById(`data-management-tab-${nextTab.id}`)?.focus();
  };
  // 抽選前確認ダイアログの文言と操作可否を検証結果から導出する。
  const modalHasErrors = preLotteryChecks?.some((check) => check.level === 'error') ?? false;
  const preLotteryMessage = modalHasErrors
    ? getMsg('DataManagementPage.resolveErrors')
    : getMsg('DataManagementPage.proceedWithWarnings');
  const preLotteryCancelLabel = modalHasErrors
    ? getMsg('common.close')
    : getMsg('common.cancel');

  // タブと検証結果の表示class・ラベルを一箇所で決定する。
  const getTabClassName = (tabId: DataManagementTab) => [
    shared.pageTab,
    activeTab === tabId ? shared.pageTabActive : '',
    disabledTabs.has(tabId) ? shared.pageTabDisabled : '',
  ].filter(Boolean).join(' ');
  const getTerminalBadgeClassName = (level: PreLotteryCheckItem['level']) => [
    styles.terminalBadge,
    level === 'ok'
      ? styles.terminalBadgeOk
      : level === 'warning'
        ? styles.terminalBadgeWarning
        : styles.terminalBadgeError,
  ].join(' ');
  const getTerminalDetailClassName = (level: PreLotteryCheckItem['level']) => [
    styles.terminalItemDetail,
    level === 'ok'
      ? styles.terminalItemDetailOk
      : level === 'warning'
        ? styles.terminalItemDetailWarning
        : styles.terminalItemDetailError,
  ].join(' ');
  const getTerminalLevelLabel = (level: PreLotteryCheckItem['level']) => {
    if (level === 'ok') return getMsg('DataManagementPage.infoLevel');
    if (level === 'warning') return getMsg('DataManagementPage.warningLevel');
    return getMsg('DataManagementPage.errorLevel');
  };

  // 抽選前確認ダイアログの確定・取消操作を処理する。
  const handleConfirmPreLottery = () => {
    setPreLotteryChecks(null);
    setActivePage('lottery');
  };
  const handleClosePreLottery = () => setPreLotteryChecks(null);
  const handlePreLotteryOpenChange = (open: boolean) => {
    if (!open) handleClosePreLottery();
  };

  return (
    <div className={shared.pageWrapper}>
      <div className={shared.pageTabs} role="tablist" aria-label={getMsg('DataManagementPage.tabListLabel')}>
        {DATA_MANAGEMENT_TABS.map((tab) => (
          <DataManagementTabButton key={tab.id} id={tab.id} label={tab.label} className={getTabClassName(tab.id)} selected={activeTab === tab.id} disabled={disabledTabs.has(tab.id)} onSelect={handleTabClick} onKeyDown={handleTabKeyDown} />
        ))}
      </div>

      <div id="data-management-tabpanel" className={shared.pageTabContent} role="tabpanel" aria-labelledby={`data-management-tab-${activeTab}`} tabIndex={0}>
        {hasApplicantIdentityIssues && (
          <div className={shared.warningNotice} role="alert">
            <strong>{getMsg('DataManagementPage.identityIssueTitle')}</strong>
            <span>{getMsg('DataManagementPage.identityIssueDescription')}</span>
            <span>{getMsg('DataManagementPage.identityIssueRows', { rows: applicantIdentityIssues.map((issue) => issue.rowNumber).join('、') })}</span>
          </div>
        )}
        {showUnavailableCastWarning && (
          <div className={shared.warningNotice} role="status">
            <strong>{getMsg('DataManagementPage.castReferenceTitle')}</strong>
            {hasUnresolvedCastReferences && <span>{getMsg('DataManagementPage.unresolvedCastReference')}</span>}
            {hasDeletedCastReferences && <span>{getMsg('DataManagementPage.deletedCastReference')}</span>}
            <span>{getMsg('DataManagementPage.castReferenceWarning')}</span>
            {unavailableCastNames && <span>{getMsg('DataManagementPage.castReferenceNames', { names: unavailableCastNames })}</span>}
          </div>
        )}
        {activeTab === 'import'   && <ApplicantDataPage onImportUsers={onImportUsers} />}
        {activeTab === 'lottery' && !hasApplicantIdentityIssues && <LotteryPage />}
        {activeTab === 'matching' && !hasApplicantIdentityIssues && !isLotteryOnly && <MatchingPage />}
      </div>

      {preLotteryChecks && (
        <AppDialog
          open
          onOpenChange={handlePreLotteryOpenChange}
          title={getMsg('DataManagementPage.preLotteryTitle')}
          description={preLotteryMessage}
          descriptionClassName={dialogStyles.modalMessage}
          className={dialogStyles.modalContentWide}
        >
          <div className={styles.preLotteryTerminal}>
            {preLotteryChecks.map((item, index) => (
              <div key={index} className={styles.terminalLine}>
                <span className={getTerminalBadgeClassName(item.level)}>{getTerminalLevelLabel(item.level)}</span>
                <span className={styles.terminalItemLabel}>{item.label}</span>
                <span className={getTerminalDetailClassName(item.level)}>{item.detail}</span>
              </div>
            ))}
          </div>
          <footer className={dialogStyles.modalButtons}>
            <button type="button" className={dialogStyles.modalBtnCancel} onClick={handleClosePreLottery}>{preLotteryCancelLabel}</button>
            <button type="button" className={`${shared.btnPrimary} ${dialogStyles.modalBtnAction}`} onClick={handleConfirmPreLottery} disabled={modalHasErrors}>{getMsg('DataManagementPage.proceed')}</button>
          </footer>
        </AppDialog>
      )}
    </div>
  );
};
