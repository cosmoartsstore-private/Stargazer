// アプリ全体の画面状態、イベント・セッション状態、マッチング結果を共有するContextを提供する。

import React, {
  createContext,
  useContext,
  useEffect,
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
import {
  useMatchingContextState,
  type MatchingResultState,
} from './hooks/useMatchingContextState';
import { useSessionWorkflowState } from './hooks/useSessionWorkflowState';
import { useEventLifecycleState } from './hooks/useEventLifecycleState';

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
  updateMatchingResult: (patch: Partial<MatchingResultState>) => void;
  updateMatchingCastName: (castId: number, name: string) => void;
  resetMatching: () => void;
  beginSessionUiMutation: () => number;
  getSessionUiMutationGeneration: () => number;
  isCurrentSessionUiMutation: (generation: number) => boolean;
  isDbReady: boolean;
  // ──────────────────────────────────────────────────────────────────────────
  // currentEventName はイベント共有DB、currentSessionTimestamp は現在の応募者取込DBを指す。
  // セッション切替UIは公開せず、最新の取込セッションを内部状態として扱う。
  currentEventName: string | null;
  currentSessionTimestamp: string | null;
  ensureWritableSession: () => Promise<void>;
  events: string[];
  setEvents: React.Dispatch<React.SetStateAction<string[]>>;
  switchEvent: (name: string) => Promise<void>;
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
    updateMatchingResult,
    updateMatchingCastName,
    resetMatching,
  } = useMatchingContextState();

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
    currentEventName,
    currentSessionTimestamp,
    ensureWritableSession,
    events,
    setEvents,
    switchEvent,
    deleteManagedEvent,
    renameManagedEvent,
  } = useEventLifecycleState({
    setCasts,
    setApplicants,
    beginSessionUiMutation,
    clearSessionWorkflowState,
  });

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
    updateMatchingResult,
    updateMatchingCastName,
    resetMatching,
    beginSessionUiMutation,
    getSessionUiMutationGeneration,
    isCurrentSessionUiMutation,
    isDbReady,
    currentEventName,
    currentSessionTimestamp,
    ensureWritableSession,
    events,
    setEvents,
    switchEvent,
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
