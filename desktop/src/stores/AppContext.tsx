// アプリ全体の画面状態、イベント・セッション状態、マッチング結果を共有するContextを提供する。

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { CastBean, UserBean } from '@/common/types/entities';
import type { PageType } from '@/layout/appNavigation';
import type {
  SessionWorkflowSnapshot,
  SessionWorkflowState,
} from '@/common/types/sessionWorkflow';
import type { MatchingSettingsState } from '@/features/matching/stores/matching-settings-store';
import type { SavedLotteryResultTarget } from '@/db/repositories/lotteryRepository';
import {
  useMatchingContextState,
  type MatchingResultState,
} from './hooks/useMatchingContextState';
import { useSessionWorkflowState } from './hooks/useSessionWorkflowState';
import { useEventLifecycleState } from './hooks/useEventLifecycleState';
import { getMatchingCastConstraintFingerprint } from '@/features/matching/logics/matching-input-integrity';

export type { PageType } from '@/layout/appNavigation';

export interface AppContextType {
  activePage: PageType;
  setActivePage: (page: PageType) => void;
  casts: CastBean[];
  setCasts: React.Dispatch<React.SetStateAction<CastBean[]>>;
  applicants: UserBean[];
  setApplicants: React.Dispatch<React.SetStateAction<UserBean[]>>;
  currentWinners: UserBean[];
  setCurrentWinners: Dispatch<SetStateAction<UserBean[]>>;
  isLotteryResultCurrent: boolean;
  setIsLotteryResultCurrent: (val: boolean) => void;
  sessionWorkflow: SessionWorkflowState;
  updateSessionWorkflow: (patch: Partial<SessionWorkflowState>) => Promise<void>;
  hydrateSessionWorkflow: (
    snapshot: Pick<SessionWorkflowSnapshot, 'state' | 'isLotteryResultCurrent'>
  ) => void;
  matchingSettings: MatchingSettingsState;
  setMatchingSettings: (state: MatchingSettingsState | ((prev: MatchingSettingsState) => MatchingSettingsState)) => void;
  matchingResultState: MatchingResultState;
  matchingResultCasts: CastBean[] | null;
  updateMatchingResult: (patch: Partial<MatchingResultState>, castSnapshot?: CastBean[]) => void;
  updateMatchingCastName: (castId: number, name: string) => void;
  resetMatching: () => void;
  beginSessionUiMutation: () => number;
  getSessionUiMutationGeneration: () => number;
  isCurrentSessionUiMutation: (generation: number) => boolean;
  isDbReady: boolean;
  initializationError: string | null;
  // ──────────────────────────────────────────────────────────────────────────
  // currentEventName はイベント共有DB、currentSessionTimestamp は現在の応募者取込DBを指す。
  currentEventName: string | null;
  currentSessionTimestamp: string | null;
  sessionReloadGeneration: number;
  /** 保存済み抽選から復元した応募者・抽選入力を読み取り専用で表示している状態。 */
  isLotteryInputReadOnly: boolean;
  /** 現在の作業セッションから抽選またはマッチング結果を既に保存した状態。 */
  hasSavedSessionResult: boolean;
  ensureWritableSession: () => Promise<void>;
  startNewImportSession: (users: UserBean[]) => Promise<void>;
  discardCurrentSession: () => Promise<void>;
  closeCurrentEventForExit: () => Promise<void>;
  discardInProgressWorkAndClose: () => Promise<void>;
  events: string[];
  setEvents: React.Dispatch<React.SetStateAction<string[]>>;
  switchEvent: (name: string) => Promise<void>;
  activateSavedLotteryResult: (target: SavedLotteryResultTarget) => Promise<void>;
  markCurrentSessionResultSaved: () => void;
  deleteManagedEvent: (name: string) => Promise<void>;
  renameManagedEvent: (oldName: string, newName: string) => Promise<void>;
}

// アプリ全体で共有する表示キャッシュと操作契約を公開するContext。
export const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 現在画面と、DBから読み込んだ表示キャッシュ。
  const [activePage, setActivePage] = useState<PageType>('dataManagement');
  const [casts, setCasts] = useState<CastBean[]>([]);
  const [applicants, setApplicants] = useState<UserBean[]>([]);
  const [currentWinners, setCurrentWinnersState] = useState<UserBean[]>([]);
  const [isLotteryResultCurrent, setIsLotteryResultCurrent] = useState(false);

  // 抽選結果が空になった時点で、結果の現行性も同時に失効させる。
  const setCurrentWinners: Dispatch<SetStateAction<UserBean[]>> = (next) => {
    setCurrentWinnersState(next);
    if (typeof next !== 'function' && next.length === 0) {
      setIsLotteryResultCurrent(false);
    }
  };

  const {
    matchingSettings,
    setMatchingSettings,
    matchingResultState,
    updateMatchingResult: updateMatchingResultState,
    updateMatchingCastName: updateMatchingCastNameState,
    resetMatching: resetMatchingState,
  } = useMatchingContextState();
  const [matchingResultCasts, setMatchingResultCasts] = useState<CastBean[] | null>(null);
  const updateMatchingResult = useCallback((
    patch: Partial<MatchingResultState>,
    castSnapshot?: CastBean[],
  ) => {
    if ('result' in patch) {
      setMatchingResultCasts(patch.result === null ? null : (castSnapshot ?? casts));
    }
    updateMatchingResultState(patch);
  }, [casts, updateMatchingResultState]);
  const resetMatching = useCallback(() => {
    setMatchingResultCasts(null);
    resetMatchingState();
  }, [resetMatchingState]);
  const matchingCastConstraintFingerprint = getMatchingCastConstraintFingerprint(casts);
  const previousMatchingCastConstraintRef = useRef<string | null>(null);

  const {
    sessionWorkflow,
    updateSessionWorkflow,
    hydrateSessionWorkflow,
    clearSessionWorkflowState,
    beginSessionUiMutation,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
  } = useSessionWorkflowState({
    setCurrentWinners,
    setIsLotteryResultCurrent,
    resetMatching,
  });

  useEffect(() => {
    if (currentWinners.length === 0) setIsLotteryResultCurrent(false);
  }, [currentWinners]);

  const {
    isDbReady,
    initializationError,
    currentEventName,
    currentSessionTimestamp,
    sessionReloadGeneration,
    isLotteryInputReadOnly,
    hasSavedSessionResult,
    ensureWritableSession,
    startNewImportSession,
    discardCurrentSession,
    closeCurrentEventForExit,
    discardInProgressWorkAndClose,
    events,
    setEvents,
    switchEvent,
    activateSavedLotteryResult,
    markCurrentSessionResultSaved: markCurrentSessionResultSavedState,
    deleteManagedEvent,
    renameManagedEvent,
  } = useEventLifecycleState({
    setCasts,
    setApplicants,
    beginSessionUiMutation,
    clearSessionWorkflowState,
    resetMatching,
  });
  const savedResultReadOnlyRef = useRef(false);
  savedResultReadOnlyRef.current = hasSavedSessionResult || matchingResultState.isSaved;

  useEffect(() => {
    const previous = previousMatchingCastConstraintRef.current;
    previousMatchingCastConstraintRef.current = matchingCastConstraintFingerprint;
    if (
      !savedResultReadOnlyRef.current
      && previous !== null
      && previous !== matchingCastConstraintFingerprint
      && matchingResultState.result !== null
    ) {
      resetMatching();
    }
  }, [
    hasSavedSessionResult,
    matchingCastConstraintFingerprint,
    matchingResultState.isSaved,
    matchingResultState.result,
    resetMatching,
  ]);

  const updateMatchingCastName = useCallback((castId: number, name: string) => {
    if (savedResultReadOnlyRef.current) return;
    setMatchingResultCasts((current) => current?.map((cast) => (
      cast.id === castId ? { ...cast, name } : cast
    )) ?? null);
    updateMatchingCastNameState(castId, name);
  }, [updateMatchingCastNameState]);

  const markCurrentSessionResultSaved = useCallback(() => {
    savedResultReadOnlyRef.current = true;
    markCurrentSessionResultSavedState();
  }, [markCurrentSessionResultSavedState]);

  // 画面へ公開するアプリ全体の状態契約。
  const contextValue: AppContextType = {
    activePage,
    setActivePage,
    casts,
    setCasts,
    applicants,
    setApplicants,
    currentWinners,
    setCurrentWinners,
    isLotteryResultCurrent,
    setIsLotteryResultCurrent,
    sessionWorkflow,
    updateSessionWorkflow,
    hydrateSessionWorkflow,
    matchingSettings,
    setMatchingSettings,
    matchingResultState,
    matchingResultCasts,
    updateMatchingResult,
    updateMatchingCastName,
    resetMatching,
    beginSessionUiMutation,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
    isDbReady,
    initializationError,
    currentEventName,
    currentSessionTimestamp,
    sessionReloadGeneration,
    isLotteryInputReadOnly,
    hasSavedSessionResult,
    ensureWritableSession,
    startNewImportSession,
    discardCurrentSession,
    closeCurrentEventForExit,
    discardInProgressWorkAndClose,
    events,
    setEvents,
    switchEvent,
    activateSavedLotteryResult,
    markCurrentSessionResultSaved,
    deleteManagedEvent,
    renameManagedEvent,
  };

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
