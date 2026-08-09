import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SESSION_WORKFLOW_STATE } from '@/common/types/sessionWorkflow';
import {
  captureSessionWriteActivity,
  getRequiredEventContext,
  getRequiredSessionContext,
  isCurrentEventContext,
  isCurrentSessionContext,
  isSessionWriteActivityUnchanged,
  waitForEventWritesToSettle,
  waitForSessionWritesToSettle,
} from '@/db/repositories/commandContext';
import {
  getAllCasts,
  getAllCautionUsers,
  getLotteryResults,
  getSessionWorkflowSnapshot,
  loadApplicants,
} from '@/db';
import { restoreLotteryWinners } from '@/features/lottery/services/lottery-result-persistence';
import {
  DEFAULT_CAUTION_THRESHOLD,
  getEventCautionThreshold,
} from '@/features/matching/stores/matching-settings-store';
import { useAppContext } from '@/stores/AppContext';

type DataLoadStatus = 'loading' | 'ready' | 'failed';

export interface AppDataHydrationState {
  isSharedDataLoading: boolean;
  isSessionDataLoading: boolean;
  dataLoadError: 'shared' | 'session' | null;
  retryDataLoad: () => void;
  requestSessionReload: () => void;
}

/** 接続・書込み・画面操作の各世代を検証し、共有DBとセッションDBを画面状態へ反映する。 */
export function useAppDataHydration(): AppDataHydrationState {
  const {
    setCasts,
    setApplicants,
    setCurrentWinners,
    hydrateSessionWorkflow,
    isDbReady,
    currentEventName,
    currentSessionTimestamp,
    sessionReloadGeneration,
    setMatchingSettings,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
  } = useAppContext();
  const [sharedDataStatus, setSharedDataStatus] = useState<DataLoadStatus>('loading');
  const [sessionDataStatus, setSessionDataStatus] = useState<DataLoadStatus>('loading');
  const [dataReloadKey, setDataReloadKey] = useState(0);
  const [sessionReloadKey, setSessionReloadKey] = useState(0);
  const retryDataLoad = useCallback(() => {
    setSharedDataStatus('loading');
    setSessionDataStatus('loading');
    setDataReloadKey((current) => current + 1);
  }, []);
  const requestSessionReload = useCallback(() => {
    setSessionReloadKey((current) => current + 1);
  }, []);

  // イベント共有DBは、先行書込みと接続世代を確認してから表示キャッシュへ反映する。
  useEffect(() => {
    let isCurrent = true;
    const cancel = () => {
      isCurrent = false;
    };

    if (!isDbReady) {
      setSharedDataStatus('loading');
      return cancel;
    }
    if (currentEventName === null) {
      setCasts([]);
      setMatchingSettings((prev) => ({
        ...prev,
        caution: {
          candidateThreshold: DEFAULT_CAUTION_THRESHOLD,
          cautionUsers: [],
        },
      }));
      setSharedDataStatus('ready');
      return cancel;
    }
    let context: ReturnType<typeof getRequiredEventContext>;
    try {
      context = getRequiredEventContext();
    } catch {
      setSharedDataStatus('failed');
      return cancel;
    }
    setSharedDataStatus('loading');
    void (async () => {
      try {
        await waitForEventWritesToSettle(context);
        if (!isCurrent || !isCurrentEventContext(context)) return;
        const [loadedCasts, cautionUsers, candidateThreshold] = await Promise.all([
          getAllCasts(),
          getAllCautionUsers(),
          getEventCautionThreshold(),
        ]);
        if (!isCurrent || !isCurrentEventContext(context)) return;
        setCasts(loadedCasts);
        setMatchingSettings((prev) => ({
          ...prev,
          caution: { candidateThreshold, cautionUsers },
        }));
        setSharedDataStatus('ready');
      } catch {
        if (isCurrent && isCurrentEventContext(context)) setSharedDataStatus('failed');
      }
    })();
    return cancel;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, currentEventName, dataReloadKey]);

  // セッションDBは、UI操作世代と書込み世代が読込前後で一致した結果だけを採用する。
  useEffect(() => {
    let isCurrent = true;
    const cancel = () => {
      isCurrent = false;
    };

    if (!isDbReady) {
      setSessionDataStatus('loading');
      return cancel;
    }
    if (currentSessionTimestamp === null) {
      setApplicants([]);
      setCurrentWinners([]);
      hydrateSessionWorkflow({
        state: { ...DEFAULT_SESSION_WORKFLOW_STATE },
        isLotteryResultCurrent: false,
      });
      setSessionDataStatus('ready');
      return cancel;
    }
    let context: ReturnType<typeof getRequiredSessionContext>;
    try {
      context = getRequiredSessionContext();
    } catch {
      setSessionDataStatus('failed');
      return cancel;
    }
    setSessionDataStatus('loading');
    void (async () => {
      try {
        while (isCurrent && isCurrentSessionContext(context)) {
          const uiMutationGeneration = getSessionUiMutationGeneration();
          await Promise.all([
            waitForEventWritesToSettle(context),
            waitForSessionWritesToSettle(context),
          ]);
          if (!isCurrent || !isCurrentSessionContext(context)) return;
          if (!isCurrentSessionUiMutation(uiMutationGeneration)) continue;
          const writeActivity = captureSessionWriteActivity(context);
          if (!isSessionWriteActivityUnchanged(context, writeActivity)) continue;

          let loadedApplicants;
          let lotteryRows;
          let workflowSnapshot;
          try {
            [loadedApplicants, lotteryRows, workflowSnapshot] = await Promise.all([
              loadApplicants(),
              getLotteryResults(),
              getSessionWorkflowSnapshot(),
            ]);
          } catch (error) {
            if (
              isCurrent
              && isCurrentSessionContext(context)
              && (
                !isCurrentSessionUiMutation(uiMutationGeneration)
                || !isSessionWriteActivityUnchanged(context, writeActivity)
              )
            ) continue;
            throw error;
          }
          if (!isCurrent || !isCurrentSessionContext(context)) return;
          if (!isCurrentSessionUiMutation(uiMutationGeneration)) continue;
          if (!isSessionWriteActivityUnchanged(context, writeActivity)) continue;
          const winners = restoreLotteryWinners(lotteryRows, loadedApplicants);
          setApplicants(loadedApplicants);
          setCurrentWinners(winners);
          hydrateSessionWorkflow({
            ...workflowSnapshot,
            isLotteryResultCurrent:
              workflowSnapshot.isLotteryResultCurrent && winners.length > 0,
          });
          setSessionDataStatus('ready');
          return;
        }
      } catch {
        if (isCurrent && isCurrentSessionContext(context)) {
          setSessionDataStatus('failed');
        }
      }
    })();
    return cancel;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, currentEventName, currentSessionTimestamp, sessionReloadGeneration, sessionReloadKey, dataReloadKey]);

  return {
    isSharedDataLoading: sharedDataStatus === 'loading',
    isSessionDataLoading: sessionDataStatus === 'loading',
    dataLoadError: sessionDataStatus === 'failed'
      ? 'session'
      : sharedDataStatus === 'failed'
        ? 'shared'
        : null,
    retryDataLoad,
    requestSessionReload,
  };
}
