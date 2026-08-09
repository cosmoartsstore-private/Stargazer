/**
 * TSVヘッダー行と確定済みの列マッピングを端末内で対応付ける。
 * 応募者データとは分離し、別イベントでも同じヘッダー構成を再利用できるようにする。
 */

import { readBrowserStorageItem, writeBrowserStorageItem } from '@/common/browserStorage';
import { STORAGE_KEYS } from '@/common/config';
import {
  resolveImportColumnMapping,
  type ColumnMapping,
} from '@/common/importFormat';

interface CachedImportMapping {
  headers: string[];
  mapping: ColumnMapping;
}

interface ImportMappingCacheStore {
  version: 1;
  entries: CachedImportMapping[];
}

const COLUMN_INDEX_KEYS = [
  'name',
  'x_id',
  'vrc_url',
  'cast1',
  'cast2',
  'cast3',
] as const satisfies readonly (keyof ColumnMapping)[];

function headersMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((header, index) => header === right[index]);
}

/** 保存値を現行ヘッダーの範囲へ限定し、不正なマッピングは復元しない。 */
function normalizeMapping(value: unknown, columnCount: number): ColumnMapping | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const mapping = {} as Pick<ColumnMapping, (typeof COLUMN_INDEX_KEYS)[number]>;
  for (const key of COLUMN_INDEX_KEYS) {
    const columnIndex = source[key];
    if (
      typeof columnIndex !== 'number'
      || !Number.isInteger(columnIndex)
      || columnIndex < -1
      || columnIndex >= columnCount
    ) return null;
    mapping[key] = columnIndex;
  }
  if (source.castInputType !== 'single' && source.castInputType !== 'multiple') return null;
  return resolveImportColumnMapping({
    ...mapping,
    castInputType: source.castInputType,
  });
}

function parseCache(raw: string | null): CachedImportMapping[] {
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw) as unknown;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];
    const candidate = stored as Record<string, unknown>;
    if (candidate.version !== 1 || !Array.isArray(candidate.entries)) return [];
    return candidate.entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const source = entry as Record<string, unknown>;
      if (!Array.isArray(source.headers) || !source.headers.every((header) => typeof header === 'string')) {
        return [];
      }
      const headers = [...source.headers] as string[];
      const mapping = normalizeMapping(source.mapping, headers.length);
      return mapping ? [{ headers, mapping }] : [];
    });
  } catch {
    return [];
  }
}

/** ヘッダー名・列数・列順がすべて一致する場合だけ、前回の列マッピングを返す。 */
export function getCachedImportColumnMapping(headers: readonly string[]): ColumnMapping | null {
  const entries = parseCache(readBrowserStorageItem(STORAGE_KEYS.IMPORT_COLUMN_MAPPINGS));
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (headersMatch(entries[index].headers, headers)) return { ...entries[index].mapping };
  }
  return null;
}

/** 取込に使用した列マッピングを、元のヘッダー行と一組で端末へ保存する。 */
export function persistImportColumnMapping(
  headers: readonly string[],
  mapping: ColumnMapping,
): void {
  const normalizedMapping = normalizeMapping(resolveImportColumnMapping(mapping), headers.length);
  if (!normalizedMapping) return;
  const current = parseCache(readBrowserStorageItem(STORAGE_KEYS.IMPORT_COLUMN_MAPPINGS));
  const nextStore: ImportMappingCacheStore = {
    version: 1,
    entries: [
      ...current.filter((entry) => !headersMatch(entry.headers, headers)),
      { headers: [...headers], mapping: normalizedMapping },
    ],
  };
  writeBrowserStorageItem(STORAGE_KEYS.IMPORT_COLUMN_MAPPINGS, JSON.stringify(nextStore));
}
