import { invoke } from '@tauri-apps/api/core';

const LAST_EVENT_KEY = 'stargazer:lastEvent';

export interface InitializeResult {
  events: string[];
  lastUsedEvent: string | null;
}

export async function initializeApp(): Promise<InitializeResult> {
  const events = await invoke<string[]>('list_events');
  const stored = typeof window !== 'undefined' ? localStorage.getItem(LAST_EVENT_KEY) : null;
  const lastUsedEvent = stored && events.includes(stored) ? stored : null;
  return { events, lastUsedEvent };
}

export function saveLastUsedEvent(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_EVENT_KEY, name);
}

export function clearLastUsedEvent(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LAST_EVENT_KEY);
}
