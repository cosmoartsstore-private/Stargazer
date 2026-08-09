import type { CastBean, UserBean } from '@/common/types/entities';
import type { MatchedCast, MatchingResult, TableSlot } from './matching-io';
import { getNGReasonForCast, isUserNGForCast } from './ng-judgment';
import {
  assignWithHungarian,
  buildRotation,
  getPreferenceRank,
  getPreferenceScore,
} from './matching-hungarian-engine';

interface MultipleMatchingParams {
  usersPerTable: number;
  castsPerRotation: number;
  rotationCount: number;
  totalTables?: number;
}

/** 出席キャストを登録順のまま、各テーブルを1ラウンド担当する人数単位に分割する。 */
function buildCastUnits(activeCasts: CastBean[], castsPerRotation: number): CastBean[][] {
  if (activeCasts.length % castsPerRotation !== 0) {
    return [];
  }

  return Array.from({ length: activeCasts.length / castsPerRotation }, (_, index) =>
    activeCasts.slice(index * castsPerRotation, (index + 1) * castsPerRotation),
  );
}

/** 当選順を維持して応募者を1テーブルあたりの人数に分ける。 */
function buildGuestGroups(winners: UserBean[], usersPerTable: number): UserBean[][] {
  if (usersPerTable <= 1) {
    return winners.map((winner) => [winner]);
  }

  return Array.from({ length: Math.ceil(winners.length / usersPerTable) }, (_, index) =>
    winners.slice(index * usersPerTable, (index + 1) * usersPerTable),
  );
}

/** 登録順で作ったキャスト組を各テーブルへ巡回させ、M003の割り当てを構築する。 */
function runGroupRotation(
  winners: UserBean[],
  activeCasts: CastBean[],
  params: Required<Pick<MultipleMatchingParams, 'usersPerTable' | 'castsPerRotation' | 'rotationCount'>> & Pick<MultipleMatchingParams, 'totalTables'>,
): MatchingResult {
  const userMap = new Map<string, MatchedCast[]>();
  const allCastUnits = buildCastUnits(activeCasts, params.castsPerRotation);
  const activeCastIds = new Set(activeCasts.map((cast) => cast.id));
  if (
    allCastUnits.length === 0
    || activeCastIds.size !== activeCasts.length
    || params.rotationCount > allCastUnits.length
  ) {
    return { userMap, ngConflict: true, failureReason: 'invalid-settings' };
  }

  const guestGroups = buildGuestGroups(winners, params.usersPerTable);
  if (params.totalTables !== undefined && params.totalTables < guestGroups.length) {
    return { userMap, ngConflict: true, failureReason: 'invalid-settings' };
  }
  const physicalCastUnits = params.totalTables !== undefined
    ? allCastUnits.slice(0, params.totalTables)
    : allCastUnits;
  if (physicalCastUnits.length < guestGroups.length) {
    return { userMap, ngConflict: true, failureReason: 'insufficient-capacity' };
  }

  // 物理テーブル数で巡回プールを切り詰めない。待機中のキャスト組も後続ラウンドへ入る。
  const rotation = buildRotation(allCastUnits, params.rotationCount);
  const { assignment, hasInfeasible } = assignWithHungarian(
    guestGroups.length,
    physicalCastUnits,
    (groupIndex, _, slotIndex) => {
      const group = guestGroups[groupIndex];
      let totalScore = 0;

      for (let roundIndex = 0; roundIndex < rotation.length; roundIndex += 1) {
        const casts = rotation[roundIndex][slotIndex];
        for (const cast of casts) {
          for (const winner of group) {
            if (isUserNGForCast(winner, cast)) {
              return Number.NEGATIVE_INFINITY;
            }
            totalScore += getPreferenceScore(winner, cast);
          }
        }
      }

      return totalScore;
    },
  );

  if (hasInfeasible) {
    return { userMap, ngConflict: true, failureReason: 'ng-conflict' };
  }

  const tableSlots: TableSlot[] = [];
  const assignedSlotIndexes = new Set(assignment);
  guestGroups.forEach((group, groupIndex) => {
    const slotIndex = assignment[groupIndex];
    const tableIndex = slotIndex + 1;
    const roundCastGroups = rotation.map((round, roundIndex) => ({
      roundIndex,
      casts: round[slotIndex],
    }));

    group.forEach((winner) => {
      const matches = roundCastGroups.flatMap(({ roundIndex, casts }) =>
        casts.map((cast) => {
          const isNGWarning = isUserNGForCast(winner, cast);
          return {
            cast,
            rank: getPreferenceRank(winner, cast),
            rotationIndex: roundIndex,
            score: getPreferenceScore(winner, cast),
            isNGWarning,
            ngReason: isNGWarning ? getNGReasonForCast(cast.name) : null,
          };
        }),
      );
      userMap.set(winner.x_id, matches);
      tableSlots.push({
        user: winner,
        matches,
        tableIndex,
      });
    });

    for (let seatIndex = group.length; seatIndex < params.usersPerTable; seatIndex += 1) {
      tableSlots.push({
        user: null,
        matches: roundCastGroups.flatMap(({ roundIndex, casts }) =>
          casts.map((cast) => ({
            cast,
            rank: 0,
            rotationIndex: roundIndex,
            score: 0,
            isNGWarning: false,
            ngReason: null,
          })),
        ),
        tableIndex,
      });
    }
  });

  // 当日枠として確保した物理テーブルも、担当キャストを含む空きテーブルとして結果へ残す。
  for (let slotIndex = 0; slotIndex < physicalCastUnits.length; slotIndex += 1) {
    if (assignedSlotIndexes.has(slotIndex)) continue;

    const tableIndex = slotIndex + 1;
    for (let seatIndex = 0; seatIndex < params.usersPerTable; seatIndex += 1) {
      tableSlots.push({
        user: null,
        matches: rotation.flatMap((round, roundIndex) =>
          round[slotIndex].map((cast) => ({
            cast,
            rank: 0,
            rotationIndex: roundIndex,
            score: 0,
            isNGWarning: false,
            ngReason: null,
          })),
        ),
        tableIndex,
      });
    }
  }

  tableSlots.sort((left, right) => left.tableIndex - right.tableIndex);

  return { userMap, tableSlots };
}

/** M003のグループ制マッチングを、重複のない決定的なローテーションで実行する。 */
export function runMultipleMatching(
  winners: UserBean[],
  allCasts: CastBean[],
  params: MultipleMatchingParams,
): MatchingResult {
  const activeCasts = allCasts.filter((cast) => cast.is_present);
  const userMap = new Map<string, MatchedCast[]>();
  if (winners.length === 0 || activeCasts.length === 0) {
    return { userMap };
  }

  const normalizedParams = {
    usersPerTable: Math.max(1, params.usersPerTable),
    castsPerRotation: Math.max(1, params.castsPerRotation),
    rotationCount: Math.max(1, params.rotationCount),
    totalTables: params.totalTables,
  };
  return runGroupRotation(winners, activeCasts, normalizedParams);
}
