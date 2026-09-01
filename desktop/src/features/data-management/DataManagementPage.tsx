// 応募管理の開始画面、取込・抽選・マッチングの順次遷移、保存履歴を構成する。

import React, { useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import { ApplicantDataPage } from '@/features/data-management/ApplicantDataPage';
import { ImportPage, type ImportPageInitialData } from '@/features/import/ImportPage';
import { LotteryPage } from '@/features/lottery/LotteryPage';
import { MatchingPage } from '@/features/matching/MatchingPage';
import { AppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmModal';
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
import {
  DataManagementLanding,
  MatchingHistoryPage,
  SavedLotteryStartPage,
} from './DataManagementStartPages';
import shared from '@/styles/shared.module.css';
import styles from './DataManagementPage.module.css';

type WorkflowPage = 'import' | 'lottery' | 'matching';

interface DataManagementPageProps {
  onImportUsers: (users: UserBean[], nextPage?: PageType) => void;
  onImportNewUsers?: (users: UserBean[], nextPage?: PageType) => void;
  initialImportData?: ImportPageInitialData;
  page?: PageType;
  onNavigate?: (page: PageType) => void;
  onUnsavedChange?: (unsaved: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}

function toWorkflowPage(page: PageType): WorkflowPage | null {
  if (page === 'import' || page === 'lottery' || page === 'matching') return page;
  return null;
}

export const DataManagementPage: React.FC<DataManagementPageProps> = ({
  onImportUsers,
  onImportNewUsers = onImportUsers,
  initialImportData,
  page,
  onNavigate,
  onUnsavedChange,
  onBusyChange,
}) => {
  const {
    activePage: contextPage,
    setActivePage,
    applicants,
    casts,
    currentWinners,
    matchingResultState: {
      result: globalMatchingResult,
      tableSlots: globalTableSlots,
      isLocked: isMatchingLocked,
      isSaved: isMatchingResultSaved,
    },
    isLotteryResultCurrent,
    sessionWorkflow,
    isLotteryInputReadOnly,
    hasSavedSessionResult,
  } = useAppContext();
  const currentPage = page ?? contextPage;
  const navigate = onNavigate ?? setActivePage;
  const workflowPage = toWorkflowPage(currentPage);
  const [preLotteryChecks, setPreLotteryChecks] = useState<PreLotteryCheckItem[] | null>(null);
  const [dataIssueOpen, setDataIssueOpen] = useState(true);
  const [importDraftUnsaved, setImportDraftUnsaved] = useState(false);
  const [isOpeningSavedLottery, setIsOpeningSavedLottery] = useState(false);
  const [isImportReading, setIsImportReading] = useState(false);
  const [isLotterySaving, setIsLotterySaving] = useState(false);
  const [isMatchingSaving, setIsMatchingSaving] = useState(false);
  const [pendingDraftNavigation, setPendingDraftNavigation] = useState<PageType | null>(null);
  const dataIssueBodyId = useId();
  const isDataManagementBusy = isOpeningSavedLottery
    || isImportReading
    || isLotterySaving
    || isMatchingSaving;
  const hasUnsavedLotteryResult = currentWinners.length > 0
    && isLotteryResultCurrent
    && !isLotteryInputReadOnly
    && !hasSavedSessionResult;
  const hasUnsavedMatchingResult = isMatchingLocked
    && globalMatchingResult !== null
    && !hasSavedSessionResult
    && !isMatchingResultSaved;
  const hasUnsavedWork = importDraftUnsaved
    || hasUnsavedLotteryResult
    || hasUnsavedMatchingResult;

  const {
    attendingCastNames,
    hasApplicants,
    applicantIdentityIssues,
    hasApplicantIdentityIssues,
    isLotteryOnly,
    showUnavailableCastWarning,
    hasUnavailableApplicantCastReferences,
    hasUnavailableMatchingResultCasts,
    hasUnresolvedCastReferences,
    hasDeletedApplicantCastReferences,
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
  const dataIssueSignature = [
    hasUnavailableApplicantCastReferences,
    hasUnavailableMatchingResultCasts,
    hasUnresolvedCastReferences,
    hasDeletedApplicantCastReferences,
    unavailableCastNames,
  ].join('|');

  useEffect(() => {
    if (showUnavailableCastWarning) setDataIssueOpen(true);
  }, [dataIssueSignature, showUnavailableCastWarning]);

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedWork);
  }, [hasUnsavedWork, onUnsavedChange]);

  useEffect(() => () => onUnsavedChange?.(false), [onUnsavedChange]);

  useEffect(() => {
    onBusyChange?.(isDataManagementBusy);
  }, [isDataManagementBusy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const navigateWithDraftCheck = (target: PageType) => {
    if (
      importDraftUnsaved
      && (currentPage === 'import' || currentPage === 'importNew')
      && target !== currentPage
      && target !== 'dataManagement'
    ) {
      setPendingDraftNavigation(target);
      return;
    }
    navigate(target);
  };

  useEffect(() => {
    if (workflowPage === null) return;
    if (hasApplicantIdentityIssues && workflowPage !== 'import') {
      navigate('import');
      return;
    }
    if (workflowPage === 'matching' && disabledTabs.has('matching')) {
      navigate(hasApplicants ? 'lottery' : 'import');
    }
  }, [
    disabledTabs,
    hasApplicantIdentityIssues,
    hasApplicants,
    navigate,
    workflowPage,
  ]);

  const requestLotteryPage = () => {
    if (disabledTabs.has('lottery')) return;
    const checks = buildPreLotteryChecks({
      attendingCastNames,
      currentWinnerCount: currentWinners.length,
      isLotteryOnly,
    });
    if (checks.every((check) => check.level === 'ok')) {
      navigateWithDraftCheck('lottery');
      return;
    }
    setPreLotteryChecks(checks);
  };

  const modalHasErrors = preLotteryChecks?.some((check) => check.level === 'error') ?? false;
  const preLotteryMessage = modalHasErrors
    ? getMsg('DataManagementPage.resolveErrors')
    : getMsg('DataManagementPage.proceedWithWarnings');
  const preLotteryCancelLabel = modalHasErrors
    ? getMsg('common.close')
    : getMsg('common.cancel');

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

  const handleConfirmPreLottery = () => {
    setPreLotteryChecks(null);
    navigateWithDraftCheck('lottery');
  };
  const handleClosePreLottery = () => setPreLotteryChecks(null);
  const handleToggleDataIssue = () => setDataIssueOpen((open) => !open);
  const handlePreLotteryOpenChange = (open: boolean) => {
    if (!open) handleClosePreLottery();
  };
  const handleConfirmDraftNavigation = () => {
    if (pendingDraftNavigation === null) return;
    const target = pendingDraftNavigation;
    setPendingDraftNavigation(null);
    setImportDraftUnsaved(false);
    navigate(target);
  };
  const handleCancelDraftNavigation = () => setPendingDraftNavigation(null);

  const renderPage = () => {
    switch (currentPage) {
      case 'dataManagement':
        return (
          <DataManagementLanding
            onStartNewImport={() => navigate('importNew')}
            onOpenSavedLottery={() => navigate('savedLottery')}
            onOpenMatchingHistory={() => navigate('matchingHistory')}
          />
        );
      case 'importNew':
        return (
          <div>
            <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
              <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('DataManagementStart.newImportPageTitle')}</h1>
              <p className={shared.pageHeaderSubtitle}>{getMsg('DataManagementStart.newImportPageDescription')}</p>
            </header>
            <section className={shared.sectionBlock}>
              <ImportPage onImportUsers={onImportNewUsers} onDraftChange={setImportDraftUnsaved} onBusyChange={setIsImportReading} />
            </section>
          </div>
        );
      case 'savedLottery':
        return (
          <SavedLotteryStartPage
            onOpened={() => navigate('lottery')}
            onOpeningChange={setIsOpeningSavedLottery}
            onBackToStart={() => navigate('dataManagement')}
          />
        );
      case 'matchingHistory':
        return <MatchingHistoryPage onBackToStart={() => navigate('dataManagement')} />;
      case 'import':
        return (
          <ApplicantDataPage
            onImportUsers={onImportUsers}
            initialImportData={initialImportData}
            onDraftChange={setImportDraftUnsaved}
            onBusyChange={setIsImportReading}
            hasUnsavedImportDraft={importDraftUnsaved}
          />
        );
      case 'lottery':
        return hasApplicantIdentityIssues ? null : <LotteryPage onBusyChange={setIsLotterySaving} />;
      case 'matching':
        return hasApplicantIdentityIssues || isLotteryOnly
          ? null
          : <MatchingPage onBusyChange={setIsMatchingSaving} />;
      default:
        return null;
    }
  };

  const showWorkflowNotices = workflowPage !== null;
  const showBackToStart = currentPage === 'importNew'
    || currentPage === 'savedLottery'
    || currentPage === 'matchingHistory';
  const workflowBackLabel = workflowPage === 'lottery'
    ? getMsg('DataManagementStart.backToApplicantData')
    : workflowPage === 'matching'
      ? getMsg('DataManagementStart.backToLottery')
      : getMsg('DataManagementStart.backToStart');

  return (
    <div className={shared.pageWrapper}>
      {showWorkflowNotices && (isLotteryInputReadOnly || hasSavedSessionResult) && (
        <div className={styles.savedLotteryReadOnlyNotice} role="status">
          <strong>{getMsg('DataManagementPage.savedResultReadOnlyTitle')}</strong>
          <span>{getMsg(hasSavedSessionResult && isMatchingResultSaved
            ? 'DataManagementPage.savedMatchingReadOnlyDescription'
            : hasSavedSessionResult
              ? 'DataManagementPage.sessionResultSavedDescription'
              : isLotteryOnly
              ? 'DataManagementPage.savedResultReadOnlyLotteryOnlyDescription'
              : 'DataManagementPage.savedResultReadOnlyMatchingDescription')}</span>
        </div>
      )}
      {showWorkflowNotices && hasApplicantIdentityIssues && (
        <div className={shared.warningNotice} role="alert">
          <strong>{getMsg('DataManagementPage.identityIssueTitle')}</strong>
          <span>{getMsg('DataManagementPage.identityIssueDescription')}</span>
          <span>{getMsg('DataManagementPage.identityIssueRows', { rows: applicantIdentityIssues.map((issue) => issue.rowNumber).join('、') })}</span>
        </div>
      )}
      {showWorkflowNotices && showUnavailableCastWarning && (
        <section className={styles.dataIssueNotice} aria-labelledby="data-issue-notice-title">
          <button type="button" className={styles.dataIssueNoticeHeader} aria-expanded={dataIssueOpen} aria-controls={dataIssueBodyId} onClick={handleToggleDataIssue}>
            <strong id="data-issue-notice-title">{getMsg('DataManagementPage.castReferenceTitle')}</strong>
            <ChevronDown size={15} className={styles.dataIssueNoticeChevron} aria-hidden="true" />
          </button>
          <div id={dataIssueBodyId} className={styles.dataIssueNoticeBody} hidden={!dataIssueOpen}>
            {hasUnavailableApplicantCastReferences && (
              <>
                {hasUnresolvedCastReferences && <span>{getMsg('DataManagementPage.unresolvedCastReference')}</span>}
                {hasDeletedApplicantCastReferences && <span>{getMsg('DataManagementPage.deletedCastReference')}</span>}
                <span>{getMsg(isLotteryOnly ? 'DataManagementPage.lotteryOnlyCastReferenceImpact' : 'DataManagementPage.castReferenceWarning')}</span>
                <span>{getMsg('DataManagementPage.castReferenceCorrection')}</span>
              </>
            )}
            {hasUnavailableMatchingResultCasts && (
              <span>{getMsg(isMatchingResultSaved
                ? 'DataManagementPage.savedMatchingResultCastReference'
                : 'DataManagementPage.matchingResultCastReference')}</span>
            )}
            {unavailableCastNames && <span className={styles.dataIssueNoticeNames}>{getMsg('DataManagementPage.castReferenceNames', { names: unavailableCastNames })}</span>}
          </div>
        </section>
      )}

      {renderPage()}

      {(showBackToStart || workflowPage !== null) && (
        <nav className={styles.workflowNavigation} aria-label={getMsg('DataManagementStart.workflowNavigation')}>
          <button
            type="button"
            className={`${shared.btnSecondary} ${styles.workflowBackButton}`}
            disabled={isDataManagementBusy}
            onClick={() => {
              if (workflowPage === 'lottery') navigate('import');
              else if (workflowPage === 'matching') navigate('lottery');
              else navigateWithDraftCheck('dataManagement');
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {workflowBackLabel}
          </button>
          {workflowPage === 'import' && (
            <button type="button" className={shared.btnPrimary} disabled={isDataManagementBusy || disabledTabs.has('lottery')} onClick={requestLotteryPage}>
              {getMsg('DataManagementStart.openLottery')}<ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
          {workflowPage === 'lottery' && !isLotteryOnly && (
            <button type="button" className={shared.btnPrimary} disabled={isDataManagementBusy || hasSavedSessionResult || disabledTabs.has('matching')} onClick={() => navigate('matching')}>
              {getMsg('DataManagementStart.openMatching')}<ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </nav>
      )}

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
      {pendingDraftNavigation !== null && (
        <ConfirmDialog
          title={getMsg('DataManagementPage.discardImportDraftTitle')}
          message={getMsg('DataManagementPage.discardImportDraftMessage')}
          confirmLabel={getMsg('DataManagementPage.discardImportDraftConfirm')}
          cancelLabel={getMsg('common.cancel')}
          intent="danger"
          onConfirm={handleConfirmDraftNavigation}
          onCancel={handleCancelDraftNavigation}
        />
      )}
    </div>
  );
};
