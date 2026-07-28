import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSavedLocation,
  initializeApp,
  saveLastLocation,
} from '@/db/initializer';

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
    void args;
    throw new Error(`unexpected command: ${command}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('initializeApp', () => {
  it('単一キーに保存したイベントとセッション候補を復元する', async () => {
    installWindowWithStorage(createStorage({
      'stargazer:lastLocation': JSON.stringify({
        version: 1,
        eventName: 'Event B',
        sessionTimestamp: '2026-07-25T12:00:00.000Z',
      }),
    }));

    await expect(initializeApp()).resolves.toMatchObject({
      lastUsedEvent: 'Event B',
      lastUsedSession: '2026-07-25T12:00:00.000Z',
    });
  });

  it('保存済みイベントとセッション候補を一組で復元する', async () => {
    installWindowWithStorage(createStorage({
      'stargazer:lastEvent': 'Event A',
      'stargazer:lastSession': '2026-06-19T12:00:00.000Z',
    }));

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: 'Event A',
      lastUsedSession: '2026-06-19T12:00:00.000Z',
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
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
    expect(storage.getItem('stargazer:lastEvent')).toBeNull();
    expect(storage.getItem('stargazer:lastSession')).toBeNull();
    expect(storage.getItem('stargazer:lastLocation')).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('セッション候補の実在確認はイベントを開く処理へ委ねる', async () => {
    installWindowWithStorage(createStorage({
      'stargazer:lastEvent': 'Event A',
      'stargazer:lastSession': 'missing-session',
    }));

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: 'Event A',
      lastUsedSession: 'missing-session',
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
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

describe('最後に使用した位置の保存と初期化', () => {
  it('最後に使用したイベントとセッションを書き込む', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    saveLastLocation('Event A', '2026-06-19T12:00:00.000Z');

    expect(JSON.parse(storage.getItem('stargazer:lastLocation') ?? '')).toEqual({
      version: 1,
      eventName: 'Event A',
      sessionTimestamp: '2026-06-19T12:00:00.000Z',
    });
    expect(storage.getItem('stargazer:lastEvent')).toBeNull();
    expect(storage.getItem('stargazer:lastSession')).toBeNull();
  });

  it('イベントだけ保存するときは旧イベントのセッションを同じ書込で破棄する', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    saveLastLocation('Event A', '2026-06-19T12:00:00.000Z');
    saveLastLocation('Event B', null);

    expect(JSON.parse(storage.getItem('stargazer:lastLocation') ?? '')).toEqual({
      version: 1,
      eventName: 'Event B',
      sessionTimestamp: null,
    });
  });

  it('現在イベントの削除後に新旧の最終位置を消去する', () => {
    const storage = createStorage({
      'stargazer:lastLocation': '{"version":1,"eventName":"Event A","sessionTimestamp":null}',
      'stargazer:lastEvent': 'Event A',
      'stargazer:lastSession': '20260725120000',
    });
    installWindowWithStorage(storage);

    clearSavedLocation();

    expect(storage.getItem('stargazer:lastLocation')).toBeNull();
    expect(storage.getItem('stargazer:lastEvent')).toBeNull();
    expect(storage.getItem('stargazer:lastSession')).toBeNull();
  });

  it('保存に失敗しても例外を送出しない', () => {
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    installWindowWithStorage(storage);

    expect(() => saveLastLocation('Event A', '2026-06-19T12:00:00.000Z')).not.toThrow();
  });

  it('存在しない保存済みイベントの削除に失敗しても初期化を継続する', async () => {
    const storage = createStorage({
      'stargazer:lastEvent': 'Missing Event',
      'stargazer:lastSession': '2026-06-19T12:00:00.000Z',
    });
    storage.removeItem = vi.fn(() => {
      throw new Error('remove blocked');
    });
    installWindowWithStorage(storage);

    await expect(initializeApp()).resolves.toMatchObject({
      lastUsedEvent: null,
      lastUsedSession: null,
    });
  });
});
