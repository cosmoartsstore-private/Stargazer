import { invoke } from '@tauri-apps/api/core';
import {
  readBrowserStorageItemResult,
  removeBrowserStorageItem,
  writeBrowserStorageItem,
} from '@/common/browserStorage';

/**
 * アプリ起動時のイベント一覧と、最後に使用したイベントの復元。
 * 作業セッションは終了時に破棄するため、端末設定へ保存しない。
 */

const LAST_LOCATION_KEY = 'stargazer:lastLocation';

interface LastLocation {
  eventName: string;
}

type LastLocationReadResult =
  | { ok: true; value: LastLocation | null }
  | { ok: false; value: null };

function isLastLocation(value: unknown): value is LastLocation {
  if (typeof value !== 'object' || value === null) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1 || !keys.includes('eventName')) return false;
  const candidate = value as Partial<LastLocation>;
  return typeof candidate.eventName === 'string';
}

/** 保存済みの最終使用位置を読み込む。 */
function readLastLocation(): LastLocationReadResult {
  const current = readBrowserStorageItemResult(LAST_LOCATION_KEY);
  if (!current.ok) return { ok: false, value: null };
  if (current.value === null) return { ok: true, value: null };
  try {
    const parsed: unknown = JSON.parse(current.value);
    if (!isLastLocation(parsed)) {
      removeBrowserStorageItem(LAST_LOCATION_KEY);
      return { ok: true, value: null };
    }
    return {
      ok: true,
      value: parsed,
    };
  } catch {
    removeBrowserStorageItem(LAST_LOCATION_KEY);
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
  startupSessionCleanupError: string | null;
}

/** イベント一覧を取得し、保存済みの最終イベントが現在も有効なら復元する。 */
export async function initializeApp(): Promise<InitializeResult> {
  const [events, startupSessionCleanupError] = await Promise.all([
    invoke<string[]>('list_events'),
    invoke<string | null>('get_startup_session_cleanup_error'),
  ]);
  const storedLocationResult = readLastLocation();
  const storedLocation = storedLocationResult.ok ? storedLocationResult.value : null;
  const storedEvent = storedLocation?.eventName ?? null;
  const lastUsedEvent =
    storedEvent && events.includes(storedEvent) ? storedEvent : null;

  if (lastUsedEvent === null && storedLocationResult.ok && storedLocation !== null) {
    // 保存済みイベントが存在しない場合は端末設定からも取り除く。
    clearSavedLocation();
  }

  if (storedLocationResult.ok && lastUsedEvent !== null) {
    writeLastLocation({ eventName: lastUsedEvent });
  }

  return {
    events,
    lastUsedEvent,
    startupSessionCleanupError,
  };
}

/** 最後に使用したイベントだけを保存する。 */
export function saveLastLocation(eventName: string): void {
  writeLastLocation({ eventName });
}

/** 保存済みの最終使用位置を削除する。 */
export function clearSavedLocation(): void {
  removeBrowserStorageItem(LAST_LOCATION_KEY);
}
