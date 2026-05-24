import { invoke } from '@tauri-apps/api/core';

const LAST_EVENT_KEY = 'stargazer:lastEvent';
const LAST_SESSION_KEY = 'stargazer:lastSession';

export interface InitializeResult {
  events: string[];
  lastUsedEvent: string | null;
  // Only set if the stored session timestamp still exists for the stored event.
  lastUsedSession: string | null;
}

export async function initializeApp(): Promise<InitializeResult> {
  const events = await invoke<string[]>('list_events');
  const storedEvent =
    typeof window !== 'undefined' ? localStorage.getItem(LAST_EVENT_KEY) : null;
  const lastUsedEvent =
    storedEvent && events.includes(storedEvent) ? storedEvent : null;

  let lastUsedSession: string | null = null;
  if (lastUsedEvent) {
    const storedSession =
      typeof window !== 'undefined' ? localStorage.getItem(LAST_SESSION_KEY) : null;
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
  } else {
    // The stored event no longer exists — any stored session belonged to a
    // different event and must be discarded.
    clearLastUsedSession();
  }

  return { events, lastUsedEvent, lastUsedSession };
}

export function saveLastUsedEvent(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_EVENT_KEY, name);
}

export function saveLastUsedSession(timestamp: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_SESSION_KEY, timestamp);
}

export function clearLastUsedEvent(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LAST_EVENT_KEY);
}

export function clearLastUsedSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LAST_SESSION_KEY);
}
