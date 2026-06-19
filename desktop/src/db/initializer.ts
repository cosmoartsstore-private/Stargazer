import { invoke } from '@tauri-apps/api/core';
import {
  readBrowserStorageItem,
  readBrowserStorageItemResult,
  removeBrowserStorageItem,
  writeBrowserStorageItem,
} from '@/common/browserStorage';

/**
 * アプリ起動時のイベント一覧と、最後に使用したイベント・セッションの復元。
 * 最終使用情報は localStorage の補助情報であり、実体の有無は Tauri command で確認する。
 */

const LAST_EVENT_KEY = 'stargazer:lastEvent';
const LAST_SESSION_KEY = 'stargazer:lastSession';

export interface InitializeResult {
  events: string[];
  lastUsedEvent: string | null;
  /** 保存済みセッションが保存済みイベント内に存在する場合だけ設定する。 */
  lastUsedSession: string | null;
}

/** イベント一覧を取得し、保存済みの最終イベント・セッションが現在も有効なら復元する。 */
export async function initializeApp(): Promise<InitializeResult> {
  const events = await invoke<string[]>('list_events');
  const storedEventResult = readBrowserStorageItemResult(LAST_EVENT_KEY);
  const storedEvent = storedEventResult.ok ? storedEventResult.value : null;
  const lastUsedEvent =
    storedEvent && events.includes(storedEvent) ? storedEvent : null;

  let lastUsedSession: string | null = null;
  if (lastUsedEvent) {
    const storedSession = readBrowserStorageItem(LAST_SESSION_KEY);
    if (storedSession) {
      try {
        const sessions = await invoke<{ timestamp: string }[]>('list_sessions', {
          eventName: lastUsedEvent,
        });
        if (sessions.some((s) => s.timestamp === storedSession)) {
          lastUsedSession = storedSession;
        }
      } catch {
        lastUsedSession = null;
      }
    }
  } else if (storedEventResult.ok) {
    // 保存済みイベントが存在しない場合、保存済みセッションは別イベント由来なので破棄する。
    clearLastUsedSession();
  }

  return { events, lastUsedEvent, lastUsedSession };
}

/** 最後に使用したイベント名を保存する。保存できない環境では何もしない。 */
export function saveLastUsedEvent(name: string): void {
  writeBrowserStorageItem(LAST_EVENT_KEY, name);
}

/** 最後に使用したセッション timestamp を保存する。保存できない環境では何もしない。 */
export function saveLastUsedSession(timestamp: string): void {
  writeBrowserStorageItem(LAST_SESSION_KEY, timestamp);
}

/** 保存済みの最終イベント名を削除する。削除できない環境では何もしない。 */
export function clearLastUsedEvent(): void {
  removeBrowserStorageItem(LAST_EVENT_KEY);
}

/** 保存済みの最終セッション timestamp を削除する。削除できない環境では何もしない。 */
export function clearLastUsedSession(): void {
  removeBrowserStorageItem(LAST_SESSION_KEY);
}
