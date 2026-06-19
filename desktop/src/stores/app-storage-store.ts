/**
 * アプリ全体の軽量な localStorage 永続化境界。
 * イベント DB に属さない一時セッション状態とテーマだけを扱う。
 */

import { DEFAULT_ROTATION_COUNT } from '@/common/copy';
import { STORAGE_KEYS } from '@/common/config';
import { DEFAULT_THEME_ID, THEME_IDS, type ThemeId } from '@/common/themes';
import type { UserBean } from '@/common/types/entities';
import { MATCHING_TYPE_CODES, type MatchingTypeCode } from '@/features/matching/types/matching-type-codes';

const VALID_MATCHING_CODES: readonly string[] = [...MATCHING_TYPE_CODES];

export interface PersistedSession {
  winners: UserBean[];
  matchingTypeCode: MatchingTypeCode;
  rotationCount: number;
  totalTables: number;
  usersPerTable: number;
  castsPerRotation: number;
  allowM003EmptySeats: boolean;
  m003SameDaySlotCount: number;
}

/** ブラウザで使用可能な localStorage を取得する。取得できない環境では null を返す。 */
function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 指定キーの保存文字列を読み取る。読み取り時の例外は未保存と同じ扱いにする。 */
function getStoredItem(key: string): string | null {
  const storage = getBrowserStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** 指定キーへ保存する。保存できない環境では UI を止めず何もしない。 */
function setStoredItem(key: string, value: string): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // セッションとテーマは再生成できる軽量状態なので、保存失敗は無視する。
  }
}

/** 指定キーの保存値を削除する。削除できない環境では UI を止めず何もしない。 */
function removeStoredItem(key: string): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // セッション再読込の補助処理なので、削除失敗は次回の正規化に任せる。
  }
}

/** JSON 文字列を object として読み取る。壊れた JSON や配列は復元不可として扱う。 */
function parseStoredObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 指定値が下限以上の number なら採用し、それ以外は既定値を返す。 */
function numberAtLeast(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && value >= min ? value : fallback;
}

/** matchingTypeCode を復元する。M003 は旧セッション復元時の初期方式として M001 へ戻す。 */
function normalizeMatchingTypeCode(value: unknown): MatchingTypeCode {
  if (typeof value !== 'string' || !VALID_MATCHING_CODES.includes(value)) return 'M001';
  const restored = value as MatchingTypeCode;
  return restored === 'M003' ? 'M001' : restored;
}

/** 保存済みセッション object を、現在の画面状態で利用できる値へ正規化する。 */
function normalizePersistedSession(value: Record<string, unknown>): PersistedSession | null {
  if (!Array.isArray(value.winners)) return null;
  return {
    winners: value.winners as UserBean[],
    matchingTypeCode: normalizeMatchingTypeCode(value.matchingTypeCode),
    rotationCount: numberAtLeast(value.rotationCount, 1, DEFAULT_ROTATION_COUNT),
    totalTables: numberAtLeast(value.totalTables, 1, 15),
    usersPerTable: numberAtLeast(value.usersPerTable, 1, 1),
    castsPerRotation: numberAtLeast(value.castsPerRotation, 1, 1),
    allowM003EmptySeats: typeof value.allowM003EmptySeats === 'boolean' ? value.allowM003EmptySeats : false,
    m003SameDaySlotCount: Math.floor(numberAtLeast(value.m003SameDaySlotCount, 0, 0)),
  };
}

/** localStorage から前回の抽選・マッチング一時セッションを復元する。 */
export function getInitialSession(): PersistedSession | null {
  const stored = parseStoredObject(getStoredItem(STORAGE_KEYS.SESSION));
  return stored ? normalizePersistedSession(stored) : null;
}

/** localStorage から初期テーマを復元する。未保存または不正値なら既定テーマを返す。 */
export function getInitialThemeId(): ThemeId {
  const raw = getStoredItem(STORAGE_KEYS.THEME);
  if (!raw) return DEFAULT_THEME_ID;
  const id = raw.trim();
  return THEME_IDS.includes(id as ThemeId) ? (id as ThemeId) : DEFAULT_THEME_ID;
}

/** 抽選・マッチング一時セッションを localStorage に保存する。 */
export function persistSession(session: PersistedSession): void {
  setStoredItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
}

/** テーマ選択を localStorage に保存する。 */
export function persistTheme(themeId: ThemeId): void {
  setStoredItem(STORAGE_KEYS.THEME, themeId);
}

/** 保存済みの抽選・マッチング一時セッションを削除する。 */
export function removeStoredSession(): void {
  removeStoredItem(STORAGE_KEYS.SESSION);
}
