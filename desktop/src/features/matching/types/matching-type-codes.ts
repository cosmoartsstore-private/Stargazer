import { getMsg } from '@/messages/getMsg';
import type { MatchingTypeCode } from '@/common/types/sessionWorkflow';

export {
  MATCHING_TYPE_CODES,
  type MatchingTypeCode,
} from '@/common/types/sessionWorkflow';

/**
 * マッチング形式の区分コード（仕様 4-1）。
 * 抽選条件で選択する M000～M003。
 */

/** プルダウン用ラベル */
export const MATCHING_TYPE_LABELS: Record<MatchingTypeCode, string> = {
  M000: getMsg('matchingTypeCodes.lotteryOnly'),
  M001: getMsg('matchingTypeCodes.random'),
  M002: getMsg('matchingTypeCodes.rotation'),
  M003: getMsg('matchingTypeCodes.groupMatching'),
};

/** サマリーカード用の短縮ラベル */
export const MATCHING_TYPE_SUMMARY_LABELS: Record<MatchingTypeCode, string> = {
  M000: getMsg('matchingTypeCodes.lotteryOnlySummary'),
  M001: getMsg('matchingTypeCodes.random'),
  M002: getMsg('matchingTypeCodes.rotation'),
  M003: getMsg('matchingTypeCodes.groupSummary'),
};

/** ランダム or ローテーション（テーブル数指定型）= M001, M002 */
export function isTableBasedMatching(code: MatchingTypeCode): boolean {
  return code === 'M001' || code === 'M002';
}
