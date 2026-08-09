import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CastBean, UserBean } from '@/common/types/entities';
import {
  clearSavedLocation,
  initializeApp,
  saveLastLocation,
} from '@/db/initializer';
import {
  closeEvent,
  closeSession,
  getCurrentEventName,
  getCurrentSessionTimestamp,
  openEvent,
  openSession,
} from '@/db/database';
import { runWithEventLifecycleLock } from '@/db/repositories/commandContext';
import {
  createImportSession,
  deleteEvent as deleteEventStorage,
  discardSession,
  renameEvent as renameEventStorage,
} from '@/db/repositories/eventRepository';
import {
  createSessionFromSavedLotteryForLifecycle,
  type SavedLotteryResultTarget,
} from '@/db/repositories/lotteryRepository';
import { getMsg } from '@/messages/getMsg';

type SessionAccessState = 'none' | 'writable' | 'savedLotteryInput';

export interface UseEventLifecycleStateOptions {
  setCasts: Dispatch<SetStateAction<CastBean[]>>;
  setApplicants: Dispatch<SetStateAction<UserBean[]>>;
  beginSessionUiMutation: () => number;
  clearSessionWorkflowState: () => void;
  resetMatching: () => void;
}

export interface EventLifecycleContextState {
  isDbReady: boolean;
  initializationError: string | null;
  currentEventName: string | null;
  currentSessionTimestamp: string | null;
  sessionReloadGeneration: number;
  /** 保存済み抽選から復元した入力を表示しており、抽選条件と応募者を変更できない状態。 */
  isLotteryInputReadOnly: boolean;
  /** 現在の作業セッションから、抽選またはマッチング結果を既に1回保存した状態。 */
  hasSavedSessionResult: boolean;
  ensureWritableSession: () => Promise<void>;
  startNewImportSession: (users: UserBean[]) => Promise<void>;
  discardCurrentSession: () => Promise<void>;
  closeCurrentEventForExit: () => Promise<void>;
  discardInProgressWorkAndClose: () => Promise<void>;
  events: string[];
  setEvents: Dispatch<SetStateAction<string[]>>;
  switchEvent: (name: string) => Promise<void>;
  activateSavedLotteryResult: (target: SavedLotteryResultTarget) => Promise<void>;
  markCurrentSessionResultSaved: () => void;
  deleteManagedEvent: (name: string) => Promise<void>;
  renameManagedEvent: (oldName: string, newName: string) => Promise<void>;
}

/** イベント共有DBと、1件だけ存在できる一時作業セッションのライフサイクルを管理する。 */
export function useEventLifecycleState({
  setCasts,
  setApplicants,
  beginSessionUiMutation,
  clearSessionWorkflowState,
  resetMatching,
}: UseEventLifecycleStateOptions): EventLifecycleContextState {
  const [isDbReady, setIsDbReady] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [currentEventName, setCurrentEventName] = useState<string | null>(null);
  const [currentSessionTimestamp, setCurrentSessionTimestamp] = useState<string | null>(null);
  const [sessionReloadGeneration, setSessionReloadGeneration] = useState(0);
  const [sessionAccessState, setSessionAccessState] = useState<SessionAccessState>('none');
  const [hasSavedSessionResult, setHasSavedSessionResult] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const initializationStartedRef = useRef(false);
  const sessionAccessStateRef = useRef<SessionAccessState>('none');
  const hasSavedSessionResultRef = useRef(false);
  const isLotteryInputReadOnly = sessionAccessState === 'savedLotteryInput';

  const updateSessionAccessState = (next: SessionAccessState) => {
    sessionAccessStateRef.current = next;
    setSessionAccessState(next);
  };

  const updateHasSavedSessionResult = (next: boolean) => {
    hasSavedSessionResultRef.current = next;
    setHasSavedSessionResult(next);
  };

  const clearCurrentSessionState = () => {
    beginSessionUiMutation();
    setCurrentSessionTimestamp(null);
    setApplicants([]);
    clearSessionWorkflowState();
    resetMatching();
    updateSessionAccessState('none');
    updateHasSavedSessionResult(false);
  };

  const clearOpenEventState = () => {
    setCurrentEventName(null);
    setCasts([]);
    clearCurrentSessionState();
    clearSavedLocation();
  };

  const applyEventOnlyState = (name: string) => {
    setCurrentEventName(name);
    setCasts([]);
    clearCurrentSessionState();
    saveLastLocation(name);
  };

  const restoreEventConnection = async (
    eventName: string,
    timestamp: string | null,
  ): Promise<void> => {
    await closeEvent();
    await openEvent(eventName);
    if (timestamp !== null) await openSession(timestamp);
  };

  /** 接続を先に閉じ、Windowsでも対象ディレクトリを安全に隔離できる順序で破棄する。 */
  const discardOpenSession = async (eventName: string, timestamp: string): Promise<void> => {
    await closeSession();
    try {
      await discardSession(eventName, timestamp);
    } catch (error) {
      try {
        await openSession(timestamp);
      } catch {
        clearCurrentSessionState();
      }
      throw error;
    }
  };

  const ensureWritableSession = async (): Promise<void> => {
    if (getCurrentEventName() === null) {
      throw new Error(getMsg('AppContext.eventRequired'));
    }
    if (getCurrentSessionTimestamp() === null) {
      throw new Error(getMsg('AppContext.sessionRequired'));
    }
    if (sessionAccessStateRef.current !== 'writable') {
      throw new Error(getMsg('AppContext.lotteryInputReadOnly'));
    }
    if (hasSavedSessionResultRef.current) {
      throw new Error(getMsg('AppContext.sessionResultAlreadySaved'));
    }
  };

  /** 応募管理で選択した新規取込だけが、応募者を保存済みの新しい作業セッションを作成する。 */
  const startNewImportSession = async (users: UserBean[]): Promise<void> => {
    const eventName = getCurrentEventName();
    if (eventName === null) {
      throw new Error(getMsg('AppContext.eventRequired'));
    }

    await runWithEventLifecycleLock([eventName], async () => {
      if (getCurrentEventName() !== eventName) {
        throw new Error(getMsg('commandContext.eventSwitchInProgress', { eventName }));
      }
      if (getCurrentSessionTimestamp() !== null) {
        throw new Error(getMsg('AppContext.sessionAlreadyOpen'));
      }

      const timestamp = await createImportSession(eventName, users);
      try {
        await openSession(timestamp);
      } catch (error) {
        await discardSession(eventName, timestamp).catch(() => undefined);
        throw error;
      }

      clearCurrentSessionState();
      setCurrentSessionTimestamp(timestamp);
      setApplicants(users);
      updateSessionAccessState('writable');
      setSessionReloadGeneration((generation) => generation + 1);
      saveLastLocation(eventName);
    });
  };

  /** 現在開いている作業セッションだけを破棄し、イベント共有DBは開いたままにする。 */
  const discardCurrentSession = async (): Promise<void> => {
    const eventName = getCurrentEventName();
    const timestamp = getCurrentSessionTimestamp();
    if (eventName === null || timestamp === null) {
      clearCurrentSessionState();
      return;
    }

    await runWithEventLifecycleLock([eventName], async () => {
      if (
        getCurrentEventName() !== eventName
        || getCurrentSessionTimestamp() !== timestamp
      ) {
        throw new Error(getMsg('commandContext.eventSwitchInProgress', { eventName }));
      }
      await discardOpenSession(eventName, timestamp);
      clearCurrentSessionState();
      saveLastLocation(eventName);
    });
  };

  /** 作業セッションがない通常終了で、先行書込みを待ってイベント接続を閉じる。 */
  const closeCurrentEventForExit = async (): Promise<void> => {
    const eventName = getCurrentEventName();
    if (eventName === null) return;
    await runWithEventLifecycleLock([eventName], async () => {
      if (getCurrentSessionTimestamp() !== null) {
        throw new Error(getMsg('AppContext.sessionStillOpen'));
      }
      await closeEvent();
    });
    setCurrentEventName(null);
    setCasts([]);
    clearCurrentSessionState();
    saveLastLocation(eventName);
  };

  /** 終了確認後に作業セッションを破棄し、イベント共有DBも閉じる。 */
  const discardInProgressWorkAndClose = async (): Promise<void> => {
    const eventName = getCurrentEventName();
    if (eventName === null) return;
    await runWithEventLifecycleLock([eventName], async () => {
      const timestamp = getCurrentSessionTimestamp();
      if (timestamp !== null) await discardOpenSession(eventName, timestamp);
      await closeEvent();
    });
    setCurrentEventName(null);
    setCasts([]);
    clearCurrentSessionState();
    saveLastLocation(eventName);
  };

  /** イベント切替では旧作業セッションを破棄し、切替先はセッションなしで開く。 */
  const switchEvent = async (name: string) => {
    const previouslyOpenEvent = getCurrentEventName();
    if (previouslyOpenEvent === name) return;
    const previousSession = getCurrentSessionTimestamp();
    await runWithEventLifecycleLock(
      previouslyOpenEvent === null ? [name] : [previouslyOpenEvent, name],
      async () => {
        try {
          // 切替先の接続確立後に旧セッションを破棄し、接続失敗時は作業状態を維持する。
          await openEvent(name);
          if (previouslyOpenEvent !== null && previousSession !== null) {
            await discardSession(previouslyOpenEvent, previousSession);
          }
          applyEventOnlyState(name);
        } catch (error) {
          if (previouslyOpenEvent === null) {
            await closeEvent().catch(() => undefined);
            clearOpenEventState();
          } else if (
            getCurrentEventName() === previouslyOpenEvent
            && getCurrentSessionTimestamp() === previousSession
          ) {
            // 切替先を開けなかった場合は、接続も画面状態も変更されていない。
          } else {
            try {
              await restoreEventConnection(previouslyOpenEvent, previousSession);
            } catch {
              clearOpenEventState();
            }
          }
          throw error;
        }
      },
    );
  };

  /** 保存済み抽選の自己完結スナップショットから、マッチング用の一時セッションを作成する。 */
  const activateSavedLotteryResult = async (target: SavedLotteryResultTarget): Promise<void> => {
    const eventName = getCurrentEventName();
    if (eventName === null) {
      throw new Error(getMsg('AppContext.eventRequired'));
    }

    await runWithEventLifecycleLock([eventName], async () => {
      if (getCurrentEventName() !== eventName) {
        throw new Error(getMsg('commandContext.eventSwitchInProgress', { eventName }));
      }
      if (getCurrentSessionTimestamp() !== null) {
        throw new Error(getMsg('AppContext.sessionAlreadyOpen'));
      }

      const timestamp = await createSessionFromSavedLotteryForLifecycle(eventName, target);
      try {
        await openSession(timestamp);
      } catch (error) {
        await discardSession(eventName, timestamp).catch(() => undefined);
        throw error;
      }

      clearCurrentSessionState();
      setCurrentSessionTimestamp(timestamp);
      updateSessionAccessState('savedLotteryInput');
      updateHasSavedSessionResult(false);
      setSessionReloadGeneration((generation) => generation + 1);
      saveLastLocation(eventName);
    });
  };

  /** 1セッション1保存を画面操作へ即時反映する。DB保存成功後にだけ呼び出す。 */
  const markCurrentSessionResultSaved = () => {
    if (getCurrentSessionTimestamp() === null) {
      throw new Error(getMsg('database.sessionNotOpen'));
    }
    if (hasSavedSessionResultRef.current) {
      throw new Error(getMsg('AppContext.sessionResultAlreadySaved'));
    }
    updateHasSavedSessionResult(true);
  };

  const deleteManagedEvent = async (name: string): Promise<void> => {
    await runWithEventLifecycleLock([name], () => deleteEventStorage(name));
  };

  /** 現在イベントの改名では同じ作業セッションを開き直し、画面状態を保持する。 */
  const renameManagedEvent = async (oldName: string, newName: string): Promise<void> => {
    const isOpen = getCurrentEventName() === oldName;
    const previousSession = isOpen ? getCurrentSessionTimestamp() : null;
    await runWithEventLifecycleLock([oldName, newName], async () => {
      if (!isOpen) {
        await renameEventStorage(oldName, newName);
        return;
      }

      let renamed = false;
      try {
        await closeEvent();
        await renameEventStorage(oldName, newName);
        renamed = true;
        await openEvent(newName);
        if (previousSession !== null) await openSession(previousSession);
        beginSessionUiMutation();
        setCurrentEventName(newName);
        setSessionReloadGeneration((generation) => generation + 1);
        saveLastLocation(newName);
      } catch (error) {
        try {
          await closeEvent();
          if (renamed) await renameEventStorage(newName, oldName);
          await openEvent(oldName);
          if (previousSession !== null) await openSession(previousSession);
          beginSessionUiMutation();
          setSessionReloadGeneration((generation) => generation + 1);
          saveLastLocation(oldName);
        } catch {
          clearOpenEventState();
        }
        throw error;
      }
    });
  };

  // StrictModeでeffectが再実行されても、DB初期化と最終イベントの復元は一度だけ開始する。
  useEffect(() => {
    if (initializationStartedRef.current) return;
    initializationStartedRef.current = true;
    setInitializationError(null);
    initializeApp()
      .then(async ({ events: eventNames, lastUsedEvent, startupSessionCleanupError }) => {
        setEvents(eventNames);
        if (startupSessionCleanupError !== null) {
          setInitializationError(startupSessionCleanupError);
        }
        if (lastUsedEvent) {
          try {
            await switchEvent(lastUsedEvent);
          } catch {
            clearOpenEventState();
            setInitializationError(getMsg('AppContext.lastEventRestoreFailed'));
          }
        }
        setIsDbReady(true);
      })
      .catch(() => {
        setInitializationError(getMsg('AppContext.initializationFailed'));
        setIsDbReady(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
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
}
