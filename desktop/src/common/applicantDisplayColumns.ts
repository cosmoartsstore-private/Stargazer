// 応募データと抽選結果で共有する任意表示列と、ヘッダー構成別の選択保存を管理する。

import { readBrowserStorageItem, writeBrowserStorageItem } from '@/common/browserStorage';
import { STORAGE_KEYS } from '@/common/config';
import type { UserBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';

export interface ApplicantDisplayColumn {
  id: string;
  label: string;
  rawExtraIndex: number | null;
}

type ApplicantDisplaySource = Pick<UserBean, 'vrc_url' | 'raw_extra'>;

interface StoredApplicantDisplayColumnSelection {
  schema: string[];
  selectedColumnIds: string[];
}

interface ApplicantDisplayColumnStore {
  version: 1;
  entries: StoredApplicantDisplayColumnSelection[];
}

export const VRC_URL_DISPLAY_COLUMN_ID = 'vrc_url';

/** 取込時の追加列順を保ち、重複見出しだけ画面上で判別できる名称へ整形する。 */
export function buildApplicantDisplayColumns(applicants: readonly ApplicantDisplaySource[]): ApplicantDisplayColumn[] {
  if (applicants.length === 0) return [];
  const rawExtraFields = applicants[0]?.raw_extra ?? [];
  const labelCounts = new Map<string, number>();
  rawExtraFields.forEach((field) => {
    labelCounts.set(field.key, (labelCounts.get(field.key) ?? 0) + 1);
  });
  const labelOccurrences = new Map<string, number>();
  return [
    { id: VRC_URL_DISPLAY_COLUMN_ID, label: getMsg('ApplicantDisplayColumns.vrchatUrlHeader'), rawExtraIndex: null },
    ...rawExtraFields.map((field, index) => {
      const occurrence = (labelOccurrences.get(field.key) ?? 0) + 1;
      labelOccurrences.set(field.key, occurrence);
      const baseLabel = field.key || getMsg('ApplicantDisplayColumns.additionalColumnFallback', { index: index + 1 });
      return {
        id: `raw_extra:${index}`,
        label: (labelCounts.get(field.key) ?? 0) > 1
          ? getMsg('ApplicantDisplayColumns.duplicateColumnLabel', { label: baseLabel, occurrence })
          : baseLabel,
        rawExtraIndex: index,
      };
    }),
  ];
}

/** 任意表示列の保存単位となる、追加列ヘッダーの名称と順序を返す。 */
export function buildApplicantDisplayColumnSchema(applicants: readonly ApplicantDisplaySource[]): string[] {
  if (applicants.length === 0) return [];
  return (applicants[0]?.raw_extra ?? []).map((field) => field.key);
}

/** 指定行から任意表示列の値を取得する。 */
export function getApplicantDisplayColumnValue(applicant: ApplicantDisplaySource, column: ApplicantDisplayColumn): string {
  return column.rawExtraIndex == null
    ? applicant.vrc_url ?? ''
    : applicant.raw_extra[column.rawExtraIndex]?.value ?? '';
}

/** 選択値を現在利用できる列へ限定し、重複を除く。 */
export function normalizeApplicantDisplayColumnIds(columnIds: readonly string[], availableColumns: readonly ApplicantDisplayColumn[]): string[] {
  const availableIds = new Set(availableColumns.map((column) => column.id));
  const seenIds = new Set<string>();
  return columnIds.filter((columnId) => {
    if (!availableIds.has(columnId) || seenIds.has(columnId)) return false;
    seenIds.add(columnId);
    return true;
  });
}

function schemasMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseStore(raw: string | null): StoredApplicantDisplayColumnSelection[] {
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw) as unknown;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];
    const candidate = stored as Record<string, unknown>;
    if (candidate.version !== 1 || !Array.isArray(candidate.entries)) return [];
    return candidate.entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const source = entry as Record<string, unknown>;
      if (
        !Array.isArray(source.schema)
        || !source.schema.every((value) => typeof value === 'string')
        || !Array.isArray(source.selectedColumnIds)
        || !source.selectedColumnIds.every((value) => typeof value === 'string')
      ) return [];
      return [{ schema: [...source.schema] as string[], selectedColumnIds: [...source.selectedColumnIds] as string[] }];
    });
  } catch {
    return [];
  }
}

/** 同じ追加列ヘッダー構成で前回選択した表示列を返す。 */
export function getStoredApplicantDisplayColumnIds(schema: readonly string[], availableColumns: readonly ApplicantDisplayColumn[]): string[] {
  const entries = parseStore(readBrowserStorageItem(STORAGE_KEYS.APPLICANT_DISPLAY_COLUMNS));
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (schemasMatch(entries[index].schema, schema)) {
      return normalizeApplicantDisplayColumnIds(entries[index].selectedColumnIds, availableColumns);
    }
  }
  return [];
}

/** 表示列の選択を追加列ヘッダー構成と一組で端末へ保存する。 */
export function persistApplicantDisplayColumnIds(schema: readonly string[], columnIds: readonly string[], availableColumns: readonly ApplicantDisplayColumn[]): boolean {
  const normalizedIds = normalizeApplicantDisplayColumnIds(columnIds, availableColumns);
  const current = parseStore(readBrowserStorageItem(STORAGE_KEYS.APPLICANT_DISPLAY_COLUMNS));
  const nextStore: ApplicantDisplayColumnStore = { version: 1, entries: [...current.filter((entry) => !schemasMatch(entry.schema, schema)), { schema: [...schema], selectedColumnIds: normalizedIds }] };
  return writeBrowserStorageItem(STORAGE_KEYS.APPLICANT_DISPLAY_COLUMNS, JSON.stringify(nextStore));
}
