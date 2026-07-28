import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/common/config';
import {
  getInitialThemeCustomization,
  getInitialThemeId,
  persistTheme,
  persistThemeCustomization,
} from '@/stores/app-storage-store';
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('theme storage', () => {
  it('有効なテーマを復元し、不正値は既定テーマへ戻す', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.THEME]: ' skyblue ',
    }));
    expect(getInitialThemeId()).toBe('skyblue');

    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.THEME]: 'invalid',
    }));
    expect(getInitialThemeId()).toBe('dark');
  });

  it('テーマとカスタマイズをそれぞれの端末設定キーへ保存する', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);
    const customization = {
      ...DEFAULT_THEME_CUSTOMIZATION,
      skyblue: { ...DEFAULT_THEME_CUSTOMIZATION.skyblue, hue: 180 },
    };

    persistTheme('skyblue');
    persistThemeCustomization(customization);

    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.THEME, 'skyblue');
    expect(storage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.THEME_CUSTOMIZATION,
      JSON.stringify(customization),
    );
  });

  it('壊れたカスタマイズ値は既定値へ戻す', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.THEME_CUSTOMIZATION]: '{invalid',
    }));

    expect(getInitialThemeCustomization()).toEqual(DEFAULT_THEME_CUSTOMIZATION);
  });

  it('localStorageを利用できない場合も既定値を返す', () => {
    vi.stubGlobal('window', undefined);

    expect(getInitialThemeId()).toBe('dark');
    expect(getInitialThemeCustomization()).toEqual(DEFAULT_THEME_CUSTOMIZATION);
  });
});
