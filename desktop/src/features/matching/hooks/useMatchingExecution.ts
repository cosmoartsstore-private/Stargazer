import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAllCasts } from '@/db/repositories/castRepository';
import {
  captureSessionWriteActivity,
  getRequiredEventContext,
  getRequiredSessionContext,
  isCurrentEventContext,
  isCurrentSessionContext,
  isEventRecoveryActive,
  isSessionRecoveryActive,
  isSessionWriteActivityUnchanged,
  waitForEventWritesToSettle,
  waitForSessionWritesToSettle,
  type SessionWriteActivity,
} from '@/db/repositories/commandContext';
import { getLotteryResults } from '@/db/repositories/lotteryRepository';
import { flushSessionWorkflowWrites, getSessionWorkflowSnapshot } from '@/db/repositories/sessionWorkflowRepository';
import {
  getMatchingCastFingerprint,
  getMatchingInputFingerprint,
  isSameLotteryResult,
  isSameWorkflowState,
} from '@/features/matching/logics/matching-input-integrity';
import { selectM003Capacity } from '@/features/matching/logics/matching-capacity';
import { formatFailureMessage } from '@/features/matching/presenters/matching-result-view';
import { useAppContext } from '@/stores/AppContext';
import { getMsg } from '@/messages/getMsg';
import type { MatchingWorkerMessage } from '../matching.worker';

// Workerが応答しない場合に画面操作を復帰させる上限時間。
export const MATCHING_WORKER_TIME_LIMIT_MS = 30_000;

/** 現在有効なWorkerだけを30秒後に停止し、時間切れとして通知する。 */
export function scheduleMatchingWorkerDeadline(
  isCurrentRequest: () => boolean,
  terminateWorker: () => void,
  reportTimeLimit: () => void,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    if (!isCurrentRequest()) return;
    terminateWorker();
    reportTimeLimit();
  }, MATCHING_WORKER_TIME_LIMIT_MS);
}

/** DBスナップショットの確認からWorkerの終了処理まで、1回のマッチング実行を管理する。 */
export function useMatchingExecution() {
  const {
    currentWinners: winners,
    casts,
    updateMatchingResult,
    isLotteryResultCurrent,
    sessionWorkflow,
    matchingResultState: { scoreSummary, isLocked: isMatchingLocked },
    hasSavedSessionResult,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
  } = useAppContext();
  const {
    matchingTypeCode,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    reserveSameDaySlots,
    sameDaySlotCount,
    sameDaySlotUnit,
  } = sessionWorkflow;

  // 実行中の表示状態と、現在有効なWorker要求をまとめて管理する。
  const [isComputing, setIsComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const workerDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestGenerationRef = useRef(0);
  const isRunningRef = useRef(false);

  // 入力指紋は非同期処理の各境界で最新値と照合する。
  const inputFingerprint = useMemo(() => getMatchingInputFingerprint({
    winners,
    casts,
    workflow: sessionWorkflow,
    isLotteryResultCurrent,
  }), [casts, isLotteryResultCurrent, sessionWorkflow, winners]);
  const inputFingerprintRef = useRef(inputFingerprint);
  inputFingerprintRef.current = inputFingerprint;

  const m003Capacity = matchingTypeCode === 'M003'
    ? selectM003Capacity({
        totalTables,
        usersPerTable,
        totalWinners: winners.length,
        activeCastCount: casts.filter((cast) => cast.is_present).length,
        castsPerRotation,
        reservedSameDaySlotCount: reserveSameDaySlots ? sameDaySlotCount : 0,
        sameDaySlotUnit,
      })
    : null;
  const executionTableCount = m003Capacity?.executionTableCount ?? totalTables;
  const m003LotterySeatCount = m003Capacity?.lotterySeatCount ?? null;

  const stopWorker = useCallback(() => {
    if (workerDeadlineRef.current !== null) {
      clearTimeout(workerDeadlineRef.current);
      workerDeadlineRef.current = null;
    }
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const clearMatchingResult = useCallback((error: string | null) => {
    updateMatchingResult({
      result: null,
      tableSlots: undefined,
      error,
      isLocked: false,
      scoreSummary: null,
      isSaved: false,
    });
  }, [updateMatchingResult]);

  const cancelMatching = useCallback(() => {
    requestGenerationRef.current += 1;
    stopWorker();
    isRunningRef.current = false;
    setIsComputing(false);
    clearMatchingResult(getMsg('MatchingPage.cancelled'));
  }, [clearMatchingResult, stopWorker]);

  useEffect(() => () => {
    requestGenerationRef.current += 1;
    isRunningRef.current = false;
    stopWorker();
  }, [stopWorker]);

  useEffect(() => {
    if (isLotteryResultCurrent) return;
    requestGenerationRef.current += 1;
    stopWorker();
    isRunningRef.current = false;
    setIsComputing(false);
    clearMatchingResult(null);
  }, [clearMatchingResult, isLotteryResultCurrent, stopWorker]);

  const runMatching = useCallback(async () => {
    if (hasSavedSessionResult) {
      updateMatchingResult({ error: getMsg('MatchingPage.savedMatchingReadOnly') });
      return;
    }
    if (isMatchingLocked || isRunningRef.current) return;
    if (!isLotteryResultCurrent) {
      clearMatchingResult(getMsg('MatchingPage.staleLotteryResult'));
      return;
    }
    if (
      matchingTypeCode === 'M003'
      && m003LotterySeatCount !== null
      && winners.length > m003LotterySeatCount
    ) {
      clearMatchingResult(getMsg('lotteryValidation.insufficientGroupSeats', {
        lotterySeatCount: m003LotterySeatCount,
        totalWinners: winners.length,
      }));
      return;
    }

    stopWorker();
    isRunningRef.current = true;
    setIsComputing(true);
    clearMatchingResult(null);
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const sessionUiMutationGeneration = getSessionUiMutationGeneration();
    const requestInputFingerprint = inputFingerprint;
    let sessionContext: ReturnType<typeof getRequiredSessionContext>;
    let eventContext: ReturnType<typeof getRequiredEventContext>;
    let writeActivity: SessionWriteActivity | null = null;

    const stopCurrentRequest = () => {
      if (requestGenerationRef.current !== requestGeneration) return;
      isRunningRef.current = false;
      setIsComputing(false);
    };
    const failCurrentRequest = (message: string) => {
      if (requestGenerationRef.current !== requestGeneration) return;
      stopCurrentRequest();
      clearMatchingResult(message);
    };

    const showRecoveryMessage = () => {
      failCurrentRequest(getMsg('MatchingPage.recoveryInProgress'));
    };
    const showChangedInputMessage = (message: string) => {
      failCurrentRequest(message);
    };

    try {
      sessionContext = getRequiredSessionContext();
      eventContext = getRequiredEventContext();
      if (
        eventContext.eventName !== sessionContext.eventName
        || isEventRecoveryActive(eventContext)
        || isSessionRecoveryActive(sessionContext)
      ) {
        showRecoveryMessage();
        return;
      }

      // 保存待ちを完了させ、画面入力とDBスナップショットが一致する時点だけWorkerを開始する。
      await Promise.all([
        waitForEventWritesToSettle(eventContext),
        flushSessionWorkflowWrites(sessionContext),
      ]);
      while (requestGenerationRef.current === requestGeneration) {
        await Promise.all([
          waitForEventWritesToSettle(eventContext),
          waitForSessionWritesToSettle(sessionContext),
        ]);
        if (
          requestGenerationRef.current !== requestGeneration
          || !isCurrentEventContext(eventContext)
          || eventContext.eventName !== sessionContext.eventName
          || !isCurrentSessionContext(sessionContext)
          || !isCurrentSessionUiMutation(sessionUiMutationGeneration)
        ) {
          stopCurrentRequest();
          return;
        }
        if (isEventRecoveryActive(eventContext) || isSessionRecoveryActive(sessionContext)) {
          showRecoveryMessage();
          return;
        }
        if (inputFingerprintRef.current !== requestInputFingerprint) {
          showChangedInputMessage(getMsg('MatchingPage.changedDuringPreflight'));
          return;
        }

        const candidateActivity = captureSessionWriteActivity(sessionContext);
        if (!isSessionWriteActivityUnchanged(sessionContext, candidateActivity)) continue;
        const [workflowSnapshot, persistedLotteryRows, persistedCasts] = await Promise.all([
          getSessionWorkflowSnapshot(),
          getLotteryResults(),
          getAllCasts(),
        ]);
        if (
          requestGenerationRef.current !== requestGeneration
          || !isCurrentEventContext(eventContext)
          || eventContext.eventName !== sessionContext.eventName
          || !isCurrentSessionContext(sessionContext)
          || !isCurrentSessionUiMutation(sessionUiMutationGeneration)
        ) {
          stopCurrentRequest();
          return;
        }
        if (isEventRecoveryActive(eventContext) || isSessionRecoveryActive(sessionContext)) {
          showRecoveryMessage();
          return;
        }
        if (!isSessionWriteActivityUnchanged(sessionContext, candidateActivity)) continue;
        if (inputFingerprintRef.current !== requestInputFingerprint) {
          showChangedInputMessage(getMsg('MatchingPage.changedDuringPreflight'));
          return;
        }
        if (
          !workflowSnapshot.isLotteryResultCurrent
          || !isSameWorkflowState(workflowSnapshot.state, sessionWorkflow)
          || !isSameLotteryResult(winners, persistedLotteryRows)
          || getMatchingCastFingerprint(casts) !== getMatchingCastFingerprint(persistedCasts)
        ) {
          showChangedInputMessage(getMsg('MatchingPage.lotterySaveNotSettled'));
          return;
        }
        writeActivity = candidateActivity;
        break;
      }
    } catch {
      failCurrentRequest(getMsg('MatchingPage.preflightFailed'));
      return;
    }
    if (
      writeActivity === null
      || requestGenerationRef.current !== requestGeneration
    ) return;
    const matchingWriteActivity = writeActivity;

    let worker: Worker;
    try {
      worker = new Worker(new URL('../matching.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      failCurrentRequest(getMsg('MatchingPage.unexpectedMatchingError'));
      return;
    }
    workerRef.current = worker;

    const hasExecutionContextChanged = () => (
      !isCurrentEventContext(eventContext)
      || !isCurrentSessionContext(sessionContext)
      || !isCurrentSessionUiMutation(sessionUiMutationGeneration)
      || !isSessionWriteActivityUnchanged(sessionContext, matchingWriteActivity)
      || isEventRecoveryActive(eventContext)
      || isSessionRecoveryActive(sessionContext)
      || inputFingerprintRef.current !== requestInputFingerprint
    );

    worker.onmessage = (event: MessageEvent<MatchingWorkerMessage>) => {
      if (workerRef.current !== worker || requestGenerationRef.current !== requestGeneration) return;
      if (hasExecutionContextChanged()) {
        stopWorker();
        showChangedInputMessage(getMsg('MatchingPage.changedDuringMatching'));
        return;
      }
      const message = event.data;
      stopWorker();
      isRunningRef.current = false;
      setIsComputing(false);

      if (message.type === 'error') {
        clearMatchingResult(getMsg('MatchingPage.unexpectedMatchingError'));
        return;
      }
      const result = message.result;
      if (result.ngConflict) {
        clearMatchingResult(formatFailureMessage(result.failureReason));
        return;
      }
      if (!result.tableSlots || !result.scoreSummary) {
        clearMatchingResult(getMsg('MatchingPage.unexpectedMatchingError'));
        return;
      }
      updateMatchingResult({
        result: result.userMap,
        tableSlots: result.tableSlots,
        error: null,
        isLocked: true,
        scoreSummary: result.scoreSummary,
        isSaved: false,
      });
    };

    worker.onerror = () => {
      if (workerRef.current !== worker || requestGenerationRef.current !== requestGeneration) return;
      if (hasExecutionContextChanged()) {
        stopWorker();
        showChangedInputMessage(getMsg('MatchingPage.changedDuringMatching'));
        return;
      }
      stopWorker();
      failCurrentRequest(getMsg('MatchingPage.unexpectedMatchingError'));
    };

    // Workerが応答しない場合にも操作を復帰できるよう、画面側で実行時間を制限する。
    workerDeadlineRef.current = scheduleMatchingWorkerDeadline(
      () => workerRef.current === worker && requestGenerationRef.current === requestGeneration,
      stopWorker,
      () => failCurrentRequest(formatFailureMessage('time-limit')),
    );

    try {
      worker.postMessage({
        winners,
        casts,
        matchingTypeCode,
        options: {
          rotationCount,
          totalTables: matchingTypeCode === 'M003' ? executionTableCount : totalTables,
          usersPerTable: matchingTypeCode === 'M003' ? usersPerTable : undefined,
          castsPerRotation: matchingTypeCode === 'M003' ? castsPerRotation : undefined,
        },
      });
    } catch {
      if (workerRef.current !== worker || requestGenerationRef.current !== requestGeneration) return;
      stopWorker();
      failCurrentRequest(getMsg('MatchingPage.unexpectedMatchingError'));
    }
  }, [
    casts,
    castsPerRotation,
    clearMatchingResult,
    executionTableCount,
    getSessionUiMutationGeneration,
    hasSavedSessionResult,
    inputFingerprint,
    isCurrentSessionUiMutation,
    isMatchingLocked,
    isLotteryResultCurrent,
    matchingTypeCode,
    m003LotterySeatCount,
    rotationCount,
    sessionWorkflow,
    stopWorker,
    totalTables,
    updateMatchingResult,
    usersPerTable,
    winners,
  ]);

  return { isComputing, scoreSummary, runMatching, cancelMatching };
}
