import {
  getMappedColumnIndexes,
  resolveImportColumnMapping,
  type ColumnMapping,
} from '@/common/importFormat';
import { mapRowToUserBeanWithMapping } from '@/common/sheetParsers';
import type { UserBean } from '@/common/types/entities';
import { findXIdIdentityIssues, type XIdIdentityIssue } from '@/common/xIdUtils';
import { getMsg } from '@/messages/getMsg';

export interface ImportSourceRow {
  /** TSVのヘッダーを除いた元のデータ行番号。画面上で削除しても変えない。 */
  rowNumber: number;
  cells: string[];
}

export interface MappedImportRow {
  sourceRow: ImportSourceRow;
  user: UserBean;
}

export interface ImportColumnOption {
  value: string;
  label: string;
}

export interface ImportPreviewModel {
  columnOptions: ImportColumnOption[];
  rawColumnIndexes: number[];
  importMapping: ColumnMapping;
  mappedRows: MappedImportRow[];
  previewRows: MappedImportRow[];
  previewCastColumnIndexes: number[];
  identityIssues: XIdIdentityIssue[];
  issueRowNumbers: Set<number>;
  mappedRowByNumber: Map<number, MappedImportRow>;
  emptyIdCount: number;
  duplicateIdCount: number;
  validCount: number;
  canImport: boolean;
}

// 列未選択値と画面プレビューの最大行数。
export const UNUSED_COLUMN_VALUE = '__none__';
export const IMPORT_PREVIEW_MAX_ROWS = 5;

export function getImportHeaderLabel(headers: readonly string[], index: number): string {
  return headers[index] || getMsg('ImportPage.columnLabel', { index: index + 1 });
}

export function getSelectedImportColumnValue(
  columnIndex: number,
  columnOptions: readonly ImportColumnOption[],
): string {
  return columnIndex >= 0 && columnOptions.some((option) => option.value === String(columnIndex))
    ? String(columnIndex)
    : UNUSED_COLUMN_VALUE;
}

/** 列設定と元TSVから、プレビュー・検証・取込で共有する表示モデルを組み立てる。 */
export function buildImportPreviewModel(
  headers: readonly string[],
  sourceRows: ImportSourceRow[] | null,
  mapping: ColumnMapping,
): ImportPreviewModel {
  const columnOptions: ImportColumnOption[] = [
    { value: UNUSED_COLUMN_VALUE, label: getMsg('ImportPage.unusedColumn') },
    ...headers.map((header, index) => ({
      value: String(index),
      label: getMsg('ImportPage.columnOption', {
        index: index + 1,
        label: header || getMsg('ImportPage.columnLabel', { index: index + 1 }),
      }),
    })),
  ];

  // 元TSVでは、行ごとに列数がずれていても存在するセルを表示対象に含める。
  const rawColumnCount = sourceRows?.reduce(
    (max, row) => Math.max(max, row.cells.length),
    headers.length,
  ) ?? headers.length;
  const rawColumnIndexes = Array.from({ length: rawColumnCount }, (_, index) => index);

  const effectiveMapping = resolveImportColumnMapping(mapping);
  const usedColumnIndexes = getMappedColumnIndexes(effectiveMapping);
  const importMapping: ColumnMapping = {
    ...effectiveMapping,
    extraColumns: headers
      .map((label, columnIndex) => ({
        columnIndex,
        label: label || getMsg('ImportPage.columnLabel', { index: columnIndex + 1 }),
      }))
      .filter(({ columnIndex }) => !usedColumnIndexes.has(columnIndex)),
  };

  const mappedRows = sourceRows?.map((sourceRow) => ({
    sourceRow,
    user: mapRowToUserBeanWithMapping(sourceRow.cells, importMapping),
  })) ?? [];
  const previewRows = mappedRows.slice(0, IMPORT_PREVIEW_MAX_ROWS);
  const previewCastColumnCount = mappedRows.reduce(
    (max, { user }) => Math.max(max, user.casts.length),
    1,
  );
  const previewCastColumnIndexes = Array.from(
    { length: previewCastColumnCount },
    (_, index) => index,
  );

  const hasIdentityColumn = importMapping.x_id >= 0;
  const identityIssues = hasIdentityColumn
    ? findXIdIdentityIssues(mappedRows.map(({ sourceRow, user }) => ({
        rowNumber: sourceRow.rowNumber,
        xId: user.x_id,
      })))
    : [];
  const issueRowNumbers = new Set(identityIssues.map((issue) => issue.rowNumber));
  const mappedRowByNumber = new Map(mappedRows.map((row) => [row.sourceRow.rowNumber, row]));
  const emptyIdCount = identityIssues.filter((issue) => issue.kind === 'empty').length;
  const duplicateIdCount = identityIssues.filter((issue) => issue.kind === 'duplicate').length;
  const validCount = hasIdentityColumn ? mappedRows.length - identityIssues.length : 0;

  return {
    columnOptions,
    rawColumnIndexes,
    importMapping,
    mappedRows,
    previewRows,
    previewCastColumnIndexes,
    identityIssues,
    issueRowNumbers,
    mappedRowByNumber,
    emptyIdCount,
    duplicateIdCount,
    validCount,
    canImport: mappedRows.length > 0 && hasIdentityColumn && identityIssues.length === 0,
  };
}
