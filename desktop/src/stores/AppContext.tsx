import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserBean, CastBean } from '@/common/types/entities';
import { STORAGE_KEYS } from '@/common/config';
import { DEFAULT_THEME_ID, THEME_IDS, type ThemeId } from '@/common/themes';
import {
  getInitialMatchingSettings,
  persistMatchingSettings,
  type MatchingSettingsState,
} from '@/features/matching/stores/matching-settings-store';
import { MATCHING_TYPE_CODES, type MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
import { DEFAULT_ROTATION_COUNT } from '@/common/copy';
import type { MatchedCast, TableSlot } from '@/features/matching/logics/matching-io';
import { initializeApp, saveLastUsedEvent } from '@/db/initializer';
import { openEvent, closeEvent } from '@/db/database';
export type { UserBean, CastBean } from '@/common/types/entities';

const VALID_MATCHING_CODES: readonly string[] = [...MATCHING_TYPE_CODES];

export interface PersistedSession {
  winners: UserBean[];
  matchingTypeCode: MatchingTypeCode;
  rotationCount: number;
  totalTables: number;
  usersPerTable: number;
  castsPerRotation: number;
  allowM003EmptySeats: boolean;
}

function getInitialSession(): PersistedSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (!raw) return null;
    const d = JSON.parse(raw) as unknown;
    if (!d || typeof d !== 'object') return null;
    const o = d as Record<string, unknown>;
    if (!Array.isArray(o.winners)) return null;

    let matchingTypeCode: MatchingTypeCode = 'M001';
    if (typeof o.matchingTypeCode === 'string' && VALID_MATCHING_CODES.includes(o.matchingTypeCode)) {
      const restored = o.matchingTypeCode as MatchingTypeCode;
      matchingTypeCode = restored === 'M003' ? 'M001' : restored;
    }
    const rotationCount = typeof (o as { rotationCount?: number }).rotationCount === 'number' && (o as { rotationCount: number }).rotationCount >= 1
      ? (o as { rotationCount: number }).rotationCount
      : DEFAULT_ROTATION_COUNT;
    const totalTables = typeof (o as { totalTables?: number }).totalTables === 'number' && (o as { totalTables: number }).totalTables >= 1
      ? (o as { totalTables: number }).totalTables
      : 15;
    const usersPerTable = typeof (o as { usersPerTable?: number }).usersPerTable === 'number' && (o as { usersPerTable: number }).usersPerTable >= 1
      ? (o as { usersPerTable: number }).usersPerTable
      : 1;
    const castsPerRotation = typeof (o as { castsPerRotation?: number }).castsPerRotation === 'number' && (o as { castsPerRotation: number }).castsPerRotation >= 1
      ? (o as { castsPerRotation: number }).castsPerRotation
      : 1;
    const allowM003EmptySeats = typeof (o as { allowM003EmptySeats?: boolean }).allowM003EmptySeats === 'boolean'
      ? (o as { allowM003EmptySeats: boolean }).allowM003EmptySeats
      : false;

    return { winners: o.winners as UserBean[], matchingTypeCode, rotationCount, totalTables, usersPerTable, castsPerRotation, allowM003EmptySeats };
  } catch {
    return null;
  }
}

export type PageType = 'guide' | 'dataManagement' | 'internalManagement' | 'eventManagement' | 'import' | 'cast' | 'ngManagement' | 'lottery' | 'matching' | 'attendance' | 'tweet';
export type { MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
export type { ThemeId } from '@/common/themes';

function getInitialThemeId(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.THEME);
    if (!raw) return DEFAULT_THEME_ID;
    const id = raw.trim();
    return THEME_IDS.includes(id as ThemeId) ? (id as ThemeId) : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

interface AppContextType {
  activePage: PageType;
  setActivePage: (page: PageType) => void;
  casts: CastBean[];
  setCasts: React.Dispatch<React.SetStateAction<CastBean[]>>;
  applicants: UserBean[];
  setApplicants: (users: UserBean[]) => void;
  currentWinners: UserBean[];
  setCurrentWinners: (winners: UserBean[]) => void;
  guaranteedWinners: UserBean[];
  setGuaranteedWinners: (winners: UserBean[]) => void;
  matchingTypeCode: MatchingTypeCode;
  setMatchingTypeCode: (code: MatchingTypeCode) => void;
  rotationCount: number;
  setRotationCount: (n: number) => void;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
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
  isMatchingLocked: boolean;
  setIsMatchingLocked: (val: boolean) => void;
  resetMatching: () => void;
  isDbReady: boolean;
  currentEventName: string | null;
  setCurrentEventName: (name: string | null) => void;
  events: string[];
  setEvents: React.Dispatch<React.SetStateAction<string[]>>;
  switchEvent: (name: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const initialSession = useState(() => getInitialSession())[0];
  const [activePage, setActivePage] = useState<PageType>('dataManagement');
  const [casts, setCasts] = useState<CastBean[]>([]);
  const [applicantsState, setApplicantsState] = useState<UserBean[]>([]);
  const [currentWinners, setCurrentWinners] = useState<UserBean[]>(initialSession?.winners ?? []);
  const [guaranteedWinners, setGuaranteedWinners] = useState<UserBean[]>([]);
  const [matchingTypeCode, setMatchingTypeCode] = useState<MatchingTypeCode>(initialSession?.matchingTypeCode ?? 'M001');
  const [rotationCount, setRotationCount] = useState<number>(initialSession?.rotationCount ?? DEFAULT_ROTATION_COUNT);
  const [themeId, setThemeId] = useState<ThemeId>(() => getInitialThemeId());
  const [totalTables, setTotalTables] = useState<number>(initialSession?.totalTables ?? 15);
  const [usersPerTable, setUsersPerTable] = useState<number>(initialSession?.usersPerTable ?? 1);
  const [castsPerRotation, setCastsPerRotation] = useState<number>(initialSession?.castsPerRotation ?? 1);
  const [matchingSettings, setMatchingSettingsState] = useState<MatchingSettingsState>(() => getInitialMatchingSettings());
  const [allowM003EmptySeats, setAllowM003EmptySeats] = useState<boolean>(initialSession?.allowM003EmptySeats ?? false);
  const [isMatchingLocked, setIsMatchingLocked] = useState<boolean>(false);

  const [globalMatchingResult, setGlobalMatchingResult] = useState<Map<string, MatchedCast[]> | null>(null);
  const [globalTableSlots, setGlobalTableSlots] = useState<TableSlot[] | undefined>(undefined);
  const [globalMatchingError, setGlobalMatchingError] = useState<string | null>(null);

  const [isDbReady, setIsDbReady] = useState<boolean>(false);
  const [currentEventName, setCurrentEventName] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  const setApplicants = (users: UserBean[]) => {
    setApplicantsState(users);
  };

  const resetMatching = () => {
    setIsMatchingLocked(false);
    setGlobalMatchingResult(null);
    setGlobalTableSlots(undefined);
    setGlobalMatchingError(null);
  };

  const setMatchingSettings = (stateOrUpdater: MatchingSettingsState | ((prev: MatchingSettingsState) => MatchingSettingsState)) => {
    setMatchingSettingsState((prev) => {
      const next = typeof stateOrUpdater === 'function' ? stateOrUpdater(prev) : stateOrUpdater;
      persistMatchingSettings(next);
      return next;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const session: PersistedSession = {
      winners: currentWinners,
      matchingTypeCode,
      rotationCount,
      totalTables,
      usersPerTable,
      castsPerRotation,
      allowM003EmptySeats,
    };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  }, [currentWinners, matchingTypeCode, rotationCount, totalTables, usersPerTable, castsPerRotation, allowM003EmptySeats]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.THEME, themeId);
  }, [themeId]);

  const switchEvent = async (name: string) => {
    await closeEvent();
    await openEvent(name);
    saveLastUsedEvent(name);
    setCurrentEventName(name);
    setCurrentWinners([]);
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEYS.SESSION);
    resetMatching();
  };

  useEffect(() => {
    initializeApp()
      .then(async ({ events: evList, lastUsedEvent }) => {
        if (lastUsedEvent) {
          await openEvent(lastUsedEvent);
          setCurrentEventName(lastUsedEvent);
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
      guaranteedWinners,
      setGuaranteedWinners,
      matchingTypeCode,
      setMatchingTypeCode,
      rotationCount,
      setRotationCount,
      themeId,
      setThemeId,
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
      isMatchingLocked,
      setIsMatchingLocked,
      resetMatching,
      isDbReady,
      currentEventName,
      setCurrentEventName,
      events,
      setEvents,
      switchEvent,
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
