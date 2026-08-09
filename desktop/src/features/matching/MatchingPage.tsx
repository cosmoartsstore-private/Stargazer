// マッチングを実行し、結果の確認・明示保存・ファイル出力を行う。

import React, { useEffect, useRef, useState } from 'react';
import { NoticeDialog } from '@/components/ConfirmModal';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { LotteryValidationPanel } from '@/features/lottery/components/LotteryValidationPanel';
import { validateLotteryConditions } from '@/features/lottery/services/lottery-validation';
import { MatchingConditionPanel } from '@/features/matching/components/MatchingConditionPanel';
import { MatchingResultsView } from '@/features/matching/components/MatchingResultsView';
import { useMatchingExecution } from '@/features/matching/hooks/useMatchingExecution';
import {
  buildMatchingResultSnapshot,
  saveMatchingResult,
} from '@/db/repositories/matchingRepository';
import {
  captureSessionWriteActivity,
  getRequiredEventContext,
  getRequiredSessionContext,
  isCurrentEventContext,
  isCurrentSessionContext,
  isSessionRecoveryActive,
  isSessionWriteActivityUnchanged,
  waitForEventWritesToSettle,
  waitForSessionWritesToSettle,
} from '@/db/repositories/commandContext';
import { getAllCasts } from '@/db/repositories/castRepository';
import { flushSessionWorkflowWrites } from '@/db/repositories/sessionWorkflowRepository';
import { getMatchingCastFingerprint } from '@/features/matching/logics/matching-input-integrity';
import { useAppContext } from '@/stores/AppContext';
import { getMsg } from '@/messages/getMsg';
import styles from './MatchingPage.module.css';
import shared from '@/styles/shared.module.css';

interface MatchingPageProps {
  onBusyChange?: (busy: boolean) => void;
}

function formatSavedMatchingLabel(winnerCount: number): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const dateTime = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return getMsg('MatchingPage.savedResultLabel', { dateTime, winnerCount });
}

export const MatchingPage: React.FC<MatchingPageProps> = ({ onBusyChange }) => {
  const {
    currentWinners: winners,
    casts,
    matchingResultState: {
      result: globalMatchingResult,
      tableSlots: globalTableSlots,
      error: globalMatchingError,
      isLocked: isMatchingLocked,
      scoreSummary,
      isSaved: isCurrentResultSaved,
    },
    matchingResultCasts,
    updateMatchingResult,
    resetMatching,
    isLotteryResultCurrent,
    sessionWorkflow,
    hasSavedSessionResult,
    markCurrentSessionResultSaved,
  } = useAppContext();
  const {
    matchingTypeCode,
    totalTables,
    usersPerTable,
    castsPerRotation,
    reserveSameDaySlots,
    sameDaySlotCount,
    sameDaySlotUnit,
  } = sessionWorkflow;

  const [alertMessage, setAlertMessage] = useState<string | null>(globalMatchingError);
  const [savingResult, setSavingResult] = useState(false);
  const savingResultRef = useRef(false);
  const matchingSaveInputRef = useRef({
    winners,
    casts,
    result: globalMatchingResult,
    tableSlots: globalTableSlots,
    scoreSummary,
    isLocked: isMatchingLocked,
    isSaved: isCurrentResultSaved,
    matchingTypeCode,
  });
  matchingSaveInputRef.current = {
    winners,
    casts,
    result: globalMatchingResult,
    tableSlots: globalTableSlots,
    scoreSummary,
    isLocked: isMatchingLocked,
    isSaved: isCurrentResultSaved,
    matchingTypeCode,
  };
  const { isComputing, runMatching, cancelMatching } = useMatchingExecution();

  useEffect(() => {
    setAlertMessage(globalMatchingError);
  }, [globalMatchingError]);

  useEffect(() => {
    onBusyChange?.(savingResult);
  }, [onBusyChange, savingResult]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const guaranteedWinnerCount = winners.filter((winner) => winner.is_guaranteed).length;
  const validation = validateLotteryConditions({
    matchingTypeCode,
    totalWinners: winners.length,
    lotteryCount: Math.max(0, winners.length - guaranteedWinnerCount),
    guaranteedCount: guaranteedWinnerCount,
    rotationCount: sessionWorkflow.rotationCount,
    totalTables,
    activeCastCount: casts.filter((cast) => cast.is_present).length,
    castsPerRotation,
    usersPerTable,
    reserveSameDaySlots,
    sameDaySlotCount,
    sameDaySlotUnit,
  });
  const effectiveValidation = hasSavedSessionResult
    ? {
        errors: [getMsg('MatchingPage.savedMatchingReadOnly')],
        warnings: [],
        info: validation.info,
      }
    : isLotteryResultCurrent
    ? validation
    : {
        errors: [getMsg('MatchingPage.staleLotteryResult')],
        warnings: [],
        info: validation.info,
      };

  const handleSaveResult = async () => {
    if (
      savingResultRef.current
      || hasSavedSessionResult
      || isCurrentResultSaved
      || !isMatchingLocked
      || globalMatchingResult === null
      || globalTableSlots === undefined
      || scoreSummary === null
      || matchingTypeCode === 'M000'
    ) return;
    const context = getRequiredSessionContext();
    const eventContext = getRequiredEventContext();
    if (isSessionRecoveryActive(context)) {
      setAlertMessage(getMsg('MatchingPage.recoveryInProgress'));
      return;
    }
    const inputBeingSaved = matchingSaveInputRef.current;
    const resultBeingSaved = inputBeingSaved.result;
    const tableSlotsBeingSaved = inputBeingSaved.tableSlots;
    const scoreSummaryBeingSaved = inputBeingSaved.scoreSummary;
    if (resultBeingSaved === null || tableSlotsBeingSaved === undefined || scoreSummaryBeingSaved === null) return;
    savingResultRef.current = true;
    setSavingResult(true);
    try {
      await Promise.all([
        flushSessionWorkflowWrites(context),
        waitForEventWritesToSettle(eventContext),
      ]);
      await waitForSessionWritesToSettle(context);
      if (
        !isCurrentEventContext(eventContext)
        || eventContext.eventName !== context.eventName
        || !isCurrentSessionContext(context)
      ) return;
      const currentInput = matchingSaveInputRef.current;
      if (
        currentInput.winners !== inputBeingSaved.winners
        || currentInput.casts !== inputBeingSaved.casts
        || currentInput.result !== inputBeingSaved.result
        || currentInput.tableSlots !== tableSlotsBeingSaved
        || currentInput.scoreSummary !== scoreSummaryBeingSaved
        || !currentInput.isLocked
        || currentInput.isSaved
        || currentInput.matchingTypeCode !== inputBeingSaved.matchingTypeCode
      ) {
        setAlertMessage(getMsg('MatchingPage.changedBeforeSave'));
        return;
      }
      const writeActivity = captureSessionWriteActivity(context);
      if (!isSessionWriteActivityUnchanged(context, writeActivity)) {
        setAlertMessage(getMsg('MatchingPage.changedBeforeSave'));
        return;
      }
      const persistedCasts = await getAllCasts();
      if (
        !isCurrentEventContext(eventContext)
        || !isCurrentSessionContext(context)
        || !isSessionWriteActivityUnchanged(context, writeActivity)
        || getMatchingCastFingerprint(inputBeingSaved.casts)
          !== getMatchingCastFingerprint(persistedCasts)
      ) {
        setAlertMessage(getMsg('MatchingPage.changedBeforeSave'));
        return;
      }
      const snapshot = buildMatchingResultSnapshot(
        inputBeingSaved.winners,
        inputBeingSaved.casts,
        resultBeingSaved,
        tableSlotsBeingSaved,
        scoreSummaryBeingSaved,
      );
      await saveMatchingResult(
        formatSavedMatchingLabel(inputBeingSaved.winners.length),
        inputBeingSaved.matchingTypeCode,
        inputBeingSaved.winners.length,
        snapshot,
        context,
      );
      if (!isCurrentSessionContext(context)) return;
      markCurrentSessionResultSaved();
      const inputAfterSave = matchingSaveInputRef.current;
      if (
        inputAfterSave.winners === inputBeingSaved.winners
        && inputAfterSave.casts === inputBeingSaved.casts
        && inputAfterSave.result === resultBeingSaved
        && inputAfterSave.tableSlots === tableSlotsBeingSaved
        && inputAfterSave.scoreSummary === scoreSummaryBeingSaved
        && inputAfterSave.isLocked
        && !inputAfterSave.isSaved
        && inputAfterSave.matchingTypeCode === inputBeingSaved.matchingTypeCode
      ) {
        updateMatchingResult({ isSaved: true });
        setAlertMessage(getMsg('MatchingPage.savedSuccessfully'));
      } else {
        updateMatchingResult({
          result: resultBeingSaved,
          tableSlots: tableSlotsBeingSaved,
          error: null,
          isLocked: true,
          scoreSummary: scoreSummaryBeingSaved,
          isSaved: true,
        }, inputBeingSaved.casts);
        setAlertMessage(getMsg('MatchingPage.savedAfterViewChanged'));
      }
    } catch {
      if (isCurrentSessionContext(context)) {
        setAlertMessage(getMsg('MatchingPage.saveFailed'));
      }
    } finally {
      savingResultRef.current = false;
      if (isCurrentSessionContext(context)) setSavingResult(false);
    }
  };

  const handleRunMatching = () => {
    if (hasSavedSessionResult) {
      setAlertMessage(getMsg('MatchingPage.savedMatchingReadOnly'));
      return;
    }
    if (savingResultRef.current || isMatchingLocked || isComputing) return;
    void runMatching();
  };

  const handleResetMatching = () => {
    if (hasSavedSessionResult) {
      setAlertMessage(getMsg('MatchingPage.savedMatchingReadOnly'));
      return;
    }
    if (savingResultRef.current || isComputing) return;
    resetMatching();
  };

  const handleAlertConfirm = () => setAlertMessage(null);

  return (
    <div className={styles.matchingScreen} style={{ paddingBottom: 80, position: 'relative' }}>
      {isComputing && <LoadingOverlay message={getMsg('MatchingPage.computing')} onCancel={cancelMatching} />}
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('MatchingPage.pageTitle')}</h1>
        <p className={shared.pageHeaderSubtitle}>{getMsg('MatchingPage.pageDescription')}</p>
      </header>

      <div className={styles.workflowTwoPane}>
        <div className={styles.workflowTwoPane__main}>
          <section className={shared.sectionBlock}>
            <div className={styles.workflowSectionHeader}>
              <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>{getMsg('MatchingPage.executionHeading')}</h2>
              <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>{getMsg('MatchingPage.executionDescription')}</p>
            </div>
            <MatchingConditionPanel disabled={hasSavedSessionResult || isMatchingLocked || savingResult || isComputing} />
          </section>
        </div>

        <aside className={styles.workflowTwoPane__side}>
          <LotteryValidationPanel
            validation={effectiveValidation}
            onRunClick={handleRunMatching}
            title={getMsg('MatchingPage.statusTitle')}
            description={getMsg('MatchingPage.statusDescription')}
            readySubtext={getMsg('MatchingPage.readySubtext')}
            runLabel={getMsg('MatchingPage.runLabel')}
            runDisabled={!isLotteryResultCurrent || hasSavedSessionResult || isMatchingLocked || savingResult || isComputing}
          />
          {isMatchingLocked && !hasSavedSessionResult && (
            <button type="button" className={shared.btnDanger} style={{ width: '100%', marginTop: 12 }} disabled={savingResult || isComputing} onClick={handleResetMatching}>{getMsg('MatchingPage.unlockAndRerun')}</button>
          )}
        </aside>
      </div>

      <MatchingResultsView
        winners={winners}
        casts={matchingResultCasts ?? casts}
        result={globalMatchingResult}
        tableSlots={globalTableSlots}
        scoreSummary={scoreSummary}
        showExportActions={isMatchingLocked}
      />

      {isMatchingLocked && globalMatchingResult !== null && (
        <div className={styles.workflowResultToolbar} style={{ marginTop: 24 }}>
          <button
            type="button"
            className={shared.btnPrimary}
            disabled={savingResult || hasSavedSessionResult || isCurrentResultSaved}
            onClick={() => { void handleSaveResult(); }}
          >
            {getMsg(savingResult
              ? 'common.saving'
              : isCurrentResultSaved || hasSavedSessionResult
                ? 'MatchingPage.resultSaved'
                : 'MatchingPage.saveResult')}
          </button>
        </div>
      )}

      {alertMessage && (
        <NoticeDialog
          title={getMsg('MatchingPage.pageTitle')}
          message={alertMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleAlertConfirm}
        />
      )}
    </div>
  );
};
