import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLastUsedEvent,
  clearLastUsedSession,
  initializeApp,
  saveLastUsedEvent,
  saveLastUsedSession,
} from './initializer';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function installWindowWithStorage(storage: Storage): void {
  vi.stubGlobal('window', { localStorage: storage });
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command: string, args?: unknown) => {
    if (command === 'list_events') return ['Event A', 'Event B'];
    if (command === 'list_sessions') {
      expect(args).toEqual({ eventName: 'Event A' });
      return [{ timestamp: '2026-06-19T12:00:00.000Z' }];
    }
    throw new Error(`unexpected command: ${command}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('initializeApp', () => {
  it('保存済みイベントと存在する保存済みセッションを復元する', async () => {
    installWindowWithStorage(createStorage({
      'stargazer:lastEvent': 'Event A',
      'stargazer:lastSession': '2026-06-19T12:00:00.000Z',
    }));

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: 'Event A',
      lastUsedSession: '2026-06-19T12:00:00.000Z',
    });
    expect(invokeMock).toHaveBeenCalledWith('list_sessions', { eventName: 'Event A' });
  });

  it('保存済みイベントが存在しない場合は保存済みセッションを破棄する', async () => {
    const storage = createStorage({
      'stargazer:lastEvent': 'Missing Event',
      'stargazer:lastSession': '2026-06-19T12:00:00.000Z',
    });
    installWindowWithStorage(storage);

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: null,
      lastUsedSession: null,
    });
    expect(storage.getItem('stargazer:lastSession')).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('保存済みセッションがイベント内に存在しない場合はセッションを復元しない', async () => {
    installWindowWithStorage(createStorage({
      'stargazer:lastEvent': 'Event A',
      'stargazer:lastSession': 'missing-session',
    }));

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: 'Event A',
      lastUsedSession: null,
    });
  });

  it('セッション一覧取得に失敗した場合はイベントだけ復元する', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'list_events') return ['Event A'];
      if (command === 'list_sessions') throw new Error('session load failed');
      throw new Error(`unexpected command: ${command}`);
    });
    installWindowWithStorage(createStorage({
      'stargazer:lastEvent': 'Event A',
      'stargazer:lastSession': '2026-06-19T12:00:00.000Z',
    }));

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A'],
      lastUsedEvent: 'Event A',
      lastUsedSession: null,
    });
  });

  it('localStorage が拒否されてもイベント一覧を返す', async () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage blocked');
      },
    });

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: null,
      lastUsedSession: null,
    });
  });

  it('保存済みイベントの読み取りに失敗した場合は保存済みセッションを削除しない', async () => {
    const storage = createStorage({
      'stargazer:lastEvent': 'Event A',
      'stargazer:lastSession': '2026-06-19T12:00:00.000Z',
    });
    storage.getItem = vi.fn((key: string) => {
      if (key === 'stargazer:lastEvent') throw new Error('read blocked');
      return key === 'stargazer:lastSession' ? '2026-06-19T12:00:00.000Z' : null;
    });
    installWindowWithStorage(storage);

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: null,
      lastUsedSession: null,
    });
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});

describe('last-used storage helpers', () => {
  it('最後に使用したイベントとセッションを書き込む', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    saveLastUsedEvent('Event A');
    saveLastUsedSession('2026-06-19T12:00:00.000Z');

    expect(storage.getItem('stargazer:lastEvent')).toBe('Event A');
    expect(storage.getItem('stargazer:lastSession')).toBe('2026-06-19T12:00:00.000Z');
  });

  it('最後に使用したイベントとセッションを削除する', () => {
    const storage = createStorage({
      'stargazer:lastEvent': 'Event A',
      'stargazer:lastSession': '2026-06-19T12:00:00.000Z',
    });
    installWindowWithStorage(storage);

    clearLastUsedEvent();
    clearLastUsedSession();

    expect(storage.getItem('stargazer:lastEvent')).toBeNull();
    expect(storage.getItem('stargazer:lastSession')).toBeNull();
  });

  it('保存や削除に失敗しても例外を送出しない', () => {
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    storage.removeItem = vi.fn(() => {
      throw new Error('remove blocked');
    });
    installWindowWithStorage(storage);

    expect(() => saveLastUsedEvent('Event A')).not.toThrow();
    expect(() => saveLastUsedSession('2026-06-19T12:00:00.000Z')).not.toThrow();
    expect(() => clearLastUsedEvent()).not.toThrow();
    expect(() => clearLastUsedSession()).not.toThrow();
  });
});
