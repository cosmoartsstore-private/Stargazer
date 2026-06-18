import type { CastBean, UserBean } from '@/common/types/entities';
import type { NGJudgmentType, NGMatchingBehavior } from '@/features/matching/types/matching-system-types';
import type { MatchedCast, MatchingResult } from './matching-io';
import { runTableBasedMatching } from './matching-table-engine';

/** 出勤キャストの登録順を保ち、1テーブル1応募者型のローテーションマッチングを実行する。 */
export function runRotationMatching(
  winners: UserBean[],
  allCasts: CastBean[],
  totalTables: number,
  rotationCount: number,
  ngJudgmentType: NGJudgmentType,
  ngMatchingBehavior: NGMatchingBehavior,
): MatchingResult {
  const activeCasts = allCasts.filter((cast) => cast.is_present);
  const userMap = new Map<string, MatchedCast[]>();

  if (winners.length === 0 || activeCasts.length === 0) {
    return { userMap };
  }

  if (winners.length > activeCasts.length || Math.max(1, rotationCount) > activeCasts.length) {
    return { userMap: new Map(), ngConflict: true, failureReason: 'insufficient-capacity' };
  }

  const baseSlots = activeCasts.slice(0, Math.max(winners.length, Math.min(totalTables, activeCasts.length)));
  return runTableBasedMatching({
    winners,
    baseSlots,
    totalTables,
    rotationCount,
    ngJudgmentType,
    ngMatchingBehavior,
  });
}
