import type { CastBean, UserBean } from '@/common/types/entities';
import type { NGJudgmentType, NGMatchingBehavior } from '@/features/matching/types/matching-system-types';
import type { MatchedCast, MatchingResult, TableSlot } from './matching-io';
import { isUserNGForCast } from './ng-judgment';
import { assignWithHungarian, buildRotation, getPreferenceScore } from './matching-hungarian-engine';

interface TableBasedMatchingInput {
  winners: UserBean[];
  baseSlots: CastBean[];
  totalTables: number;
  rotationCount: number;
  ngJudgmentType: NGJudgmentType;
  ngMatchingBehavior: NGMatchingBehavior;
}

/** 希望順位の表示値を、順不同希望では順位なしとして算出する。 */
function getRankForCast(winner: UserBean, castName: string): number {
  const rankIndex = winner.casts.indexOf(castName);
  return winner.preference_mode !== 'flat' && rankIndex >= 0 && rankIndex < 3 ? rankIndex + 1 : 0;
}

/** 1テーブルの全ローテーションについて、NG排除と同一キャスト重複を点数化する。 */
function scoreTableSlot(
  winner: UserBean,
  rotation: CastBean[][],
  slotIndex: number,
  ngJudgmentType: NGJudgmentType,
  ngMatchingBehavior: NGMatchingBehavior,
): number {
  let totalScore = 0;
  const seenCastNames = new Set<string>();

  for (let roundIndex = 0; roundIndex < rotation.length; roundIndex += 1) {
    const cast = rotation[roundIndex][slotIndex];
    const shouldExclude =
      ngMatchingBehavior === 'exclude' && isUserNGForCast(winner, cast, ngJudgmentType);
    if (shouldExclude || seenCastNames.has(cast.name)) {
      return Number.NEGATIVE_INFINITY;
    }

    seenCastNames.add(cast.name);
    totalScore += getPreferenceScore(winner, cast.name);
  }

  return totalScore;
}

/** 割り当て済みユーザーに対して、画面表示と集計で使うマッチ一覧を構築する。 */
function buildSlotMatches(
  winner: UserBean | null,
  rotation: CastBean[][],
  slotIndex: number,
): MatchedCast[] {
  return rotation.map((round, roundIndex) => {
    const cast = round[slotIndex];
    return {
      cast,
      rank: winner ? getRankForCast(winner, cast.name) : 0,
      rotationIndex: roundIndex,
    };
  });
}

/** M001/M002 共通の、1テーブル1応募者型マッチング結果を構築する。 */
export function runTableBasedMatching(input: TableBasedMatchingInput): MatchingResult {
  const { winners, baseSlots, totalTables, rotationCount, ngJudgmentType, ngMatchingBehavior } = input;
  const userMap = new Map<string, MatchedCast[]>();

  if (winners.length === 0 || baseSlots.length === 0) {
    return { userMap };
  }

  const rotation = buildRotation(baseSlots, rotationCount);
  const { assignment, hasInfeasible } = assignWithHungarian(
    winners.length,
    baseSlots,
    (winnerIndex, _, slotIndex) =>
      scoreTableSlot(
        winners[winnerIndex],
        rotation,
        slotIndex,
        ngJudgmentType,
        ngMatchingBehavior,
      ),
  );

  if (hasInfeasible) {
    return { userMap: new Map(), ngConflict: true, failureReason: 'ng-conflict' };
  }

  const tableSlots: TableSlot[] = [];
  for (let slotIndex = 0; slotIndex < baseSlots.length; slotIndex += 1) {
    const winnerIndex = assignment.indexOf(slotIndex);
    const winner = winnerIndex >= 0 ? winners[winnerIndex] : null;
    const matches = buildSlotMatches(winner, rotation, slotIndex);

    if (winner) {
      userMap.set(winner.x_id, matches);
    }

    tableSlots.push({
      user: winner,
      matches,
      tableIndex: slotIndex + 1,
    });
  }

  for (let index = tableSlots.length; index < totalTables; index += 1) {
    tableSlots.push({ user: null, matches: [], tableIndex: index + 1 });
  }

  return { userMap, tableSlots };
}
