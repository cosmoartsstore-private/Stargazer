import type { UserBean } from './types/entities';
import type { ColumnMapping } from './importFormat';
import { parseXUsername } from './xIdUtils';

function getCell(row: unknown[] | null | undefined, colIndex: number): string {
  if (row == null || !Array.isArray(row) || colIndex < 0 || colIndex >= row.length) return '';
  return (row[colIndex] ?? '').toString().trim();
}

/** 1行を UserBean に変換するときのオプション（カスタム用） */
export interface MapRowOptions {
  /** この列をカンマ区切りで分割し、順不同希望として保持する（-1のときは使わない）。 */
  splitCommaColumnIndex?: number;
}

/** カラムマッピングに従って1行を UserBean に変換する（テンプレート／カスタム用） */
export function mapRowToUserBeanWithMapping(
  row: unknown[],
  mapping: ColumnMapping,
  options?: MapRowOptions
): UserBean {
  let casts: string[];
  let preferenceMode: UserBean['preference_mode'] = 'ranked';
  const splitCol = options?.splitCommaColumnIndex;
  const useSplitComma =
    splitCol !== undefined && splitCol >= 0 && mapping.cast1 === splitCol;
  /** 希望キャストが1列（カンマ区切り or 単一列）のとき */
  const useSingleCastColumn =
    mapping.cast2 < 0 && mapping.cast3 < 0 && mapping.cast1 >= 0;

  /** 複数指定可（カンマ区切り）のときの最大希望数。DB確認で希望キャスト1〜Nとして表示 */
  const MAX_CAST_COMMA = 20;
  if (useSplitComma) {
    preferenceMode = 'flat';
    const cast1Val = getCell(row, mapping.cast1);
    if (!cast1Val) {
      casts = [];
    } else {
      casts = cast1Val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_CAST_COMMA);
    }
  } else if (useSingleCastColumn) {
    preferenceMode = 'flat';
    const cast1Val = getCell(row, mapping.cast1);
    if (!cast1Val || mapping.cast1 < 0) {
      casts = [];
    } else {
      casts = cast1Val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_CAST_COMMA);
      casts = Array.from(new Set(casts));
    }
  } else {
    const c1 = mapping.cast1 >= 0 ? getCell(row, mapping.cast1) : '';
    const c2 = mapping.cast2 >= 0 ? getCell(row, mapping.cast2) : '';
    const c3 = mapping.cast3 >= 0 ? getCell(row, mapping.cast3) : '';
    casts = [c1, c2, c3];
    while (casts.length < 3) casts.push('');
  }

  const namePrimary = mapping.name >= 0 ? getCell(row, mapping.name) : '';
  const nameFallback = mapping.nameColumn2 != null && mapping.nameColumn2 >= 0 ? getCell(row, mapping.nameColumn2) : '';
  const name = namePrimary || nameFallback;

  const rawXId = mapping.x_id >= 0 ? getCell(row, mapping.x_id) : '';
  const normalizedXId = rawXId ? (parseXUsername(rawXId) ?? rawXId) : '';

  const vrcUrl = mapping.vrc_url >= 0 ? getCell(row, mapping.vrc_url) : '';

  const rawExtra: { key: string; value: string }[] = [];
  if (mapping.extraColumns?.length) {
    for (const e of mapping.extraColumns) {
      rawExtra.push({ key: e.label, value: getCell(row, e.columnIndex) });
    }
  }

  return {
    name,
    x_id: normalizedXId,
    vrc_url: vrcUrl,
    casts,
    preference_mode: preferenceMode,
    raw_extra: rawExtra,
  };
}
