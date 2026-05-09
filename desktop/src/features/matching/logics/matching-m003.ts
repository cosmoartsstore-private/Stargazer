import type { CastBean, UserBean } from '@/common/types/entities';
import type { NGJudgmentType, NGMatchingBehavior } from '@/features/matching/types/matching-system-types';
import type { MatchedCast, MatchingResult, TableSlot } from './matching-io';
import { isUserNGForCast } from './ng-judgment';
import { assignWithHungarian, buildRotation, getPreferenceScore, shuffleArray } from './matching-hungarian-engine';

export interface MultipleMatchingParams {
  usersPerTable: number;
  castsPerRotation: number;
  rotationCount: number;
  totalTables?: number;
}

function buildCastUnits(activeCasts: CastBean[], castsPerRotation: number): CastBean[][] {
  if (activeCasts.length % castsPerRotation !== 0) {
    return [];
  }

  const shuffled = shuffleArray(activeCasts);
  return Array.from({ length: activeCasts.length / castsPerRotation }, (_, index) =>
    shuffled.slice(index * castsPerRotation, (index + 1) * castsPerRotation),
  );
}

function buildGuestGroups(winners: UserBean[], usersPerTable: number): UserBean[][] {
  if (usersPerTable <= 1) {
    return winners.map((winner) => [winner]);
  }

  const shuffled = shuffleArray(winners);
  return Array.from({ length: Math.ceil(shuffled.length / usersPerTable) }, (_, index) =>
    shuffled.slice(index * usersPerTable, (index + 1) * usersPerTable),
  );
}

export function runMultipleMatching(
  winners: UserBean[],
  allCasts: CastBean[],
  params: MultipleMatchingParams,
  ngJudgmentType: NGJudgmentType,
  ngMatchingBehavior: NGMatchingBehavior,
): MatchingResult {
  const activeCasts = allCasts.filter((cast) => cast.is_present);
  const userMap = new Map<string, MatchedCast[]>();
  if (winners.length === 0 || activeCasts.length === 0) {
    return { userMap };
  }

  const usersPerTable = Math.max(1, params.usersPerTable);
  const castsPerRotation = Math.max(1, params.castsPerRotation);
  const castUnits = buildCastUnits(activeCasts, castsPerRotation);
  if (castUnits.length === 0) {
    return { userMap, ngConflict: true };
  }

  const guestGroups = buildGuestGroups(winners, usersPerTable);
  const requiredTableCount = Math.max(guestGroups.length, params.totalTables ?? 0);
  if (castUnits.length < requiredTableCount) {
    return { userMap, ngConflict: true };
  }

  while (guestGroups.length < requiredTableCount) {
    guestGroups.push([]);
  }

  const rotation = buildRotation(castUnits, params.rotationCount);
  const { assignment, hasInfeasible } = assignWithHungarian(
    guestGroups.length,
    castUnits,
    (groupIndex, _, slotIndex) => {
      const group = guestGroups[groupIndex];
      let totalScore = 0;

      for (let roundIndex = 0; roundIndex < rotation.length; roundIndex += 1) {
        const casts = rotation[roundIndex][slotIndex];
        for (const cast of casts) {
          for (const winner of group) {
            const shouldExclude =
              ngMatchingBehavior === 'exclude' && isUserNGForCast(winner, cast, ngJudgmentType);
            if (shouldExclude) {
              return Number.NEGATIVE_INFINITY;
            }
            totalScore += getPreferenceScore(winner, cast.name);
          }
        }
      }

      return totalScore;
    },
  );

  if (hasInfeasible) {
    return { userMap, ngConflict: true };
  }

  const tableSlots: TableSlot[] = [];
  guestGroups.forEach((group, groupIndex) => {
    const slotIndex = assignment[groupIndex];
    const tableIndex = groupIndex + 1;
    const roundCasts = rotation.flatMap((round) => round[slotIndex]);

    group.forEach((winner) => {
      const matches = roundCasts.map((cast) => {
        const rankIndex = winner.casts.indexOf(cast.name);
        return {
          cast,
          rank: rankIndex >= 0 && rankIndex < 3 ? rankIndex + 1 : 0,
        };
      });
      userMap.set(winner.x_id, matches);
      tableSlots.push({
        user: winner,
        matches,
        tableIndex,
      });
    });

    for (let seatIndex = group.length; seatIndex < usersPerTable; seatIndex += 1) {
      tableSlots.push({
        user: null,
        matches: roundCasts.map((cast) => ({ cast, rank: 0 })),
        tableIndex,
      });
    }
  });

  return { userMap, tableSlots };
}
