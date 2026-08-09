// 抽選条件の編集と当選結果の抽選・保存・復元を行う画面を提供します。

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionWorkflowState } from '@/common/types/sessionWorkflow';
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
  replaceLotteryResults,
  saveLotteryResult,
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

interface LotteryPageProps {
  onBusyChange?: (busy: boolean) => void;
}

export const LotteryPage: React.FC<LotteryPageProps> = ({ onBusyChange }) => {
  // セッション共有の応募者・条件・結果と、永続化世代の制御APIを取得する。
  const {
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
    isLotteryInputReadOnly,
    hasSavedSessionResult,
    markCurrentSessionResultSaved,
    beginSessionUiMutation,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
  } = useAppContext();
  const isLotteryReadOnly = isLotteryInputReadOnly || hasSavedSessionResult;
  const {
    matchingTypeCode,
    lotteryCount,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    reserveSameDaySlots,
    sameDaySlotCount,
    sameDaySlotUnit,
  } = sessionWorkflow;

  const activeCastCount = casts.filter((cast) => cast.is_present).length;

  // 確定当選者選択、上書き確認、明示保存、通知の画面状態を保持する。
  const [showGuaranteedSelect, setShowGuaranteedSelect] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [savingLotteryResult, setSavingLotteryResult] = useState(false);
  const savingLotteryResultRef = useRef(false);
  const currentWinnersRef = useRef(currentWinners);
  currentWinnersRef.current = currentWinners;
  const [lotteryMessage, setLotteryMessage] = useState<string | null>(null);
  const guaranteedWinners = useMemo(
    () => applicants.filter((applicant) => applicant.is_guaranteed),
    [applicants],
  );

  useEffect(() => {
    savingLotteryResultRef.current = false;
    setSavingLotteryResult(false);
    setShowGuaranteedSelect(false);
    setConfirmReplace(false);
  }, [currentSessionTimestamp]);

  useEffect(() => {
    onBusyChange?.(savingLotteryResult);
  }, [onBusyChange, savingLotteryResult]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  // 抽選人数と条件検証を現在のworkflowから導出する。
  const guaranteedCount = guaranteedWinners.length;
  const availableLotteryCandidateCount = Math.max(0, applicants.length - guaranteedCount);
  const totalWinners = lotteryCount + guaranteedCount;
  const validation = validateLotteryConditions({
    matchingTypeCode,
    totalWinners,
    lotteryCount,
    guaranteedCount,
    availableLotteryCandidateCount,
    rotationCount,
    totalTables,
    activeCastCount,
    castsPerRotation,
    usersPerTable,
    reserveSameDaySlots,
    sameDaySlotCount,
    sameDaySlotUnit,
  });
  const isLotteryExecutionReadOnly = isLotteryReadOnly;

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
    if (savingLotteryResultRef.current) return;
    if (isLotteryReadOnly) {
      setLotteryMessage(getMsg('LotteryPage.savedResultReadOnly'));
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

  // 当日枠を有効化する際は、最低1枠を同時に設定する。
  const handleReserveSameDaySlotsToggle = () => {
    const next = !reserveSameDaySlots;
    commitWorkflowUpdate({
      reserveSameDaySlots: next,
      sameDaySlotCount: next && sameDaySlotCount < 1 ? 1 : sameDaySlotCount,
    });
  };

  // 確定当選者の選択状態と条件欄の要約表示を組み立てる。
  const guaranteedIds = useMemo(
    () => new Set(guaranteedWinners.map((winner) => winner.x_id)),
    [guaranteedWinners],
  );
  // 抽選の純粋処理結果を先行表示し、対応する条件revisionと一緒に永続化する。
  const runLottery = async () => {
    // warningは運営判断のため表示だけ行い、errorがない限り抽選を許可する。
    if (
      !currentSessionTimestamp
      || isLotteryExecutionReadOnly
      || savingLotteryResultRef.current
      || validation.errors.length > 0
    ) return;
    const context = getRequiredSessionContext();
    if (isSessionRecoveryActive(context)) {
      setLotteryMessage(getMsg('LotteryPage.recoveryInProgress'));
      return;
    }
    const nextWinners = drawLotteryWinners(applicants, guaranteedWinners, lotteryCount);
    if (nextWinners.length !== totalWinners) {
      setLotteryMessage(getMsg('LotteryPage.insufficientCandidates'));
      return;
    }
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

  // 現行抽選結果を、作業セッションから独立したイベント共有結果として保存する。
  const handleSaveLotteryResult = async () => {
    if (
      isLotteryExecutionReadOnly
      || currentWinners.length === 0
      || savingLotteryResultRef.current
      || !isLotteryResultCurrent
    ) return;
    const context = getRequiredSessionContext();
    if (isSessionRecoveryActive(context)) {
      setLotteryMessage(getMsg('LotteryPage.recoveryInProgress'));
      return;
    }
    const saveGeneration = getSessionUiMutationGeneration();
    const winnersBeingSaved = currentWinners;
    savingLotteryResultRef.current = true;
    setSavingLotteryResult(true);
    setShowGuaranteedSelect(false);
    setConfirmReplace(false);
    try {
      await flushSessionWorkflowWrites(context);
      await waitForSessionWritesToSettle(context);
      if (!isCurrentSessionContext(context)) return;
      if (
        !isCurrentSessionUiMutation(saveGeneration)
        || currentWinnersRef.current !== winnersBeingSaved
      ) {
        setLotteryMessage(getMsg('LotteryPage.changedBeforeSave'));
        return;
      }
      await saveLotteryResult(formatSavedLotteryLabel(winnersBeingSaved.length), context);
      if (!isCurrentSessionContext(context)) return;
      markCurrentSessionResultSaved();
      if (
        isCurrentSessionUiMutation(saveGeneration)
        && currentWinnersRef.current === winnersBeingSaved
      ) {
        setLotteryMessage(getMsg('LotteryPage.savedSuccessfully'));
      } else {
        setLotteryMessage(getMsg('LotteryPage.savedAfterViewChanged'));
      }
    } catch {
      if (isCurrentSessionContext(context)) {
        setLotteryMessage(getMsg('LotteryPage.saveFailed'));
      }
    } finally {
      savingLotteryResultRef.current = false;
      if (isCurrentSessionContext(context)) {
        setSavingLotteryResult(false);
      }
    }
  };

  // 確定当選者を先行反映し、保存失敗時はセッション全体を復元する。
  const handleGuaranteedToggle = async (xId: string) => {
    if (isLotteryReadOnly || savingLotteryResultRef.current) return;
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
  const handleSameDaySlotCountChange = (value: number) => commitWorkflowUpdate({ sameDaySlotCount: value });
  const handleSameDaySlotUnitChange = (value: SessionWorkflowState['sameDaySlotUnit']) => {
    commitWorkflowUpdate({ sameDaySlotUnit: value });
  };
  const handleMatchingTypeChange = (code: SessionWorkflowState['matchingTypeCode']) => {
    commitWorkflowUpdate({ matchingTypeCode: code });
  };
  const handleOpenGuaranteedSelect = () => {
    if (savingLotteryResultRef.current) return;
    setShowGuaranteedSelect(true);
  };

  const handleCloseGuaranteedSelect = () => {
    setShowGuaranteedSelect(false);
  };

  const handleRunLotteryClick = () => {
    if (isLotteryExecutionReadOnly || savingLotteryResultRef.current) return;
    if (currentWinners.length > 0) {
      setConfirmReplace(true);
      return;
    }
    void runLottery();
  };

  const handleSaveLotteryResultClick = () => {
    void handleSaveLotteryResult();
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
        reserveSameDaySlots={reserveSameDaySlots}
        sameDaySlotCount={sameDaySlotCount}
        sameDaySlotUnit={sameDaySlotUnit}
        validation={validation}
        readOnly={isLotteryReadOnly || savingLotteryResult}
        runDisabled={isLotteryExecutionReadOnly || savingLotteryResult}
        onLotteryCountChange={handleLotteryCountChange}
        onOpenGuaranteedSelect={handleOpenGuaranteedSelect}
        onMatchingTypeChange={handleMatchingTypeChange}
        onRotationCountChange={handleRotationCountChange}
        onTotalTablesChange={handleTotalTablesChange}
        onUsersPerTableChange={handleUsersPerTableChange}
        onCastsPerRotationChange={handleCastsPerRotationChange}
        onReserveSameDaySlotsToggle={handleReserveSameDaySlotsToggle}
        onSameDaySlotCountChange={handleSameDaySlotCountChange}
        onSameDaySlotUnitChange={handleSameDaySlotUnitChange}
        onRunLottery={handleRunLotteryClick}
      />

      <LotteryResultPanel
        resultRows={resultRows}
        ngWinnerCount={ngWinnerCount}
        savingLotteryResult={savingLotteryResult}
        hasStaleLotteryResult={hasStaleLotteryResult}
        readOnly={isLotteryExecutionReadOnly}
        onSaveLotteryResult={handleSaveLotteryResultClick}
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
