import type { CastBean, UserBean } from '@/common/types/entities';
import type { NGJudgmentType, NGMatchingBehavior } from '@/features/matching/types/matching-system-types';
import type { MatchedCast, MatchingResult, TableSlot } from './matching-io';
import { isUserNGForCast } from './ng-judgment';
import { assignWithHungarian, getPreferenceScore, shuffleArray } from './matching-hungarian-engine';

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

  const seenPairs = new Map<string, Set<string>>();
  winners.forEach((winner) => {
    userMap.set(winner.x_id, []);
    seenPairs.set(winner.x_id, new Set());
  });

  for (let roundIndex = 0; roundIndex < Math.max(1, rotationCount); roundIndex += 1) {
    const shuffledSlots = shuffleArray(activeCasts);
    const { assignment, hasInfeasible } = assignWithHungarian(
      winners.length,
      shuffledSlots,
      (winnerIndex, cast) => {
        const winner = winners[winnerIndex];
        const shouldExclude =
          ngMatchingBehavior === 'exclude' && isUserNGForCast(winner, cast, ngJudgmentType);
        if (shouldExclude) {
          return Number.NEGATIVE_INFINITY;
        }

        if (seenPairs.get(winner.x_id)?.has(cast.name)) {
          return Number.NEGATIVE_INFINITY;
        }

        return getPreferenceScore(winner, cast.name);
      },
    );

    if (hasInfeasible) {
      return { userMap: new Map(), ngConflict: true };
    }

    assignment.forEach((slotIndex, winnerIndex) => {
      const winner = winners[winnerIndex];
      const cast = shuffledSlots[slotIndex];
      const rankIndex = winner.casts.indexOf(cast.name);
      const history = userMap.get(winner.x_id) ?? [];
      history.push({
        cast,
        rank: rankIndex >= 0 && rankIndex < 3 ? rankIndex + 1 : 0,
      });
      userMap.set(winner.x_id, history);
      seenPairs.get(winner.x_id)?.add(cast.name);
    });
  }

  const tableSlots: TableSlot[] = winners.map((winner) => ({
    user: winner,
    matches: userMap.get(winner.x_id) ?? [],
  }));

  for (let index = tableSlots.length; index < totalTables; index += 1) {
    tableSlots.push({ user: null, matches: [] });
  }

  return { userMap, tableSlots };
}
