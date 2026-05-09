/**
 * マッチング形式の区分コード（仕様 4-1）。
 * 抽選条件で選択する M000～M003。
 */

export const MATCHING_TYPE_CODES = [
  'M001',
  'M002',
  'M003',
] as const;

export type MatchingTypeCode = (typeof MATCHING_TYPE_CODES)[number];

/** プルダウンに表示する区分コード */
export const MATCHING_TYPE_CODES_SELECTABLE: readonly MatchingTypeCode[] = [
  'M001',
  'M002',
  'M003',
];

/** プルダウン用ラベル */
export const MATCHING_TYPE_LABELS: Record<MatchingTypeCode, string> = {
  M001: 'ランダムマッチング',
  M002: 'ローテーションマッチング',
  M003: '多対多ローテーションマッチング',
};

/** ランダム or ローテーション（テーブル数指定型）= M001, M002 */
export function isTableBasedMatching(code: MatchingTypeCode): boolean {
  return code === 'M001' || code === 'M002';
}
