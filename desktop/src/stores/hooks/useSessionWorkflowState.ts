import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { UserBean } from '@/common/types/entities';
import {
  DEFAULT_SESSION_WORKFLOW_STATE,
  type SessionWorkflowSnapshot,
  type SessionWorkflowState,
} from '@/common/types/sessionWorkflow';
import { persistSessionWorkflowState } from '@/db/repositories/sessionWorkflowRepository';

export interface UseSessionWorkflowStateOptions {
  setCurrentWinners: Dispatch<SetStateAction<UserBean[]>>;
  setIsLotteryResultCurrent: Dispatch<SetStateAction<boolean>>;
  resetMatching: () => void;
}

export interface SessionWorkflowContextState {
  sessionWorkflow: SessionWorkflowState;
  updateSessionWorkflow: (patch: Partial<SessionWorkflowState>) => Promise<void>;
  hydrateSessionWorkflow: (
    snapshot: Pick<SessionWorkflowSnapshot, 'state' | 'isLotteryResultCurrent'>
  ) => void;
  clearSessionWorkflowState: () => void;
  beginSessionUiMutation: () => number;
  getSessionUiMutationGeneration: () => number;
  isCurrentSessionUiMutation: (generation: number) => boolean;
}

/** セッション条件の楽観更新・永続化・復元と、画面操作世代の照合を管理する。 */
export function useSessionWorkflowState({
  setCurrentWinners,
  setIsLotteryResultCurrent,
  resetMatching,
}: UseSessionWorkflowStateOptions): SessionWorkflowContextState {
  const [sessionWorkflow, setSessionWorkflow] = useState<SessionWorkflowState>(
    () => ({ ...DEFAULT_SESSION_WORKFLOW_STATE }),
  );
  // 画面値と最後の保存成功値を分け、workflow世代と更新順序で古い非同期完了を排除する。
  const sessionWorkflowRef = useRef<SessionWorkflowState>({ ...DEFAULT_SESSION_WORKFLOW_STATE });
  const persistedSessionWorkflowRef = useRef<SessionWorkflowState>({ ...DEFAULT_SESSION_WORKFLOW_STATE });
  const workflowGenerationRef = useRef(0);
  const workflowUpdateSequenceRef = useRef(0);
  // セッション再読込は、開始後に別の画面操作が発生していない場合だけ結果を採用する。
  const sessionUiMutationGenerationRef = useRef(0);

  const beginSessionUiMutation = useCallback((): number => {
    sessionUiMutationGenerationRef.current += 1;
    return sessionUiMutationGenerationRef.current;
  }, []);

  const getSessionUiMutationGeneration = useCallback(
    (): number => sessionUiMutationGenerationRef.current,
    [],
  );

  const isCurrentSessionUiMutation = useCallback(
    (generation: number): boolean => sessionUiMutationGenerationRef.current === generation,
    [],
  );

  /**
   * 画面状態はDB完了前に更新し、同じworkflow世代に属する最新操作だけを失敗時に戻す。
   * Repositoryの書込み順により、保存成功値は操作完了順に更新される。
   */
  const updateSessionWorkflow = (patch: Partial<SessionWorkflowState>): Promise<void> => {
    const current = sessionWorkflowRef.current;
    const changed = (Object.keys(patch) as Array<keyof SessionWorkflowState>)
      .some((key) => current[key] !== patch[key]);
    if (!changed) return Promise.resolve();

    const generation = workflowGenerationRef.current;
    const sequence = workflowUpdateSequenceRef.current + 1;
    workflowUpdateSequenceRef.current = sequence;
    const next = { ...current, ...patch };
    sessionWorkflowRef.current = next;
    setSessionWorkflow(next);

    let operation: Promise<void>;
    try {
      operation = persistSessionWorkflowState(next);
    } catch (error) {
      sessionWorkflowRef.current = persistedSessionWorkflowRef.current;
      setSessionWorkflow(persistedSessionWorkflowRef.current);
      return Promise.reject(error);
    }
    return operation.then(
      () => {
        if (workflowGenerationRef.current !== generation) return;
        persistedSessionWorkflowRef.current = next;
        setIsLotteryResultCurrent(false);
        resetMatching();
      },
      (error) => {
        if (
          workflowGenerationRef.current === generation
          && workflowUpdateSequenceRef.current === sequence
        ) {
          sessionWorkflowRef.current = persistedSessionWorkflowRef.current;
          setSessionWorkflow(persistedSessionWorkflowRef.current);
        }
        throw error;
      },
    );
  };

  // DB再読込時は保存処理の世代を進め、画面値と最後の保存成功値を同じsnapshotへ揃える。
  const hydrateSessionWorkflow: SessionWorkflowContextState['hydrateSessionWorkflow'] = (snapshot) => {
    workflowGenerationRef.current += 1;
    workflowUpdateSequenceRef.current = 0;
    sessionWorkflowRef.current = snapshot.state;
    persistedSessionWorkflowRef.current = snapshot.state;
    setSessionWorkflow(snapshot.state);
    setIsLotteryResultCurrent(snapshot.isLotteryResultCurrent);
  };

  const clearSessionWorkflowState = () => {
    const initial = { ...DEFAULT_SESSION_WORKFLOW_STATE };
    workflowGenerationRef.current += 1;
    workflowUpdateSequenceRef.current = 0;
    sessionWorkflowRef.current = initial;
    persistedSessionWorkflowRef.current = initial;
    setSessionWorkflow(initial);
    setCurrentWinners([]);
    resetMatching();
  };

  return {
    sessionWorkflow,
    updateSessionWorkflow,
    hydrateSessionWorkflow,
    clearSessionWorkflowState,
    beginSessionUiMutation,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
  };
}
