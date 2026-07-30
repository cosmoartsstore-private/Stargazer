import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CastBean, UserBean } from '@/common/types/entities';
import {
  clearSavedLocation,
  initializeApp,
  saveLastLocation,
} from '@/db/initializer';
import {
  closeEvent,
  getCurrentEventName,
  getCurrentSessionTimestamp,
  openEvent,
  openSession,
} from '@/db/database';
import { runWithEventLifecycleLock } from '@/db/repositories/commandContext';
import {
  createSession,
  deleteEvent as deleteEventStorage,
  listSessions,
  renameEvent as renameEventStorage,
} from '@/db/repositories/eventRepository';
import {
  activateSavedLotteryRunForLifecycle,
  hasSavedLotteryRuns,
  type SavedLotteryRunTarget,
} from '@/db/repositories/lotteryRepository';
import { getMsg } from '@/messages/getMsg';

export interface UseEventLifecycleStateOptions {
  setCasts: Dispatch<SetStateAction<CastBean[]>>;
  setApplicants: Dispatch<SetStateAction<UserBean[]>>;
  beginSessionUiMutation: () => number;
  clearSessionWorkflowState: () => void;
}

export interface EventLifecycleContextState {
  isDbReady: boolean;
  currentEventName: string | null;
  currentSessionTimestamp: string | null;
  sessionReloadGeneration: number;
  focusedSavedLotteryRunTarget: SavedLotteryRunTarget | null;
  clearFocusedSavedLotteryRunTarget: () => void;
  isSavedLotterySessionReadOnly: boolean;
  ensureWritableSession: () => Promise<void>;
  events: string[];
  setEvents: Dispatch<SetStateAction<string[]>>;
  switchEvent: (name: string, preferredSession?: string | null) => Promise<void>;
  activateSavedLotteryRun: (target: SavedLotteryRunTarget) => Promise<void>;
  markCurrentSessionReadOnlyAfterLotterySave: () => void;
  deleteManagedEvent: (name: string) => Promise<void>;
  renameManagedEvent: (oldName: string, newName: string) => Promise<void>;
}

/** イベント・セッション接続の初期化、切替、作成、削除、改名と失敗時の接続復元を管理する。 */
export function useEventLifecycleState({
  setCasts,
  setApplicants,
  beginSessionUiMutation,
  clearSessionWorkflowState,
}: UseEventLifecycleStateOptions): EventLifecycleContextState {
  const [isDbReady, setIsDbReady] = useState(false);
  const [currentEventName, setCurrentEventName] = useState<string | null>(null);
  const [currentSessionTimestamp, setCurrentSessionTimestamp] = useState<string | null>(null);
  const [sessionReloadGeneration, setSessionReloadGeneration] = useState(0);
  const [focusedSavedLotteryRunTarget, setFocusedSavedLotteryRunTarget] = useState<SavedLotteryRunTarget | null>(null);
  const [isSavedLotterySessionReadOnly, setIsSavedLotterySessionReadOnly] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const initializationStartedRef = useRef(false);
  const clearFocusedSavedLotteryRunTarget = () => setFocusedSavedLotteryRunTarget(null);

  const clearCurrentSessionState = () => {
    beginSessionUiMutation();
    setCurrentSessionTimestamp(null);
    setApplicants([]);
    clearSessionWorkflowState();
    setFocusedSavedLotteryRunTarget(null);
    setIsSavedLotterySessionReadOnly(false);
  };

  const ensureWritableSession = async (): Promise<void> => {
    if (currentEventName === null) {
      throw new Error(getMsg('AppContext.eventRequired'));
    }
    const eventName = currentEventName;

    await runWithEventLifecycleLock([eventName], async () => {
      if (getCurrentEventName() !== eventName) {
        throw new Error(getMsg('AppContext.eventRequired'));
      }
      const openTimestamp = getCurrentSessionTimestamp();
      if (openTimestamp !== null) {
        // 保存済み抽選を持つセッションは履歴として維持し、新しい取込先を作成する。
        if (!await hasSavedLotteryRuns()) {
          setIsSavedLotterySessionReadOnly(false);
          setCurrentSessionTimestamp(openTimestamp);
          return;
        }
      }
      const timestamp = await createSession(eventName);
      await openSession(timestamp);
      beginSessionUiMutation();
      setApplicants([]);
      clearSessionWorkflowState();
      setFocusedSavedLotteryRunTarget(null);
      setIsSavedLotterySessionReadOnly(false);
      setCurrentSessionTimestamp(timestamp);
      saveLastLocation(eventName, timestamp);
    });
  };

  const clearOpenEventState = () => {
    setCurrentEventName(null);
    setCasts([]);
    clearCurrentSessionState();
    clearSavedLocation();
  };

  const openEventState = async (name: string, preferredSession?: string | null) => {
    await openEvent(name);
    const list = await listSessions(name);
    const sessionToOpen = preferredSession && list.includes(preferredSession)
      ? preferredSession
      : (list[0] ?? null);
    let sessionIsReadOnly = false;
    if (sessionToOpen !== null) {
      await openSession(sessionToOpen);
      sessionIsReadOnly = await hasSavedLotteryRuns();
    }

    // 接続とセッション確認が完了するまで、旧イベントの表示状態を維持する。
    setCurrentEventName(name);
    setCasts([]);
    clearCurrentSessionState();
    if (sessionToOpen !== null) {
      setCurrentSessionTimestamp(sessionToOpen);
      setIsSavedLotterySessionReadOnly(sessionIsReadOnly);
    }
    saveLastLocation(name, sessionToOpen);
  };

  const restoreEventConnection = async (
    eventName: string,
    sessionTimestamp: string | null,
  ): Promise<void> => {
    await closeEvent();
    await openEvent(eventName);
    if (sessionTimestamp !== null) await openSession(sessionTimestamp);
    saveLastLocation(eventName, sessionTimestamp);
  };

  const switchEvent = async (name: string, preferredSession?: string | null) => {
    const previouslyOpenEvent = getCurrentEventName();
    const previousSession = getCurrentSessionTimestamp();
    await runWithEventLifecycleLock(
      previouslyOpenEvent === null ? [name] : [previouslyOpenEvent, name],
      async () => {
        try {
          await openEventState(name, preferredSession);
        } catch (error) {
          if (previouslyOpenEvent === null) {
            try {
              await closeEvent();
            } catch {
              // 接続を閉じられない場合も、失敗前の画面状態は破棄する。
            }
            clearOpenEventState();
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

  /** 保存済み抽選結果の所有セッションへ切り替え、復元完了後だけ画面状態を再読込させる。 */
  const activateSavedLotteryRun = async (target: SavedLotteryRunTarget): Promise<void> => {
    const eventName = getCurrentEventName();
    if (eventName === null) {
      throw new Error(getMsg('AppContext.eventRequired'));
    }

    await runWithEventLifecycleLock([eventName], async () => {
      if (getCurrentEventName() !== eventName) {
        throw new Error('表示中のイベントが切り替わったため、保存済み抽選結果を開けませんでした。');
      }
      const previousSession = getCurrentSessionTimestamp();
      const sessions = await listSessions(eventName);
      if (!sessions.includes(target.sessionTimestamp)) {
        throw new Error('選択した抽選結果の取り込みデータが見つかりません。');
      }
      if (!Number.isInteger(target.runId) || target.runId <= 0) {
        throw new Error('選択した抽選結果を特定できません。');
      }

      // 接続とDB復元が確定するまで、画面上は切替前のセッションを維持する。
      beginSessionUiMutation();
      try {
        if (target.sessionTimestamp !== previousSession) {
          await openSession(target.sessionTimestamp);
        }
        await activateSavedLotteryRunForLifecycle(eventName, target);
      } catch (error) {
        if (target.sessionTimestamp !== previousSession) {
          try {
            await restoreEventConnection(eventName, previousSession);
          } catch {
            clearOpenEventState();
          }
        }
        throw error;
      }

      // 同じセッション内の別結果でも、reload世代を進めてDBを正として再読込する。
      clearCurrentSessionState();
      setCurrentSessionTimestamp(target.sessionTimestamp);
      setFocusedSavedLotteryRunTarget(target);
      setIsSavedLotterySessionReadOnly(true);
      setSessionReloadGeneration((generation) => generation + 1);
      saveLastLocation(eventName, target.sessionTimestamp);
    });
  };

  /** 保存成功済みの現行セッションを、追加のDB復元を行わず履歴表示へ切り替える。 */
  const markCurrentSessionReadOnlyAfterLotterySave = () => {
    if (getCurrentSessionTimestamp() === null) {
      throw new Error(getMsg('database.sessionNotOpen'));
    }
    setIsSavedLotterySessionReadOnly(true);
  };

  const deleteManagedEvent = async (name: string): Promise<void> => {
    await runWithEventLifecycleLock([name], () => deleteEventStorage(name));
  };

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
        await openEventState(newName, previousSession);
      } catch (error) {
        try {
          await closeEvent();
          if (renamed) await renameEventStorage(newName, oldName);
          // 元のイベント名とセッションは変わらないため、表示キャッシュを消さず接続だけ戻す。
          await openEvent(oldName);
          if (previousSession !== null) await openSession(previousSession);
          saveLastLocation(oldName, previousSession);
        } catch {
          // 接続が閉じたままなら、画面だけが旧イベントを参照する状態を残さない。
          clearOpenEventState();
        }
        throw error;
      }
    });
  };

  // StrictModeでeffectが再実行されても、DB初期化と最終接続先の復元は一度だけ開始する。
  useEffect(() => {
    if (initializationStartedRef.current) return;
    initializationStartedRef.current = true;
    initializeApp()
      .then(async ({
        events: eventNames,
        lastUsedEvent,
        lastUsedSession,
      }) => {
        setEvents(eventNames);
        if (lastUsedEvent) {
          try {
            await switchEvent(lastUsedEvent, lastUsedSession);
          } catch {
            clearOpenEventState();
          }
        }
        setIsDbReady(true);
      })
      .catch(() => {
        setIsDbReady(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isDbReady,
    currentEventName,
    currentSessionTimestamp,
    sessionReloadGeneration,
    focusedSavedLotteryRunTarget,
    clearFocusedSavedLotteryRunTarget,
    isSavedLotterySessionReadOnly,
    ensureWritableSession,
    events,
    setEvents,
    switchEvent,
    activateSavedLotteryRun,
    markCurrentSessionReadOnlyAfterLotterySave,
    deleteManagedEvent,
    renameManagedEvent,
  };
}
