import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBrowserStorage,
  readBrowserStorageItem,
  readBrowserStorageItemResult,
  removeBrowserStorageItem,
  writeBrowserStorageItem,
} from '@/common/browserStorage';

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

describe('getBrowserStorage', () => {
  it('ブラウザ外では null を返す', () => {
    vi.stubGlobal('window', undefined);

    expect(getBrowserStorage()).toBeNull();
  });

  it('localStorage を取得できる場合は Storage を返す', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    expect(getBrowserStorage()).toBe(storage);
  });

  it('localStorage 取得時に例外が出る場合は null を返す', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage blocked');
      },
    });

    expect(getBrowserStorage()).toBeNull();
  });
});

describe('readBrowserStorageItem', () => {
  it('保存済み文字列を読み取る', () => {
    installWindowWithStorage(createStorage({ sample: 'value' }));

    expect(readBrowserStorageItem('sample')).toBe('value');
  });

  it('読み取りに失敗した場合は null を返す', () => {
    const storage = createStorage();
    storage.getItem = vi.fn(() => {
      throw new Error('read blocked');
    });
    installWindowWithStorage(storage);

    expect(readBrowserStorageItem('sample')).toBeNull();
  });
});

describe('readBrowserStorageItemResult', () => {
  it('保存済み文字列を読み取り成功として返す', () => {
    installWindowWithStorage(createStorage({ sample: 'value' }));

    expect(readBrowserStorageItemResult('sample')).toEqual({ ok: true, value: 'value' });
  });

  it('保存値がない場合も読み取り成功として null を返す', () => {
    installWindowWithStorage(createStorage());

    expect(readBrowserStorageItemResult('sample')).toEqual({ ok: true, value: null });
  });

  it('読み取りに失敗した場合は失敗として返す', () => {
    const storage = createStorage();
    storage.getItem = vi.fn(() => {
      throw new Error('read blocked');
    });
    installWindowWithStorage(storage);

    expect(readBrowserStorageItemResult('sample')).toEqual({ ok: false, value: null });
  });
});

describe('writeBrowserStorageItem', () => {
  it('ブラウザ外では false を返す', () => {
    vi.stubGlobal('window', undefined);

    expect(writeBrowserStorageItem('sample', 'value')).toBe(false);
  });

  it('保存に成功した場合は true を返す', () => {
    const storage = createStorage();
    installWindowWithStorage(storage);

    expect(writeBrowserStorageItem('sample', 'value')).toBe(true);
    expect(storage.getItem('sample')).toBe('value');
  });

  it('保存に失敗した場合は false を返す', () => {
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    installWindowWithStorage(storage);

    expect(writeBrowserStorageItem('sample', 'value')).toBe(false);
  });
});

describe('removeBrowserStorageItem', () => {
  it('ブラウザ外では false を返す', () => {
    vi.stubGlobal('window', undefined);

    expect(removeBrowserStorageItem('sample')).toBe(false);
  });

  it('削除に成功した場合は true を返す', () => {
    const storage = createStorage({ sample: 'value' });
    installWindowWithStorage(storage);

    expect(removeBrowserStorageItem('sample')).toBe(true);
    expect(storage.getItem('sample')).toBeNull();
  });

  it('削除に失敗した場合は false を返す', () => {
    const storage = createStorage();
    storage.removeItem = vi.fn(() => {
      throw new Error('remove blocked');
    });
    installWindowWithStorage(storage);

    expect(removeBrowserStorageItem('sample')).toBe(false);
  });
});
