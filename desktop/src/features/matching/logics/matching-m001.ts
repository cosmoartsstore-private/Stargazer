import type { CastBean, UserBean } from '@/common/types/entities';
import type { NGJudgmentType, NGMatchingBehavior } from '@/features/matching/types/matching-system-types';
import type { MatchedCast, MatchingResult, TableSlot } from './matching-io';
import { isUserNGForCast } from './ng-judgment';
import { assignWithHungarian, buildRotation, getPreferenceScore, shuffleArray } from './matching-hungarian-engine';

export function runRandomMatching(
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

  const baseSlots = shuffleArray(activeCasts).slice(0, Math.max(winners.length, Math.min(totalTables, activeCasts.length)));
  const rotation = buildRotation(baseSlots, rotationCount);

  const { assignment, hasInfeasible } = assignWithHungarian(
    winners.length,
    baseSlots,
    (winnerIndex, _, slotIndex) => {
      const winner = winners[winnerIndex];
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
    },
  );

  if (hasInfeasible) {
    return { userMap: new Map(), ngConflict: true, failureReason: 'ng-conflict' };
  }

  const tableSlots: TableSlot[] = [];
  for (let slotIndex = 0; slotIndex < baseSlots.length; slotIndex += 1) {
    const winnerIndex = assignment.indexOf(slotIndex);
    const winner = winnerIndex >= 0 ? winners[winnerIndex] : null;
    const matches = rotation.map((round) => {
      const cast = round[slotIndex];
      const rankIndex = winner ? winner.casts.indexOf(cast.name) : -1;
      return {
        cast,
        rank: rankIndex >= 0 && rankIndex < 3 ? rankIndex + 1 : 0,
      };
    });

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
