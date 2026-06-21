import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROTATION_COUNT } from '@/common/copy';
import { STORAGE_KEYS } from '@/common/config';
import {
  getInitialThemeCustomization,
  getInitialSession,
  getInitialThemeId,
  persistThemeCustomization,
  persistSession,
  persistTheme,
  removeStoredSession,
  type PersistedSession,
} from './app-storage-store';
import { DEFAULT_THEME_CUSTOMIZATION } from '@/common/themeCustomization';

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

function sampleSession(): PersistedSession {
  return {
    winners: [
      {
        name: 'Sample User',
        x_id: '@sample_user',
        casts: ['Cast A'],
        raw_extra: [],
      },
    ],
    matchingTypeCode: 'M002',
    rotationCount: 3,
    totalTables: 12,
    usersPerTable: 2,
    castsPerRotation: 1,
    allowM003EmptySeats: false,
    m003SameDaySlotCount: 0,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getInitialSession', () => {
  it('ブラウザ外ではセッションを復元しない', () => {
    vi.stubGlobal('window', undefined);

    expect(getInitialSession()).toBeNull();
  });

  it('保存済み JSON が壊れている場合はセッションを復元しない', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.SESSION]: '{invalid',
    }));

    expect(getInitialSession()).toBeNull();
  });

  it('保存済みセッションを復元し、不正値は既定値へ戻す', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.SESSION]: JSON.stringify({
        winners: sampleSession().winners,
        matchingTypeCode: 'M003',
        rotationCount: 0,
        totalTables: 0,
        usersPerTable: 2,
        castsPerRotation: 'invalid',
        allowM003EmptySeats: true,
        m003SameDaySlotCount: 2.8,
      }),
    }));

    expect(getInitialSession()).toEqual({
      winners: sampleSession().winners,
      matchingTypeCode: 'M001',
      rotationCount: DEFAULT_ROTATION_COUNT,
      totalTables: 15,
      usersPerTable: 2,
      castsPerRotation: 1,
      allowM003EmptySeats: true,
      m003SameDaySlotCount: 2,
    });
  });

  it('有効なマッチング方式は保存値のまま復元する', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.SESSION]: JSON.stringify(sampleSession()),
    }));

    expect(getInitialSession()?.matchingTypeCode).toBe('M002');
  });

  it('winners が配列でない場合はセッションを復元しない', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.SESSION]: JSON.stringify({
        winners: 'invalid',
      }),
    }));

    expect(getInitialSession()).toBeNull();
  });

  it('localStorage 取得時に例外が出てもセッションを復元しない', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage blocked');
      },
    });

    expect(getInitialSession()).toBeNull();
  });

  it('保存文字列の読み取りに失敗してもセッションを復元しない', () => {
    const storage = createStorage();
    storage.getItem = vi.fn(() => {
      throw new Error('read blocked');
    });
    installWindowWithStorage(storage);

    expect(getInitialSession()).toBeNull();
  });
});

describe('getInitialThemeId', () => {
  it('保存済みテーマが有効ならその値を返す', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.THEME]: ' skyblue ',
    }));

    expect(getInitialThemeId()).toBe('skyblue');
  });

  it('保存済みテーマが無効なら既定テーマを返す', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.THEME]: 'neon',
    }));

    expect(getInitialThemeId()).toBe('dark');
  });
});

describe('getInitialThemeCustomization', () => {
  it('保存済みテーマカラー設定を復元する', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.THEME_CUSTOMIZATION]: JSON.stringify({
        dark: { colors: ['#123456'], direction: 90, intensity: 42 },
        skyblue: { hue: 180 },
      }),
    }));

    expect(getInitialThemeCustomization()).toEqual({
      dark: { accent: DEFAULT_THEME_CUSTOMIZATION.dark.accent, colors: ['#123456'], direction: 90, intensity: 42 },
      skyblue: { hue: 180 },
    });
  });

  it('保存値が壊れている場合は既定設定を返す', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.THEME_CUSTOMIZATION]: '{invalid',
    }));

    expect(getInitialThemeCustomization()).toEqual(DEFAULT_THEME_CUSTOMIZATION);
  });
});

describe('persistSession', () => {
  it('セッションを保存キーへ JSON として書き込む', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    persistSession(sampleSession());

    const setItem = storage.setItem as ReturnType<typeof vi.fn>;
    expect(setItem.mock.calls[0][0]).toBe(STORAGE_KEYS.SESSION);
    expect(JSON.parse(setItem.mock.calls[0][1]) as PersistedSession).toEqual(sampleSession());
  });

  it('保存に失敗しても例外を送出しない', () => {
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    installWindowWithStorage(storage);

    expect(() => persistSession(sampleSession())).not.toThrow();
  });
});

describe('persistTheme', () => {
  it('テーマを保存キーへ書き込む', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    persistTheme('skyblue');

    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.THEME, 'skyblue');
  });

  it('テーマ保存に失敗しても例外を送出しない', () => {
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    installWindowWithStorage(storage);

    expect(() => persistTheme('skyblue')).not.toThrow();
  });
});

describe('persistThemeCustomization', () => {
  it('テーマカラー設定を保存キーへ JSON として書き込む', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    persistThemeCustomization(DEFAULT_THEME_CUSTOMIZATION);

    const setItem = storage.setItem as ReturnType<typeof vi.fn>;
    expect(setItem.mock.calls[0][0]).toBe(STORAGE_KEYS.THEME_CUSTOMIZATION);
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual(DEFAULT_THEME_CUSTOMIZATION);
  });
});

describe('removeStoredSession', () => {
  it('保存済みセッションを削除する', () => {
    const storage = createStorage({
      [STORAGE_KEYS.SESSION]: JSON.stringify(sampleSession()),
    });
    installWindowWithStorage(storage);

    removeStoredSession();

    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.SESSION);
    expect(storage.getItem(STORAGE_KEYS.SESSION)).toBeNull();
  });

  it('削除に失敗しても例外を送出しない', () => {
    const storage = createStorage();
    storage.removeItem = vi.fn(() => {
      throw new Error('storage blocked');
    });
    installWindowWithStorage(storage);

    expect(() => removeStoredSession()).not.toThrow();
  });
});
