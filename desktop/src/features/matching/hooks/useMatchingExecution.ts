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
import type { MatchingScoreSummary } from '@/features/matching/logics/matching-io';
import { formatFailureMessage } from '@/features/matching/presenters/matching-result-view';
import { useAppContext } from '@/stores/AppContext';
import { getMsg } from '@/messages/getMsg';
import type { MatchingWorkerMessage } from '../matching.worker';

// Worker探索の上限時間と、制約緩和へ切り替える経過時間。
const MATCHING_SEARCH_TIME_LIMIT_MS = 30_000;
const MATCHING_RELAXED_AFTER_MS = 10_000;

/** DBスナップショットの確認からWorkerの終了処理まで、1回のマッチング実行を管理する。 */
export function useMatchingExecution() {
  const {
    currentWinners: winners,
    casts,
    updateMatchingResult,
    isLotteryResultCurrent,
    sessionWorkflow,
    matchingSettings,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
  } = useAppContext();
  const {
    matchingTypeCode,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    allowM003EmptySeats,
    m003SameDaySlotCount,
  } = sessionWorkflow;

  // 実行中の表示状態と、現在有効なWorker要求をまとめて管理する。
  const [isComputing, setIsComputing] = useState(false);
  const [scoreSummary, setScoreSummary] = useState<MatchingScoreSummary | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestGenerationRef = useRef(0);

  // 入力指紋は非同期処理の各境界で最新値と照合する。
  const inputFingerprint = useMemo(() => getMatchingInputFingerprint({
    winners,
    casts,
    workflow: sessionWorkflow,
    searchMode: matchingSettings.searchMode,
    isLotteryResultCurrent,
  }), [casts, isLotteryResultCurrent, matchingSettings.searchMode, sessionWorkflow, winners]);
  const inputFingerprintRef = useRef(inputFingerprint);
  inputFingerprintRef.current = inputFingerprint;

  const m003Capacity = matchingTypeCode === 'M003'
    ? selectM003Capacity({
        totalTables,
        usersPerTable,
        totalWinners: winners.length,
        activeCastCount: casts.filter((cast) => cast.is_present).length,
        castsPerRotation,
        includedSameDaySlotCount: allowM003EmptySeats ? m003SameDaySlotCount : 0,
      })
    : null;
  const effectiveTableCount = m003Capacity?.executionTableCount ?? totalTables;

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const cancelMatching = useCallback(() => {
    requestGenerationRef.current += 1;
    stopWorker();
    setIsComputing(false);
    updateMatchingResult({ error: getMsg('MatchingPage.cancelled'), isLocked: false });
  }, [stopWorker, updateMatchingResult]);

  useEffect(() => () => {
    requestGenerationRef.current += 1;
    stopWorker();
  }, [stopWorker]);

  useEffect(() => {
    if (isLotteryResultCurrent) return;
    requestGenerationRef.current += 1;
    stopWorker();
    setIsComputing(false);
  }, [isLotteryResultCurrent, stopWorker]);

  const runMatching = useCallback(async () => {
    if (!isLotteryResultCurrent) {
      updateMatchingResult({ error: getMsg('MatchingPage.staleLotteryResult') });
      return;
    }

    stopWorker();
    setIsComputing(true);
    updateMatchingResult({ error: null });
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const sessionUiMutationGeneration = getSessionUiMutationGeneration();
    const requestInputFingerprint = inputFingerprint;
    let sessionContext: ReturnType<typeof getRequiredSessionContext>;
    let eventContext: ReturnType<typeof getRequiredEventContext>;
    let writeActivity: SessionWriteActivity | null = null;

    const showRecoveryMessage = () => {
      setIsComputing(false);
      updateMatchingResult({ error: getMsg('MatchingPage.recoveryInProgress'), isLocked: false });
    };
    const showChangedInputMessage = (message: string) => {
      setIsComputing(false);
      updateMatchingResult({ error: message, isLocked: false });
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
          !isCurrentEventContext(eventContext)
          || eventContext.eventName !== sessionContext.eventName
          || !isCurrentSessionContext(sessionContext)
          || !isCurrentSessionUiMutation(sessionUiMutationGeneration)
        ) {
          setIsComputing(false);
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
          !isCurrentEventContext(eventContext)
          || eventContext.eventName !== sessionContext.eventName
          || !isCurrentSessionContext(sessionContext)
          || !isCurrentSessionUiMutation(sessionUiMutationGeneration)
        ) {
          setIsComputing(false);
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
      if (requestGenerationRef.current !== requestGeneration) return;
      setIsComputing(false);
      updateMatchingResult({ error: getMsg('MatchingPage.preflightFailed'), isLocked: false });
      return;
    }
    if (writeActivity === null) return;
    const matchingWriteActivity = writeActivity;

    const worker = new Worker(new URL('../matching.worker.ts', import.meta.url), { type: 'module' });
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
      setIsComputing(false);

      if (message.type === 'error') {
        updateMatchingResult({
          result: null,
          tableSlots: undefined,
          error: getMsg('MatchingPage.unexpectedMatchingError'),
          isLocked: false,
        });
        setScoreSummary(null);
        return;
      }
      const result = message.result;
      if (result.ngConflict) {
        updateMatchingResult({
          result: null,
          tableSlots: undefined,
          error: formatFailureMessage(result.failureReason),
          isLocked: false,
        });
        setScoreSummary(null);
        return;
      }
      updateMatchingResult({ result: result.userMap, tableSlots: result.tableSlots, error: null, isLocked: true });
      setScoreSummary(result.scoreSummary ?? null);
    };

    worker.onerror = () => {
      if (workerRef.current !== worker || requestGenerationRef.current !== requestGeneration) return;
      if (hasExecutionContextChanged()) {
        stopWorker();
        showChangedInputMessage(getMsg('MatchingPage.changedDuringMatching'));
        return;
      }
      stopWorker();
      setIsComputing(false);
      updateMatchingResult({
        result: null,
        tableSlots: undefined,
        error: getMsg('MatchingPage.unexpectedMatchingError'),
        isLocked: false,
      });
      setScoreSummary(null);
    };

    worker.postMessage({
      winners,
      casts,
      matchingTypeCode,
      options: {
        rotationCount,
        totalTables: matchingTypeCode === 'M003' ? effectiveTableCount : totalTables,
        usersPerTable: matchingTypeCode === 'M003' ? usersPerTable : undefined,
        castsPerRotation: matchingTypeCode === 'M003' ? castsPerRotation : undefined,
        searchTimeLimitMs: MATCHING_SEARCH_TIME_LIMIT_MS,
        relaxedAfterMs: MATCHING_RELAXED_AFTER_MS,
        searchMode: matchingSettings.searchMode,
      },
    });
  }, [
    casts,
    castsPerRotation,
    effectiveTableCount,
    getSessionUiMutationGeneration,
    inputFingerprint,
    isCurrentSessionUiMutation,
    isLotteryResultCurrent,
    matchingSettings.searchMode,
    matchingTypeCode,
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
