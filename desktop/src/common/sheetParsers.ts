import type { UserBean } from './types/entities';
import type { ColumnMapping } from './importFormat';
import { parseXUsername } from './xIdUtils';

function getCell(row: unknown[] | null | undefined, colIndex: number): string {
  if (row == null || !Array.isArray(row) || colIndex < 0 || colIndex >= row.length) return '';
  return (row[colIndex] ?? '').toString().trim();
}

/** カラムマッピングに従って1行を UserBean に変換する（テンプレート／カスタム用） */
export function mapRowToUserBeanWithMapping(
  row: unknown[],
  mapping: ColumnMapping,
): UserBean {
  let casts: string[];
  let preferenceMode: UserBean['preference_mode'] = 'ranked';
  const useSplitComma = mapping.castInputType === 'multiple' && mapping.cast1 >= 0;

  if (useSplitComma) {
    preferenceMode = 'flat';
    const cast1Val = getCell(row, mapping.cast1);
    if (!cast1Val) {
      casts = [];
    } else {
      // 順位なし希望には件数上限を設けず、同じ名称の重複だけを先頭の1件へまとめる。
      const seenCastNames = new Set<string>();
      casts = cast1Val
        .split(',')
        .map((s) => s.trim())
        .filter((castName) => {
          if (!castName || seenCastNames.has(castName)) return false;
          seenCastNames.add(castName);
          return true;
        });
    }
  } else {
    const c1 = mapping.cast1 >= 0 ? getCell(row, mapping.cast1) : '';
    const c2 = mapping.cast2 >= 0 ? getCell(row, mapping.cast2) : '';
    const c3 = mapping.cast3 >= 0 ? getCell(row, mapping.cast3) : '';
    casts = [c1, c2, c3];
    while (casts.length < 3) casts.push('');
  }

  const name = mapping.name >= 0 ? getCell(row, mapping.name) : '';

  const rawXId = mapping.x_id >= 0 ? getCell(row, mapping.x_id) : '';
  // 有効なX IDは内部表現のusernameへ統一し、形式不正値は利用者が確認できるよう残す。
  const normalizedXId = rawXId ? (parseXUsername(rawXId) ?? rawXId) : '';

  // VRChat URLは利用者が内容を判断する参照値として保持し、形式検証や補正は行わない。
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
