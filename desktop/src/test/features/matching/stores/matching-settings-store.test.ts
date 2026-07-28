import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/common/config';
import {
  DEFAULT_CAUTION_THRESHOLD,
  getEventCautionThreshold,
  getInitialMatchingSettings,
  persistEventCautionThreshold,
  persistMatchingSearchMode,
} from '@/features/matching/stores/matching-settings-store';

const repositoryMocks = vi.hoisted(() => ({
  getSetting: vi.fn(async () => null as string | null),
  setSetting: vi.fn(async () => undefined),
}));

vi.mock('@/db/repositories/settingsRepository', () => repositoryMocks);

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
  repositoryMocks.getSetting.mockReset();
  repositoryMocks.getSetting.mockResolvedValue(null);
  repositoryMocks.setSetting.mockReset();
  repositoryMocks.setSetting.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getInitialMatchingSettings', () => {
  it('ブラウザ外では既定の端末設定と空のイベント設定を返す', () => {
    vi.stubGlobal('window', undefined);

    expect(getInitialMatchingSettings()).toEqual({
      searchMode: 'efficiency',
      caution: {
        candidateThreshold: DEFAULT_CAUTION_THRESHOLD,
        cautionUsers: [],
      },
    });
  });

  it('探索モード専用キーから端末設定を復元する', () => {
    installWindowWithStorage(createStorage({
      [STORAGE_KEYS.MATCHING_SEARCH_MODE]: 'quality',
    }));

    expect(getInitialMatchingSettings().searchMode).toBe('quality');
  });

  it('旧設定から探索モードだけを移行し、イベントデータは採用しない', () => {
    const storage = createStorage({
      stargazer_matching_settings: JSON.stringify({
        searchMode: 'quality',
        caution: {
          candidateThreshold: 9,
          cautionUsers: [{ accountId: '@other_event' }],
        },
        ngExceptions: {
          exceptions: [{ accountId: '@unused' }],
        },
      }),
    });
    installWindowWithStorage(storage);

    expect(getInitialMatchingSettings()).toEqual({
      searchMode: 'quality',
      caution: {
        candidateThreshold: DEFAULT_CAUTION_THRESHOLD,
        cautionUsers: [],
      },
    });
    expect(storage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.MATCHING_SEARCH_MODE,
      'quality',
    );
    expect(storage.removeItem).not.toHaveBeenCalledWith('stargazer_matching_settings');
  });
});

describe('persistMatchingSearchMode', () => {
  it('探索モードだけを専用キーへ保存する', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    persistMatchingSearchMode('quality');

    expect(storage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.MATCHING_SEARCH_MODE,
      'quality',
    );
  });

  it('保存失敗はUIを停止させない', () => {
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error('blocked');
    });
    installWindowWithStorage(storage);

    expect(() => persistMatchingSearchMode('quality')).not.toThrow();
  });
});

describe('event caution threshold', () => {
  it('未保存または不正値なら既定値を返す', async () => {
    await expect(getEventCautionThreshold()).resolves.toBe(DEFAULT_CAUTION_THRESHOLD);

    repositoryMocks.getSetting.mockResolvedValueOnce('0');
    await expect(getEventCautionThreshold()).resolves.toBe(DEFAULT_CAUTION_THRESHOLD);
  });

  it('イベント共有DBの保存値を返す', async () => {
    repositoryMocks.getSetting.mockResolvedValue('4');

    await expect(getEventCautionThreshold()).resolves.toBe(4);
    expect(repositoryMocks.getSetting).toHaveBeenCalledWith(
      'caution_auto_register_threshold',
    );
  });

  it('1以上の整数だけをイベント共有DBへ保存する', async () => {
    await persistEventCautionThreshold(3);
    expect(repositoryMocks.setSetting).toHaveBeenCalledWith(
      'caution_auto_register_threshold',
      '3',
    );

    await expect(persistEventCautionThreshold(0)).rejects.toThrow(
      '要注意候補の閾値は1以上の整数で指定してください。',
    );
  });
});
