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
    if (command === 'get_startup_session_cleanup_error') return null;
    void args;
    throw new Error(`unexpected command: ${command}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('initializeApp', () => {
  it('単一キーに保存した最後のイベントを復元する', async () => {
    installWindowWithStorage(createStorage({
      'stargazer:lastLocation': JSON.stringify({
        eventName: 'Event B',
      }),
    }));

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: 'Event B',
      startupSessionCleanupError: null,
    });
  });

  it('保存済みイベントが存在しない場合は保存済み位置を破棄する', async () => {
    const storage = createStorage({
      'stargazer:lastLocation': JSON.stringify({
        eventName: 'Missing Event',
      }),
    });
    installWindowWithStorage(storage);

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: null,
      startupSessionCleanupError: null,
    });
    expect(storage.getItem('stargazer:lastLocation')).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it('起動時の一時セッション破棄エラーを画面へ返す', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'list_events') return ['Event A', 'Event B'];
      if (command === 'get_startup_session_cleanup_error') return '一時セッションを破棄できませんでした。';
      throw new Error(`unexpected command: ${command}`);
    });
    installWindowWithStorage(createStorage({
      'stargazer:lastLocation': JSON.stringify({ eventName: 'Event A' }),
    }));

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: 'Event A',
      startupSessionCleanupError: '一時セッションを破棄できませんでした。',
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
      startupSessionCleanupError: null,
    });
  });

  it('保存済み位置の読み取りに失敗した場合は保存値を削除しない', async () => {
    const storage = createStorage({
      'stargazer:lastLocation': JSON.stringify({
        eventName: 'Event A',
      }),
    });
    storage.getItem = vi.fn((key: string) => {
      if (key === 'stargazer:lastLocation') throw new Error('read blocked');
      return null;
    });
    installWindowWithStorage(storage);

    await expect(initializeApp()).resolves.toEqual({
      events: ['Event A', 'Event B'],
      lastUsedEvent: null,
      startupSessionCleanupError: null,
    });
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});

describe('最後に使用した位置の保存と初期化', () => {
  it('最後に使用したイベントだけを書き込む', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    saveLastLocation('Event A');

    expect(JSON.parse(storage.getItem('stargazer:lastLocation') ?? '')).toEqual({
      eventName: 'Event A',
    });
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith(
      'stargazer:lastLocation',
      JSON.stringify({ eventName: 'Event A' }),
    );
  });

  it('最後に使用したイベントを単一書込で置き換える', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    saveLastLocation('Event A');
    saveLastLocation('Event B');

    expect(JSON.parse(storage.getItem('stargazer:lastLocation') ?? '')).toEqual({
      eventName: 'Event B',
    });
  });

  it('現在イベントの削除後に最終位置を消去する', () => {
    const storage = createStorage({
      'stargazer:lastLocation': '{"eventName":"Event A"}',
    });
    installWindowWithStorage(storage);

    clearSavedLocation();

    expect(storage.getItem('stargazer:lastLocation')).toBeNull();
  });

  it('保存に失敗しても例外を送出しない', () => {
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    installWindowWithStorage(storage);

    expect(() => saveLastLocation('Event A')).not.toThrow();
  });

  it('存在しない保存済みイベントの削除に失敗しても初期化を継続する', async () => {
    const storage = createStorage({
      'stargazer:lastLocation': JSON.stringify({
        eventName: 'Missing Event',
      }),
    });
    storage.removeItem = vi.fn(() => {
      throw new Error('remove blocked');
    });
    installWindowWithStorage(storage);

    await expect(initializeApp()).resolves.toMatchObject({
      lastUsedEvent: null,
      startupSessionCleanupError: null,
    });
    expect(storage.removeItem).toHaveBeenCalledWith('stargazer:lastLocation');
  });
});
