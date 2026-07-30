// 抽選条件の編集と当選結果の抽選・保存・復元を行う画面を提供します。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionWorkflowState } from '@/common/types/sessionWorkflow';
import type { AppSelectOption } from '@/components/AppSelect';
import { ConfirmDialog, NoticeDialog } from '@/components/ConfirmModal';
import { getCautionNGCastNames } from '@/features/matching/logics/caution-user';
import { GuaranteedWinnerDialog } from './components/GuaranteedWinnerDialog';
import { LotteryConditionPanel } from './components/LotteryConditionPanel';
import { LotteryResultPanel } from './components/LotteryResultPanel';
import { validateLotteryConditions } from './services/lottery-validation';
import { drawLotteryWinners, formatSavedLotteryLabel } from './services/lottery-draw';
import {
  buildLotteryPersistenceRows,
  restoreLotteryWinners,
} from './services/lottery-result-persistence';
import { useAppContext } from '@/stores/AppContext';
import {
  getLotteryResults,
  listSavedLotteryRuns,
  replaceLotteryResults,
  saveLotteryRun,
  type SavedLotteryRunRow,
} from '@/db/repositories/lotteryRepository';
import {
  loadApplicants,
  replaceApplicantGuarantees,
} from '@/db/repositories/applicantRepository';
import {
  flushSessionWorkflowWrites,
  getSessionWorkflowSnapshot,
} from '@/db/repositories/sessionWorkflowRepository';
import {
  captureSessionWriteActivity,
  getRequiredSessionContext,
  isCurrentSessionContext,
  isSessionRecoveryActive,
  isSessionWriteActivityUnchanged,
  runAsSessionRecovery,
  waitForEventWritesToSettle,
  waitForSessionWritesToSettle,
} from '@/db/repositories/commandContext';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';

export const LotteryPage: React.FC = () => {
  // セッション共有の応募者・条件・結果と、永続化世代の制御APIを取得する。
  const {
    setActivePage,
    applicants,
    setApplicants,
    casts,
    currentWinners,
    setCurrentWinners,
    isLotteryResultCurrent,
    setIsLotteryResultCurrent,
    resetMatching,
    sessionWorkflow,
    updateSessionWorkflow,
    hydrateSessionWorkflow,
    currentSessionTimestamp,
    focusedSavedLotteryRunTarget,
    clearFocusedSavedLotteryRunTarget,
    isSavedLotterySessionReadOnly,
    activateSavedLotteryRun,
    markCurrentSessionReadOnlyAfterLotterySave,
    beginSessionUiMutation,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
  } = useAppContext();
  const isSavedLotteryReadOnly = isSavedLotterySessionReadOnly;
  const {
    matchingTypeCode,
    lotteryCount,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    allowM003EmptySeats,
    m003SameDaySlotCount,
  } = sessionWorkflow;

  const activeCastCount = casts.filter((cast) => cast.is_present).length;

  // 確定当選者選択、上書き確認、保存済み結果、通知の画面状態を保持する。
  const [showGuaranteedSelect, setShowGuaranteedSelect] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [savedRuns, setSavedRuns] = useState<SavedLotteryRunRow[]>([]);
  const [selectedSavedRunId, setSelectedSavedRunId] = useState('');
  const [savingLotteryRun, setSavingLotteryRun] = useState(false);
  const [lotteryMessage, setLotteryMessage] = useState<string | null>(null);
  const savedRunsLoadGenerationRef = useRef(0);
  const appliedFocusedSavedRunRef = useRef('');
  const guaranteedWinners = useMemo(
    () => applicants.filter((applicant) => applicant.is_guaranteed),
    [applicants],
  );

  // 保存済み結果はセッション書込が静止した時点だけ採用し、古い読込結果を破棄する。
  const refreshSavedRuns = useCallback(async () => {
    const generation = savedRunsLoadGenerationRef.current + 1;
    savedRunsLoadGenerationRef.current = generation;
    if (!currentSessionTimestamp) {
      setSavedRuns([]);
      setSelectedSavedRunId('');
      return;
    }
    const context = getRequiredSessionContext();
    try {
      while (
        savedRunsLoadGenerationRef.current === generation
        && isCurrentSessionContext(context)
      ) {
        await Promise.all([
          waitForEventWritesToSettle(context),
          waitForSessionWritesToSettle(context),
        ]);
        if (
          savedRunsLoadGenerationRef.current !== generation
          || !isCurrentSessionContext(context)
        ) return;
        const writeActivity = captureSessionWriteActivity(context);
        if (!isSessionWriteActivityUnchanged(context, writeActivity)) continue;
        const runs = await listSavedLotteryRuns();
        if (
          savedRunsLoadGenerationRef.current !== generation
          || !isCurrentSessionContext(context)
        ) return;
        if (!isSessionWriteActivityUnchanged(context, writeActivity)) continue;
        setSavedRuns(runs);
        setSelectedSavedRunId((current) => {
          if (!current) return '';
          return runs.some((run) => String(run.id) === current) ? current : '';
        });
        return;
      }
    } catch {
      // 初期読込に失敗した場合は、保存済み結果一覧を空のまま保持する。
    }
  }, [currentSessionTimestamp]);

  useEffect(() => {
    setSavingLotteryRun(false);
    setShowGuaranteedSelect(false);
    setConfirmReplace(false);
    void refreshSavedRuns();
    return () => {
      savedRunsLoadGenerationRef.current += 1;
    };
  }, [refreshSavedRuns]);

  // 応募データ画面から開いた結果は、所有セッションの一覧読込後に一度だけ選択表示へ合わせる。
  useEffect(() => {
    if (
      focusedSavedLotteryRunTarget === null
      || focusedSavedLotteryRunTarget.sessionTimestamp !== currentSessionTimestamp
    ) return;
    const focusedKey = `${focusedSavedLotteryRunTarget.sessionTimestamp}:${focusedSavedLotteryRunTarget.runId}`;
    if (appliedFocusedSavedRunRef.current === focusedKey) return;
    if (!savedRuns.some((run) => run.id === focusedSavedLotteryRunTarget.runId)) return;
    appliedFocusedSavedRunRef.current = focusedKey;
    setSelectedSavedRunId(String(focusedSavedLotteryRunTarget.runId));
    clearFocusedSavedLotteryRunTarget();
  }, [clearFocusedSavedLotteryRunTarget, currentSessionTimestamp, focusedSavedLotteryRunTarget, savedRuns]);

  // 抽選人数、保存済み選択肢、条件検証を現在のworkflowから導出する。
  const guaranteedCount = guaranteedWinners.length;
  const totalWinners = lotteryCount + guaranteedCount;
  const savedRunOptions: AppSelectOption[] = useMemo(
    () => savedRuns.map((run) => ({
      value: String(run.id),
      label: getMsg('LotteryPage.savedRunOption', {
        label: run.label,
        winnerCount: run.winner_count,
        createdAt: run.created_at,
      }),
    })),
    [savedRuns],
  );
  const validation = validateLotteryConditions({
    matchingTypeCode,
    totalWinners,
    lotteryCount,
    guaranteedCount,
    totalTables,
    activeCastCount,
    castsPerRotation,
    usersPerTable,
    allowM003EmptySeats,
    sameDaySlotCount: m003SameDaySlotCount,
  });
  const isLotteryOnlyMode = matchingTypeCode === 'M000';

  // 条件または確定当選者の変更時は、現在の抽選結果と後続マッチングを無効化する。
  const invalidateInMemoryResult = () => {
    if (currentWinners.length > 0) {
      setIsLotteryResultCurrent(false);
    }
    resetMatching();
  };

  // 保存失敗時は同じセッションの応募者・抽選結果・workflowを一組で復元する。
  async function recoverPersistedLotteryState(
    context: ReturnType<typeof getRequiredSessionContext>,
  ): Promise<boolean> {
    return runAsSessionRecovery(context, async () => {
      // 後続操作が読込中に始まった場合は、その保存完了後の状態でもう一度同期する。
      while (isCurrentSessionContext(context)) {
        const generation = getSessionUiMutationGeneration();
        await Promise.all([
          waitForEventWritesToSettle(context),
          waitForSessionWritesToSettle(context),
        ]);
        if (!isCurrentSessionContext(context)) return false;
        if (!isCurrentSessionUiMutation(generation)) continue;
        const writeActivity = captureSessionWriteActivity(context);
        if (!isSessionWriteActivityUnchanged(context, writeActivity)) continue;
        const [persistedApplicants, persistedRows, workflowSnapshot] = await Promise.all([
          loadApplicants(),
          getLotteryResults(),
          getSessionWorkflowSnapshot(),
        ]);
        if (!isCurrentSessionContext(context)) return false;
        if (!isCurrentSessionUiMutation(generation)) continue;
        if (!isSessionWriteActivityUnchanged(context, writeActivity)) continue;
        setApplicants(persistedApplicants);
        setCurrentWinners(restoreLotteryWinners(persistedRows, persistedApplicants));
        hydrateSessionWorkflow(workflowSnapshot);
        resetMatching();
        return true;
      }
      return false;
    });
  }

  // workflowは画面へ即時反映し、保存失敗時だけ永続状態へ戻す。
  const commitWorkflowUpdate = (patch: Partial<SessionWorkflowState>) => {
    if (isSavedLotteryReadOnly) {
      setLotteryMessage(getMsg('LotteryPage.savedLotteryReadOnly'));
      return;
    }
    const context = getRequiredSessionContext();
    if (isSessionRecoveryActive(context)) {
      setLotteryMessage(getMsg('LotteryPage.recoveryInProgress'));
      return;
    }
    const generation = beginSessionUiMutation();
    void updateSessionWorkflow(patch).catch(async () => {
      if (!isCurrentSessionContext(context)) return;
      try {
        if (
          await recoverPersistedLotteryState(context)
          && isCurrentSessionUiMutation(generation)
        ) {
          setLotteryMessage(getMsg('LotteryPage.workflowSaveFailedRestored'));
        }
      } catch {
        if (
          isCurrentSessionContext(context)
          && isCurrentSessionUiMutation(generation)
        ) {
          setLotteryMessage(getMsg('LotteryPage.workflowSaveFailedReloadRequired'));
        }
      }
    });
  };

  // M003の当日枠を有効化する際は、最低1枠を同時に設定する。
  const handleAllowM003EmptySeatsToggle = () => {
    const next = !allowM003EmptySeats;
    commitWorkflowUpdate({
      allowM003EmptySeats: next,
      m003SameDaySlotCount:
        next && m003SameDaySlotCount < 1 ? 1 : m003SameDaySlotCount,
    });
  };

  // 確定当選者の選択状態と条件欄の要約表示を組み立てる。
  const guaranteedIds = useMemo(
    () => new Set(guaranteedWinners.map((winner) => winner.x_id)),
    [guaranteedWinners],
  );
  // 抽選の純粋処理結果を先行表示し、対応する条件revisionと一緒に永続化する。
  const runLottery = async () => {
    if (!currentSessionTimestamp || isSavedLotteryReadOnly) return;
    const context = getRequiredSessionContext();
    if (isSessionRecoveryActive(context)) {
      setLotteryMessage(getMsg('LotteryPage.recoveryInProgress'));
      return;
    }
    const nextWinners = drawLotteryWinners(applicants, guaranteedWinners, lotteryCount);
    const generation = beginSessionUiMutation();
    setCurrentWinners(nextWinners);
    // 新しい当選者を先に表示しても、DBへの全置換が終わるまでは保存・マッチング対象にしない。
    setIsLotteryResultCurrent(false);
    resetMatching();
    setConfirmReplace(false);
    try {
      // 条件保存を先に完了させ、抽選結果が対応するrevisionを同じ順序で確定する。
      await flushSessionWorkflowWrites(context);
      if (
        !isCurrentSessionContext(context)
        || !isCurrentSessionUiMutation(generation)
      ) return;
      const workflowSnapshot = await getSessionWorkflowSnapshot();
      if (
        !isCurrentSessionContext(context)
        || !isCurrentSessionUiMutation(generation)
      ) return;
      const rows = buildLotteryPersistenceRows(nextWinners);
      if (!isCurrentSessionUiMutation(generation)) return;
      await replaceLotteryResults(rows, workflowSnapshot.conditionRevision, context);
      if (
        !isCurrentSessionContext(context)
        || !isCurrentSessionUiMutation(generation)
      ) return;
      // 先行していた条件保存の完了通知が画面を古い結果扱いへ戻すため、
      // 抽選結果のtransaction確定後に同じ入力を現行結果として確定し直す。
      setCurrentWinners(nextWinners);
      setIsLotteryResultCurrent(nextWinners.length > 0);
      resetMatching();
    } catch {
      if (isCurrentSessionContext(context)) {
        try {
          if (
            await recoverPersistedLotteryState(context)
            && isCurrentSessionUiMutation(generation)
          ) {
            setLotteryMessage(getMsg('LotteryPage.runSaveFailedRestored'));
          }
        } catch {
          if (
            isCurrentSessionContext(context)
            && isCurrentSessionUiMutation(generation)
          ) {
            setLotteryMessage(getMsg('LotteryPage.runSaveFailedReloadRequired'));
          }
        }
      }
    }
  };

  // 当選者一覧へ抽選区分とNGキャスト表示を付加する。
  const resultRows = useMemo(
    () => currentWinners.map((winner) => ({
      ...winner,
      lotteryType: guaranteedIds.has(winner.x_id) || winner.is_guaranteed
        ? getMsg('LotteryPage.guaranteedWinnerType')
        : getMsg('LotteryPage.drawnWinnerType'),
      ngCastNames: getCautionNGCastNames(winner, casts),
    })),
    [casts, currentWinners, guaranteedIds],
  );
  const ngWinnerCount = resultRows.filter((row) => row.ngCastNames.length > 0).length;
  const hasStaleLotteryResult = currentWinners.length > 0 && !isLotteryResultCurrent;
  const canProceedToMatching = !isLotteryOnlyMode && resultRows.length > 0 && isLotteryResultCurrent && validation.errors.length === 0;

  // 現行抽選結果を履歴として保存し、選択肢を再取得する。
  const handleSaveLotteryRun = async () => {
    if (isSavedLotteryReadOnly || currentWinners.length === 0 || savingLotteryRun || !isLotteryResultCurrent) return;
    const context = getRequiredSessionContext();
    if (isSessionRecoveryActive(context)) {
      setLotteryMessage(getMsg('LotteryPage.recoveryInProgress'));
      return;
    }
    setSavingLotteryRun(true);
    try {
      await flushSessionWorkflowWrites(context);
      if (!isCurrentSessionContext(context)) return;
      const runId = await saveLotteryRun(formatSavedLotteryLabel(currentWinners.length), context);
      if (!isCurrentSessionContext(context)) return;
      markCurrentSessionReadOnlyAfterLotterySave();
      setSelectedSavedRunId(String(runId));
      await refreshSavedRuns();
      if (!isCurrentSessionContext(context)) return;
      setLotteryMessage(getMsg('LotteryPage.savedSuccessfully'));
    } catch {
      if (isCurrentSessionContext(context)) {
        setLotteryMessage(getMsg('LotteryPage.saveFailed'));
      }
    } finally {
      if (isCurrentSessionContext(context)) {
        setSavingLotteryRun(false);
      }
    }
  };

  // 保存済み結果の復元と画面再読込を、ライフサイクル切替の単一処理へ委ねる。
  const handleLoadSavedLotteryRun = async () => {
    const runId = Number(selectedSavedRunId);
    if (!Number.isFinite(runId) || runId <= 0) return;
    const selected = savedRuns.find((run) => run.id === runId);
    if (!selected) return;
    const context = getRequiredSessionContext();
    if (isSessionRecoveryActive(context)) {
      setLotteryMessage(getMsg('LotteryPage.recoveryInProgress'));
      return;
    }
    try {
      await flushSessionWorkflowWrites(context);
      if (!isCurrentSessionContext(context)) return;
      await activateSavedLotteryRun({
        sessionTimestamp: context.timestamp,
        runId,
      });
      setLotteryMessage(getMsg('LotteryPage.savedRunOpened', { label: selected.label }));
    } catch {
      if (isCurrentSessionContext(context)) {
        setLotteryMessage(getMsg('LotteryPage.openSavedRunFailedRestored'));
      }
    }
  };

  // 確定当選者を先行反映し、保存失敗時はセッション全体を復元する。
  const handleGuaranteedToggle = async (xId: string) => {
    if (isSavedLotteryReadOnly) return;
    const context = getRequiredSessionContext();
    if (isSessionRecoveryActive(context)) {
      setLotteryMessage(getMsg('LotteryPage.recoveryInProgress'));
      return;
    }
    const nextGuaranteedXIds = guaranteedIds.has(xId)
      ? [...guaranteedIds].filter((id) => id !== xId)
      : [...guaranteedIds, xId];
    const generation = beginSessionUiMutation();
    const nextGuaranteedIdSet = new Set(nextGuaranteedXIds);
    setApplicants(applicants.map((applicant) => ({
      ...applicant,
      is_guaranteed: nextGuaranteedIdSet.has(applicant.x_id),
    })));
    invalidateInMemoryResult();
    try {
      await replaceApplicantGuarantees(nextGuaranteedXIds, context);
    } catch {
      if (isCurrentSessionContext(context)) {
        try {
          if (
            await recoverPersistedLotteryState(context)
            && isCurrentSessionUiMutation(generation)
          ) {
            setLotteryMessage(getMsg('LotteryPage.guaranteedSaveFailedRestored'));
          }
        } catch {
          if (
            isCurrentSessionContext(context)
            && isCurrentSessionUiMutation(generation)
          ) {
            setLotteryMessage(getMsg('LotteryPage.guaranteedSaveFailedReloadRequired'));
          }
        }
      }
    }
  };

  // JSXから利用する条件変更とダイアログ操作を名前付きhandlerへ集約する。
  const handleLotteryCountChange = (value: number) => commitWorkflowUpdate({ lotteryCount: value });
  const handleRotationCountChange = (value: number) => commitWorkflowUpdate({ rotationCount: value });
  const handleTotalTablesChange = (value: number) => commitWorkflowUpdate({ totalTables: value });
  const handleUsersPerTableChange = (value: number) => commitWorkflowUpdate({ usersPerTable: value });
  const handleCastsPerRotationChange = (value: number) => commitWorkflowUpdate({ castsPerRotation: value });
  const handleSameDaySlotCountChange = (value: number) => commitWorkflowUpdate({ m003SameDaySlotCount: value });
  const handleMatchingTypeChange = (code: SessionWorkflowState['matchingTypeCode']) => {
    commitWorkflowUpdate({ matchingTypeCode: code });
  };
  const handleOpenGuaranteedSelect = () => {
    setShowGuaranteedSelect(true);
  };

  const handleCloseGuaranteedSelect = () => {
    setShowGuaranteedSelect(false);
  };

  const handleRunLotteryClick = () => {
    if (isSavedLotteryReadOnly) return;
    if (currentWinners.length > 0) {
      setConfirmReplace(true);
      return;
    }
    void runLottery();
  };

  const handleLoadSavedLotteryRunClick = () => {
    void handleLoadSavedLotteryRun();
  };

  const handleSaveLotteryRunClick = () => {
    void handleSaveLotteryRun();
  };

  const handleNavigateToMatching = () => {
    setActivePage('matching');
  };

  const handleConfirmReplace = () => {
    void runLottery();
  };

  const handleCancelReplace = () => {
    setConfirmReplace(false);
  };

  const handleCloseLotteryMessage = () => {
    setLotteryMessage(null);
  };

  return (
    <>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('LotteryPage.pageTitle')}</h1>
        <p className={shared.pageHeaderSubtitle}>{getMsg('LotteryPage.pageDescription')}</p>
      </header>

      <LotteryConditionPanel
        matchingTypeCode={matchingTypeCode}
        lotteryCount={lotteryCount}
        totalWinners={totalWinners}
        guaranteedWinners={guaranteedWinners}
        rotationCount={rotationCount}
        totalTables={totalTables}
        usersPerTable={usersPerTable}
        castsPerRotation={castsPerRotation}
        allowM003EmptySeats={allowM003EmptySeats}
        m003SameDaySlotCount={m003SameDaySlotCount}
        validation={validation}
        readOnly={isSavedLotteryReadOnly}
        onLotteryCountChange={handleLotteryCountChange}
        onOpenGuaranteedSelect={handleOpenGuaranteedSelect}
        onMatchingTypeChange={handleMatchingTypeChange}
        onRotationCountChange={handleRotationCountChange}
        onTotalTablesChange={handleTotalTablesChange}
        onUsersPerTableChange={handleUsersPerTableChange}
        onCastsPerRotationChange={handleCastsPerRotationChange}
        onAllowM003EmptySeatsToggle={handleAllowM003EmptySeatsToggle}
        onSameDaySlotCountChange={handleSameDaySlotCountChange}
        onRunLottery={handleRunLotteryClick}
      />

      <LotteryResultPanel
        resultRows={resultRows}
        ngWinnerCount={ngWinnerCount}
        selectedSavedRunId={selectedSavedRunId}
        onSelectedSavedRunIdChange={setSelectedSavedRunId}
        savedRunOptions={savedRunOptions}
        hasSavedRuns={savedRuns.length > 0}
        savingLotteryRun={savingLotteryRun}
        hasStaleLotteryResult={hasStaleLotteryResult}
        readOnly={isSavedLotteryReadOnly}
        isLotteryOnlyMode={isLotteryOnlyMode}
        canProceedToMatching={canProceedToMatching}
        onLoadSavedLotteryRun={handleLoadSavedLotteryRunClick}
        onSaveLotteryRun={handleSaveLotteryRunClick}
        onNavigateToMatching={handleNavigateToMatching}
      />

      {showGuaranteedSelect && (
        <GuaranteedWinnerDialog
          applicants={applicants}
          guaranteedIds={guaranteedIds}
          guaranteedCount={guaranteedCount}
          totalWinners={totalWinners}
          onClose={handleCloseGuaranteedSelect}
          onToggle={handleGuaranteedToggle}
        />
      )}

      {confirmReplace && (
        <ConfirmDialog
          title={getMsg('LotteryPage.replaceResultTitle')}
          message={getMsg('LotteryPage.replaceResultMessage')}
          confirmLabel={getMsg('LotteryPage.replaceResultConfirm')}
          cancelLabel={getMsg('common.cancel')}
          onConfirm={handleConfirmReplace}
          onCancel={handleCancelReplace}
        />
      )}
      {lotteryMessage && (
        <NoticeDialog
          title={getMsg('LotteryPage.resultDialogTitle')}
          message={lotteryMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleCloseLotteryMessage}
        />
      )}
    </>
  );
};
