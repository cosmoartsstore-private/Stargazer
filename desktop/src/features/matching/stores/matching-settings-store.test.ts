import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/common/config';
import {
  getInitialMatchingSettings,
  normalizeMatchingSettingsState,
  persistMatchingSettings,
  type MatchingSettingsState,
} from './matching-settings-store';

function defaultSettings(): MatchingSettingsState {
  return {
    ngJudgmentType: 'accountId',
    ngMatchingBehavior: 'exclude',
    searchMode: 'efficiency',
    caution: { autoRegisterThreshold: 2, cautionUsers: [] },
    ngExceptions: { exceptions: [] },
  };
}

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

describe('getInitialMatchingSettings', () => {
  it('ブラウザ外では既定値を返す', () => {
    vi.stubGlobal('window', undefined);

    expect(getInitialMatchingSettings()).toEqual(defaultSettings());
  });

  it('保存済み JSON が壊れている場合は既定値を返す', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.MATCHING_SETTINGS]: '{invalid',
    }));

    expect(getInitialMatchingSettings()).toEqual(defaultSettings());
  });

  it('保存済み設定を復元し、無効な値を除外して旧形式の登録日時を補完する', () => {
    const storage = createStorage({
      [STORAGE_KEYS.MATCHING_SETTINGS]: JSON.stringify({
        ngJudgmentType: 'username',
        ngMatchingBehavior: 'warn',
        searchMode: 'quality',
        caution: {
          autoRegisterThreshold: 0,
          cautionUsers: [
            {
              username: 'Sample User',
              accountId: '@sample_user',
              registrationType: 'manual',
              registeredAt: '2026-06-19T12:00:00.000Z',
              reason: '確認済み',
            },
            {
              username: 'Legacy User',
              accountId: '@legacy_user',
              registrationType: 'manual',
              reason: 123,
            },
            {
              username: '  Url User  ',
              accountId: 'https://x.com/url_user',
              registrationType: 'manual',
            },
            {
              username: 'At User',
              accountId: '@@at_user',
              registrationType: 'manual',
            },
            {
              username: 'Duplicate Sample',
              accountId: 'sample_user',
              registrationType: 'manual',
              registeredAt: '2026-06-19T12:30:00.000Z',
            },
            {
              username: 'Invalid Type',
              accountId: '@invalid_type',
              registrationType: 'unknown',
              registeredAt: '2026-06-19T12:00:00.000Z',
            },
            {
              username: '   ',
              accountId: '@blank_name',
              registrationType: 'manual',
              registeredAt: '2026-06-19T12:00:00.000Z',
            },
          ],
        },
        ngExceptions: {
          exceptions: [
            {
              username: 'Excepted User',
              accountId: '@excepted_user',
              registeredAt: '2026-06-19T13:00:00.000Z',
              note: '手動確認',
            },
            {
              username: 'Legacy Exception',
              accountId: '@legacy_exception',
              registeredAt: 'not-date',
              note: 123,
            },
            {
              username: 'Url Exception',
              accountId: 'https://x.com/@url_exception',
              registeredAt: '2026-06-19T14:30:00.000Z',
            },
            {
              username: 'Duplicate Exception',
              accountId: 'excepted_user',
              registeredAt: '2026-06-19T14:40:00.000Z',
            },
            {
              username: 'Invalid Exception',
              accountId: 123,
              registeredAt: '2026-06-19T14:00:00.000Z',
            },
            {
              username: 'Blank Account',
              accountId: '   ',
              registeredAt: '2026-06-19T15:00:00.000Z',
            },
          ],
        },
      }),
    });
    installWindowWithStorage(storage);

    expect(getInitialMatchingSettings()).toEqual({
      ngJudgmentType: 'accountId',
      ngMatchingBehavior: 'warn',
      searchMode: 'quality',
      caution: {
        autoRegisterThreshold: 2,
        cautionUsers: [
          {
            username: 'Sample User',
            accountId: '@sample_user',
            registrationType: 'manual',
            registeredAt: '2026-06-19T12:00:00.000Z',
            reason: '確認済み',
          },
          {
            username: 'Legacy User',
            accountId: '@legacy_user',
            registrationType: 'manual',
            registeredAt: '1970-01-01T00:00:00.000Z',
          },
          {
            username: 'Url User',
            accountId: '@url_user',
            registrationType: 'manual',
            registeredAt: '1970-01-01T00:00:00.000Z',
          },
          {
            username: 'At User',
            accountId: '@at_user',
            registrationType: 'manual',
            registeredAt: '1970-01-01T00:00:00.000Z',
          },
        ],
      },
      ngExceptions: {
        exceptions: [
          {
            username: 'Excepted User',
            accountId: '@excepted_user',
            registeredAt: '2026-06-19T13:00:00.000Z',
            note: '手動確認',
          },
          {
            username: 'Legacy Exception',
            accountId: '@legacy_exception',
            registeredAt: '1970-01-01T00:00:00.000Z',
          },
          {
            username: 'Url Exception',
            accountId: '@url_exception',
            registeredAt: '2026-06-19T14:30:00.000Z',
          },
        ],
      },
    });
  });

  it('保存済み設定の一部が欠けている場合は該当項目だけ既定値へ戻す', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.MATCHING_SETTINGS]: JSON.stringify({
        ngJudgmentType: 'username',
        ngMatchingBehavior: 'invalid',
        searchMode: 'invalid',
      }),
    }));

    expect(getInitialMatchingSettings()).toEqual(defaultSettings());
  });

  it('localStorage 取得時に例外が出ても既定値を返す', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage blocked');
      },
    });

    expect(getInitialMatchingSettings()).toEqual(defaultSettings());
  });
});

describe('normalizeMatchingSettingsState', () => {
  it('NG 判定基準は常に固定値へ戻す', () => {
    expect(normalizeMatchingSettingsState({
      ...defaultSettings(),
      ngJudgmentType: 'username',
    }).ngJudgmentType).toBe('accountId');
  });
});

describe('persistMatchingSettings', () => {
  it('ブラウザ外では保存せず終了する', () => {
    vi.stubGlobal('window', undefined);

    expect(() => persistMatchingSettings(defaultSettings())).not.toThrow();
  });

  it('保存時も NG 判定基準を固定値へ正規化する', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    persistMatchingSettings({
      ...defaultSettings(),
      ngJudgmentType: 'either',
      ngMatchingBehavior: 'warn',
    });

    const setItem = storage.setItem as ReturnType<typeof vi.fn>;
    const saved = JSON.parse(setItem.mock.calls[0][1]) as MatchingSettingsState;
    expect(setItem.mock.calls[0][0]).toBe(STORAGE_KEYS.MATCHING_SETTINGS);
    expect(saved.ngJudgmentType).toBe('accountId');
    expect(saved.ngMatchingBehavior).toBe('warn');
  });

  it('保存に失敗しても例外を送出しない', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    installWindowWithStorage(storage);

    expect(() => persistMatchingSettings(defaultSettings())).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('マッチング設定の保存に失敗しました', expect.any(Error));
  });
});
