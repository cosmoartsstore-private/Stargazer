import { invoke } from '@tauri-apps/api/core';
import {
  readBrowserStorageItemResult,
  removeBrowserStorageItem,
  writeBrowserStorageItem,
} from '@/common/browserStorage';

/**
 * アプリ起動時のイベント一覧と、最後に使用したイベント・セッションの復元。
 * 最終使用情報は localStorage の補助情報であり、実体の有無は Tauri command で確認する。
 */

const LAST_LOCATION_KEY = 'stargazer:lastLocation';

interface LastLocation {
  version: 1;
  eventName: string;
  sessionTimestamp: string | null;
}

type LastLocationReadResult =
  | { ok: true; value: LastLocation | null }
  | { ok: false; value: null };

function isLastLocation(value: unknown): value is LastLocation {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<LastLocation>;
  return candidate.version === 1
    && typeof candidate.eventName === 'string'
    && (candidate.sessionTimestamp === null || typeof candidate.sessionTimestamp === 'string');
}

/** 保存済みの最終使用位置を読み込む。 */
function readLastLocation(): LastLocationReadResult {
  const current = readBrowserStorageItemResult(LAST_LOCATION_KEY);
  if (!current.ok) return { ok: false, value: null };
  if (current.value === null) return { ok: true, value: null };
  try {
    const parsed: unknown = JSON.parse(current.value);
    return {
      ok: true,
      value: isLastLocation(parsed) ? parsed : null,
    };
  } catch {
    return { ok: true, value: null };
  }
}

/** 最終使用位置を単一キーへ保存する。 */
function writeLastLocation(location: LastLocation): boolean {
  return writeBrowserStorageItem(LAST_LOCATION_KEY, JSON.stringify(location));
}

export interface InitializeResult {
  events: string[];
  lastUsedEvent: string | null;
  /** 保存済みセッション候補。実在確認はイベントを開いた後のセッション一覧で行う。 */
  lastUsedSession: string | null;
}

/** イベント一覧を取得し、保存済みの最終イベント・セッションが現在も有効なら復元する。 */
export async function initializeApp(): Promise<InitializeResult> {
  const events = await invoke<string[]>('list_events');
  const storedLocationResult = readLastLocation();
  const storedLocation = storedLocationResult.ok ? storedLocationResult.value : null;
  const storedEvent = storedLocation?.eventName ?? null;
  const lastUsedEvent =
    storedEvent && events.includes(storedEvent) ? storedEvent : null;

  const lastUsedSession =
    lastUsedEvent === null ? null : (storedLocation?.sessionTimestamp ?? null);
  if (lastUsedEvent === null && storedLocationResult.ok && storedLocation !== null) {
    // 保存済みイベントが存在しない場合、保存済みセッションは別イベント由来なので破棄する。
    clearSavedLocation();
  }

  if (storedLocationResult.ok && lastUsedEvent !== null) {
    writeLastLocation({
      version: 1,
      eventName: lastUsedEvent,
      sessionTimestamp: lastUsedSession,
    });
  }

  return {
    events,
    lastUsedEvent,
    lastUsedSession,
  };
}

/** 最後に使用したイベントとセッションを一組で保存する。 */
export function saveLastLocation(
  eventName: string,
  sessionTimestamp: string | null,
): void {
  writeLastLocation({
    version: 1,
    eventName,
    sessionTimestamp,
  });
}

/** 保存済みの最終使用位置を削除する。 */
export function clearSavedLocation(): void {
  removeBrowserStorageItem(LAST_LOCATION_KEY);
}
