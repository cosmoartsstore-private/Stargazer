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
import { getMsg } from '@/messages/getMsg';
import { useAppContext } from '@/stores/AppContext';

export interface UseAppDataHydrationOptions {
  onAlert: (message: string) => void;
}

export interface AppDataHydrationState {
  isSharedDataLoading: boolean;
  isSessionDataLoading: boolean;
  requestSessionReload: () => void;
}

/** 接続・書込み・画面操作の各世代を検証し、共有DBとセッションDBを画面状態へ反映する。 */
export function useAppDataHydration({ onAlert }: UseAppDataHydrationOptions): AppDataHydrationState {
  const {
    setCasts,
    setApplicants,
    setCurrentWinners,
    hydrateSessionWorkflow,
    isDbReady,
    currentEventName,
    currentSessionTimestamp,
    setMatchingSettings,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
  } = useAppContext();
  const [isSharedDataLoading, setIsSharedDataLoading] = useState(true);
  const [isSessionDataLoading, setIsSessionDataLoading] = useState(true);
  const [sessionReloadKey, setSessionReloadKey] = useState(0);
  const requestSessionReload = useCallback(() => {
    setSessionReloadKey((current) => current + 1);
  }, []);

  // イベント共有DBは、先行書込みと接続世代を確認してから表示キャッシュへ反映する。
  useEffect(() => {
    let isCurrent = true;
    const cancel = () => {
      isCurrent = false;
    };

    if (!isDbReady) return cancel;
    setCasts([]);
    setMatchingSettings((prev) => ({
      ...prev,
      caution: {
        candidateThreshold: DEFAULT_CAUTION_THRESHOLD,
        cautionUsers: [],
      },
    }));
    if (currentEventName === null) {
      setIsSharedDataLoading(false);
      return cancel;
    }
    let context: ReturnType<typeof getRequiredEventContext>;
    try {
      context = getRequiredEventContext();
    } catch {
      setIsSharedDataLoading(false);
      return cancel;
    }
    setIsSharedDataLoading(true);
    void (async () => {
      await waitForEventWritesToSettle(context);
      if (!isCurrent || !isCurrentEventContext(context)) return;
      const [castsResult, cautionResult, thresholdResult] = await Promise.allSettled([
        getAllCasts(),
        getAllCautionUsers(),
        getEventCautionThreshold(),
      ]);
      if (!isCurrent || !isCurrentEventContext(context)) return;

      if (castsResult.status === 'fulfilled') {
        setCasts(castsResult.value);
      }
      const cautionUsers = cautionResult.status === 'fulfilled' ? cautionResult.value : [];
      const candidateThreshold = thresholdResult.status === 'fulfilled'
        ? thresholdResult.value
        : DEFAULT_CAUTION_THRESHOLD;
      setMatchingSettings((prev) => ({
        ...prev,
        caution: { candidateThreshold, cautionUsers },
      }));
    })().finally(() => {
      if (isCurrent) setIsSharedDataLoading(false);
    });
    return cancel;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, currentEventName]);

  // セッションDBは、UI操作世代と書込み世代が読込前後で一致した結果だけを採用する。
  useEffect(() => {
    let isCurrent = true;
    const cancel = () => {
      isCurrent = false;
    };

    if (!isDbReady) return cancel;
    setApplicants([]);
    setCurrentWinners([]);
    hydrateSessionWorkflow({
      state: { ...DEFAULT_SESSION_WORKFLOW_STATE },
      isLotteryResultCurrent: false,
    });
    if (currentSessionTimestamp === null) {
      setIsSessionDataLoading(false);
      return cancel;
    }
    let context: ReturnType<typeof getRequiredSessionContext>;
    try {
      context = getRequiredSessionContext();
    } catch {
      setIsSessionDataLoading(false);
      return cancel;
    }
    setIsSessionDataLoading(true);
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
          return;
        }
      } catch {
        if (isCurrent && isCurrentSessionContext(context)) {
          onAlert(getMsg('AppContainer.sessionLoadFailed'));
        }
      } finally {
        if (isCurrent) setIsSessionDataLoading(false);
      }
    })();
    return cancel;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, currentEventName, currentSessionTimestamp, sessionReloadKey]);

  return { isSharedDataLoading, isSessionDataLoading, requestSessionReload };
}
