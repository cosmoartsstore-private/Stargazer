import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/common/config';
import type { ColumnMapping } from '@/common/importFormat';
import {
  getCachedImportColumnMapping,
  persistImportColumnMapping,
} from '@/features/import/importMappingCache';

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

function installStorage(storage: Storage): void {
  vi.stubGlobal('window', { localStorage: storage });
}

const MAPPING: ColumnMapping = {
  name: 1,
  x_id: 0,
  vrc_url: 2,
  cast1: 3,
  cast2: 4,
  cast3: 5,
  castInputType: 'single',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('importMappingCache', () => {
  it('同じヘッダー名・列数・列順の別ファイルで確定済みマッピングを再利用する', () => {
    const storage = createStorage();
    installStorage(storage);
    const headers = ['X ID', '名前', 'VRChat URL', '第1希望', '第2希望', '第3希望'];

    persistImportColumnMapping(headers, MAPPING);

    expect(getCachedImportColumnMapping([...headers])).toEqual(MAPPING);
    expect(storage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.IMPORT_COLUMN_MAPPINGS,
      expect.any(String),
    );
  });

  it('ヘッダーの名称または列順が異なるファイルへマッピングを誤適用しない', () => {
    installStorage(createStorage());
    const headers = ['X ID', '名前', 'VRChat URL', '第1希望', '第2希望', '第3希望'];
    persistImportColumnMapping(headers, MAPPING);

    expect(getCachedImportColumnMapping(['名前', 'X ID', ...headers.slice(2)])).toBeNull();
    expect(getCachedImportColumnMapping([...headers.slice(0, 5), '希望3'])).toBeNull();
  });

  it('同じヘッダーの再保存は前回値を置き換え、別形式の履歴を保持する', () => {
    installStorage(createStorage());
    const firstHeaders = ['X ID', '名前'];
    const secondHeaders = ['X ID', '名前', '希望キャスト'];
    const firstMapping = { ...MAPPING, vrc_url: -1, cast1: -1, cast2: -1, cast3: -1 };
    const updatedMapping = { ...firstMapping, name: -1 };
    const secondMapping = {
      ...MAPPING,
      vrc_url: -1,
      cast1: 2,
      cast2: -1,
      cast3: -1,
      castInputType: 'multiple' as const,
    };

    persistImportColumnMapping(firstHeaders, firstMapping);
    persistImportColumnMapping(secondHeaders, secondMapping);
    persistImportColumnMapping(firstHeaders, updatedMapping);

    expect(getCachedImportColumnMapping(firstHeaders)).toEqual(updatedMapping);
    expect(getCachedImportColumnMapping(secondHeaders)).toEqual(secondMapping);
  });

  it('壊れた保存値や列範囲外のマッピングは復元しない', () => {
    installStorage(createStorage({
      [STORAGE_KEYS.IMPORT_COLUMN_MAPPINGS]: JSON.stringify({
        version: 1,
        entries: [{
          headers: ['X ID'],
          mapping: { ...MAPPING, name: 10 },
        }],
      }),
    }));
    expect(getCachedImportColumnMapping(['X ID'])).toBeNull();

    installStorage(createStorage({
      [STORAGE_KEYS.IMPORT_COLUMN_MAPPINGS]: '{invalid',
    }));
    expect(getCachedImportColumnMapping(['X ID'])).toBeNull();
  });

  it('複数希望形式では未使用の第2・第3希望を保存前に除外する', () => {
    installStorage(createStorage());
    const headers = ['X ID', '希望キャスト', '予備1', '予備2'];

    persistImportColumnMapping(headers, {
      ...MAPPING,
      name: -1,
      vrc_url: -1,
      cast1: 1,
      cast2: 2,
      cast3: 3,
      castInputType: 'multiple',
    });

    expect(getCachedImportColumnMapping(headers)).toMatchObject({
      cast1: 1,
      cast2: -1,
      cast3: -1,
      castInputType: 'multiple',
    });
  });
});
