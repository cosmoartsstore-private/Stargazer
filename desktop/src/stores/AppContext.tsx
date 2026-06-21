import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserBean, CastBean } from '@/common/types/entities';
import type { ThemeId } from '@/common/themes';
import type { ThemeCustomizationState } from '@/common/themeCustomization';
import {
  getInitialMatchingSettings,
  normalizeMatchingSettingsState,
  persistMatchingSettings,
  type MatchingSettingsState,
} from '@/features/matching/stores/matching-settings-store';
import type { MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
import { DEFAULT_ROTATION_COUNT } from '@/common/copy';
import type { MatchedCast, TableSlot } from '@/features/matching/logics/matching-io';
import {
  getInitialSession,
  getInitialThemeCustomization,
  getInitialThemeId,
  persistSession,
  persistTheme,
  persistThemeCustomization,
  removeStoredSession,
  type PersistedSession,
} from '@/stores/app-storage-store';
import {
  initializeApp,
  saveLastUsedEvent,
  saveLastUsedSession,
  clearLastUsedSession,
} from '@/db/initializer';
import {
  openEvent,
  closeEvent,
  openSession,
  closeSession,
} from '@/db/database';
import { listSessions, type SessionInfo } from '@/db/repositories/eventRepository';
export type { UserBean, CastBean } from '@/common/types/entities';
export type { PersistedSession } from '@/stores/app-storage-store';

export type PageType = 'guide' | 'dataManagement' | 'internalManagement' | 'eventManagement' | 'import' | 'cast' | 'ngManagement' | 'lottery' | 'matching' | 'attendance' | 'tweet';
export type { MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
export type { ThemeId } from '@/common/themes';

interface AppContextType {
  activePage: PageType;
  setActivePage: (page: PageType) => void;
  casts: CastBean[];
  setCasts: React.Dispatch<React.SetStateAction<CastBean[]>>;
  applicants: UserBean[];
  setApplicants: (users: UserBean[]) => void;
  currentWinners: UserBean[];
  setCurrentWinners: (winners: UserBean[]) => void;
  isLotteryResultCurrent: boolean;
  setIsLotteryResultCurrent: (val: boolean) => void;
  guaranteedWinners: UserBean[];
  setGuaranteedWinners: (winners: UserBean[]) => void;
  matchingTypeCode: MatchingTypeCode;
  setMatchingTypeCode: (code: MatchingTypeCode) => void;
  rotationCount: number;
  setRotationCount: (n: number) => void;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  themeCustomization: ThemeCustomizationState;
  setThemeCustomization: (customization: ThemeCustomizationState | ((prev: ThemeCustomizationState) => ThemeCustomizationState)) => void;
  totalTables: number;
  setTotalTables: (n: number) => void;
  usersPerTable: number;
  setUsersPerTable: (n: number) => void;
  castsPerRotation: number;
  setCastsPerRotation: (n: number) => void;
  matchingSettings: MatchingSettingsState;
  setMatchingSettings: (state: MatchingSettingsState | ((prev: MatchingSettingsState) => MatchingSettingsState)) => void;
  globalMatchingResult: Map<string, MatchedCast[]> | null;
  setGlobalMatchingResult: (res: Map<string, MatchedCast[]> | null) => void;
  globalTableSlots: TableSlot[] | undefined;
  setGlobalTableSlots: (slots: TableSlot[] | undefined) => void;
  globalMatchingError: string | null;
  setGlobalMatchingError: (err: string | null) => void;
  allowM003EmptySeats: boolean;
  setAllowM003EmptySeats: (val: boolean) => void;
  m003SameDaySlotCount: number;
  setM003SameDaySlotCount: (n: number) => void;
  isMatchingLocked: boolean;
  setIsMatchingLocked: (val: boolean) => void;
  resetMatching: () => void;
  isDbReady: boolean;
  // ──────────────────────────────────────────────────────────────────────────
  // currentEventName drives the event-shared DB. currentSessionTimestamp is an
  // internal handle for the latest applicant import; the UI does not expose a
  // session switcher.
  currentEventName: string | null;
  setCurrentEventName: (name: string | null) => void;
  currentSessionTimestamp: string | null;
  setCurrentSessionTimestamp: (ts: string | null) => void;
  events: string[];
  setEvents: React.Dispatch<React.SetStateAction<string[]>>;
  sessions: SessionInfo[];
  setSessions: React.Dispatch<React.SetStateAction<SessionInfo[]>>;
  switchEvent: (name: string) => Promise<void>;
  switchSession: (timestamp: string) => Promise<void>;
  dataReloadCounter: number;
  bumpDataReload: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const initialSession = useState(() => getInitialSession())[0];
  const [activePage, setActivePage] = useState<PageType>('dataManagement');
  const [casts, setCasts] = useState<CastBean[]>([]);
  const [applicantsState, setApplicantsState] = useState<UserBean[]>([]);
  const [currentWinners, setCurrentWinnersState] = useState<UserBean[]>(initialSession?.winners ?? []);
  const [isLotteryResultCurrent, setIsLotteryResultCurrent] = useState<boolean>(
    initialSession?.isLotteryResultCurrent ?? ((initialSession?.winners.length ?? 0) > 0),
  );
  const [guaranteedWinners, setGuaranteedWinners] = useState<UserBean[]>([]);
  const [matchingTypeCode, setMatchingTypeCode] = useState<MatchingTypeCode>(initialSession?.matchingTypeCode ?? 'M001');
  const [rotationCount, setRotationCount] = useState<number>(initialSession?.rotationCount ?? DEFAULT_ROTATION_COUNT);
  const [themeId, setThemeId] = useState<ThemeId>(() => getInitialThemeId());
  const [themeCustomization, setThemeCustomizationState] = useState<ThemeCustomizationState>(() => getInitialThemeCustomization());
  const [totalTables, setTotalTables] = useState<number>(initialSession?.totalTables ?? 15);
  const [usersPerTable, setUsersPerTable] = useState<number>(initialSession?.usersPerTable ?? 1);
  const [castsPerRotation, setCastsPerRotation] = useState<number>(initialSession?.castsPerRotation ?? 1);
  const [matchingSettings, setMatchingSettingsState] = useState<MatchingSettingsState>(() => getInitialMatchingSettings());
  const [allowM003EmptySeats, setAllowM003EmptySeats] = useState<boolean>(initialSession?.allowM003EmptySeats ?? false);
  const [m003SameDaySlotCount, setM003SameDaySlotCount] = useState<number>(initialSession?.m003SameDaySlotCount ?? 0);
  const [isMatchingLocked, setIsMatchingLocked] = useState<boolean>(false);

  const [globalMatchingResult, setGlobalMatchingResult] = useState<Map<string, MatchedCast[]> | null>(null);
  const [globalTableSlots, setGlobalTableSlots] = useState<TableSlot[] | undefined>(undefined);
  const [globalMatchingError, setGlobalMatchingError] = useState<string | null>(null);

  const [isDbReady, setIsDbReady] = useState<boolean>(false);
  const [currentEventName, setCurrentEventName] = useState<string | null>(null);
  const [currentSessionTimestamp, setCurrentSessionTimestamp] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [dataReloadCounter, setDataReloadCounter] = useState<number>(0);
  const bumpDataReload = () => setDataReloadCounter((n) => n + 1);

  const setApplicants = (users: UserBean[]) => {
    setApplicantsState(users);
  };

  const setCurrentWinners = (winners: UserBean[]) => {
    setCurrentWinnersState(winners);
    if (winners.length === 0) {
      setIsLotteryResultCurrent(false);
    }
  };

  const resetMatching = () => {
    setIsMatchingLocked(false);
    setGlobalMatchingResult(null);
    setGlobalTableSlots(undefined);
    setGlobalMatchingError(null);
  };

  const setMatchingSettings = (stateOrUpdater: MatchingSettingsState | ((prev: MatchingSettingsState) => MatchingSettingsState)) => {
    setMatchingSettingsState((prev) => {
      const rawNext = typeof stateOrUpdater === 'function' ? stateOrUpdater(prev) : stateOrUpdater;
      const next = normalizeMatchingSettingsState(rawNext);
      persistMatchingSettings(next);
      return next;
    });
  };

  const setThemeCustomization = (stateOrUpdater: ThemeCustomizationState | ((prev: ThemeCustomizationState) => ThemeCustomizationState)) => {
    setThemeCustomizationState((prev) => {
      const next = typeof stateOrUpdater === 'function' ? stateOrUpdater(prev) : stateOrUpdater;
      persistThemeCustomization(next);
      return next;
    });
  };

  useEffect(() => {
    const session: PersistedSession = {
      winners: currentWinners,
      isLotteryResultCurrent,
      matchingTypeCode,
      rotationCount,
      totalTables,
      usersPerTable,
      castsPerRotation,
      allowM003EmptySeats,
      m003SameDaySlotCount,
    };
    persistSession(session);
  }, [currentWinners, isLotteryResultCurrent, matchingTypeCode, rotationCount, totalTables, usersPerTable, castsPerRotation, allowM003EmptySeats, m003SameDaySlotCount]);

  useEffect(() => {
    persistTheme(themeId);
  }, [themeId]);

  const switchEvent = async (name: string) => {
    await closeSession();
    await closeEvent();
    await openEvent(name);
    saveLastUsedEvent(name);
    setCurrentEventName(name);
    setCurrentSessionTimestamp(null);
    setSessions([]);
    setApplicantsState([]);
    setCurrentWinners([]);
    setIsLotteryResultCurrent(false);
    removeStoredSession();
    resetMatching();
    try {
      const list = await listSessions(name);
      setSessions(list);
      const latestSession = list[0]?.timestamp ?? null;
      if (latestSession !== null) {
        await openSession(latestSession);
        saveLastUsedSession(latestSession);
        setCurrentSessionTimestamp(latestSession);
        bumpDataReload();
      } else {
        clearLastUsedSession();
      }
    } catch (e) {
      console.warn('[AppContext] セッション一覧の取得に失敗しました:', e);
      clearLastUsedSession();
    }
  };

  const switchSession = async (timestamp: string) => {
    // Re-opening the session DB blows away the volatile applicant/lottery
    // local state — those are re-fetched by AppContainer's data-load effect
    // when dataReloadCounter bumps.
    await closeSession();
    await openSession(timestamp);
    saveLastUsedSession(timestamp);
    setCurrentSessionTimestamp(timestamp);
    setCurrentWinners([]);
    setIsLotteryResultCurrent(false);
    removeStoredSession();
    resetMatching();
    bumpDataReload();
  };

  useEffect(() => {
    initializeApp()
      .then(async ({ events: evList, lastUsedEvent, lastUsedSession }) => {
        if (lastUsedEvent) {
          await openEvent(lastUsedEvent);
          setCurrentEventName(lastUsedEvent);
          try {
            const list = await listSessions(lastUsedEvent);
            setSessions(list);
            const sessionToOpen = lastUsedSession && list.some((s) => s.timestamp === lastUsedSession)
              ? lastUsedSession
              : (list[0]?.timestamp ?? null);
            if (sessionToOpen !== null) {
              await openSession(sessionToOpen);
              saveLastUsedSession(sessionToOpen);
              setCurrentSessionTimestamp(sessionToOpen);
            }
          } catch (e) {
            console.warn('[AppContext] セッション一覧の取得に失敗しました:', e);
          }
        }
        setEvents(evList);
        setIsDbReady(true);
      })
      .catch((e) => {
        console.error('[AppContext] DB初期化に失敗しました:', e);
        setIsDbReady(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppContext.Provider value={{
      activePage,
      setActivePage,
      casts,
      setCasts,
      applicants: applicantsState,
      setApplicants,
      currentWinners,
      setCurrentWinners,
      isLotteryResultCurrent,
      setIsLotteryResultCurrent,
      guaranteedWinners,
      setGuaranteedWinners,
      matchingTypeCode,
      setMatchingTypeCode,
      rotationCount,
      setRotationCount,
      themeId,
      setThemeId,
      themeCustomization,
      setThemeCustomization,
      totalTables,
      setTotalTables,
      usersPerTable,
      setUsersPerTable,
      castsPerRotation,
      setCastsPerRotation,
      matchingSettings,
      setMatchingSettings,
      globalMatchingResult,
      setGlobalMatchingResult,
      globalTableSlots,
      setGlobalTableSlots,
      globalMatchingError,
      setGlobalMatchingError,
      allowM003EmptySeats,
      setAllowM003EmptySeats,
      m003SameDaySlotCount,
      setM003SameDaySlotCount,
      isMatchingLocked,
      setIsMatchingLocked,
      resetMatching,
      isDbReady,
      currentEventName,
      setCurrentEventName,
      currentSessionTimestamp,
      setCurrentSessionTimestamp,
      events,
      setEvents,
      sessions,
      setSessions,
      switchEvent,
      switchSession,
      dataReloadCounter,
      bumpDataReload,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
