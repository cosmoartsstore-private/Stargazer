import type { CastBean, UserBean } from '@/common/types/entities';
import { shuffleArray } from '@/common/arrayUtils';
import type { MatchedCast, MatchingResult, TableSlot } from './matching-io';
import { isUserNGForCast } from './ng-judgment';
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
  searchTimeLimitMs?: number;
  relaxedAfterMs?: number;
  searchMode?: 'efficiency' | 'quality';
}

/**
 * ランダム探索には収束保証がないため30秒で打ち切る。効率優先では最初の10秒だけ
 * 平均50点以上を求め、その後は実行可能解を優先して画面の待機時間を制限する。
 * これらはアルゴリズムから導出される値ではなく、応答時間を決める運用既定値である。
 */
const DEFAULT_SEARCH_TIME_LIMIT_MS = 30_000;
const DEFAULT_RELAXED_AFTER_MS = 10_000;
const STRICT_MIN_AVERAGE_SCORE = 50;

/** 出勤キャストを1ローテーションあたりの人数単位に分割する。 */
function buildCastUnits(activeCasts: CastBean[], castsPerRotation: number): CastBean[][] {
  if (activeCasts.length % castsPerRotation !== 0) {
    return [];
  }

  const shuffled = shuffleArray(activeCasts);
  return Array.from({ length: activeCasts.length / castsPerRotation }, (_, index) =>
    shuffled.slice(index * castsPerRotation, (index + 1) * castsPerRotation),
  );
}

/** 応募者を1テーブルあたりの人数に分け、探索単位のゲストグループを作る。 */
function buildGuestGroups(winners: UserBean[], usersPerTable: number): UserBean[][] {
  if (usersPerTable <= 1) {
    return shuffleArray(winners).map((winner) => [winner]);
  }

  const shuffled = shuffleArray(winners);
  return Array.from({ length: Math.ceil(shuffled.length / usersPerTable) }, (_, index) =>
    shuffled.slice(index * usersPerTable, (index + 1) * usersPerTable),
  );
}

/** ランダム化したキャスト単位とゲストグループで、M003 の1回分の割り当てを試行する。 */
function runSingleAttempt(
  winners: UserBean[],
  activeCasts: CastBean[],
  params: Required<Pick<MultipleMatchingParams, 'usersPerTable' | 'castsPerRotation' | 'rotationCount'>> & Pick<MultipleMatchingParams, 'totalTables'>,
): MatchingResult {
  const userMap = new Map<string, MatchedCast[]>();
  const allCastUnits = buildCastUnits(activeCasts, params.castsPerRotation);
  if (allCastUnits.length === 0) {
    return { userMap, ngConflict: true, failureReason: 'invalid-settings' };
  }

  const guestGroups = buildGuestGroups(winners, params.usersPerTable);
  if (params.totalTables !== undefined && params.totalTables < guestGroups.length) {
    return { userMap, ngConflict: true, failureReason: 'invalid-settings' };
  }
  const castUnits = params.totalTables !== undefined
    ? allCastUnits.slice(0, params.totalTables)
    : allCastUnits;
  if (castUnits.length < guestGroups.length) {
    return { userMap, ngConflict: true, failureReason: 'insufficient-capacity' };
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
  guestGroups.forEach((group, groupIndex) => {
    const slotIndex = assignment[groupIndex];
    const tableIndex = slotIndex + 1;
    const roundCastGroups = rotation.map((round, roundIndex) => ({
      roundIndex,
      casts: round[slotIndex],
    }));

    group.forEach((winner) => {
      const matches = roundCastGroups.flatMap(({ roundIndex, casts }) =>
        casts.map((cast) => ({
          cast,
          rank: getPreferenceRank(winner, cast),
          rotationIndex: roundIndex,
          score: getPreferenceScore(winner, cast),
        })),
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
          casts.map((cast) => ({ cast, rank: 0, rotationIndex: roundIndex })),
        ),
        tableIndex,
      });
    }
  });

  return { userMap, tableSlots };
}

/** 試行結果の全マッチ点数から、探索中の候補比較に使う平均点を算出する。 */
function calculateAverageScore(result: MatchingResult): number {
  let totalScore = 0;
  let matchCount = 0;

  result.userMap.forEach((matches) => {
    matches.forEach((match) => {
      totalScore += match.score ?? 0;
      matchCount += 1;
    });
  });

  return matchCount > 0 ? totalScore / matchCount : 0;
}

/** M003 のグループ制マッチングを、時間制限内で複数試行して最良候補を返す。 */
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
  const timeLimitMs = Math.max(1, params.searchTimeLimitMs ?? DEFAULT_SEARCH_TIME_LIMIT_MS);
  const relaxedAfterMs = Math.max(0, Math.min(params.relaxedAfterMs ?? DEFAULT_RELAXED_AFTER_MS, timeLimitMs));
  const searchMode = params.searchMode ?? 'efficiency';
  const startedAt = Date.now();
  let lastFailure: MatchingResult = { userMap, ngConflict: true, failureReason: 'time-limit' };
  let bestResult: MatchingResult | null = null;
  let bestAverageScore = Number.NEGATIVE_INFINITY;

  do {
    const elapsedMs = Date.now() - startedAt;
    const result = runSingleAttempt(
      winners,
      activeCasts,
      normalizedParams,
    );

    if (!result.ngConflict) {
      const scoredResult = result;
      const averageScore = calculateAverageScore(scoredResult);
      if (averageScore > bestAverageScore) {
        bestResult = scoredResult;
        bestAverageScore = averageScore;
      }

      if (searchMode === 'efficiency') {
        const isRelaxed = elapsedMs >= relaxedAfterMs;
        if (isRelaxed || averageScore >= STRICT_MIN_AVERAGE_SCORE) {
          return scoredResult;
        }
      }
    } else {
      lastFailure = result;
      if (result.failureReason === 'invalid-settings' || result.failureReason === 'insufficient-capacity') {
        return result;
      }
    }
  } while (Date.now() - startedAt < timeLimitMs);

  if (bestResult) {
    return bestResult;
  }

  return { userMap, ngConflict: true, failureReason: lastFailure.failureReason === 'ng-conflict' ? 'time-limit' : lastFailure.failureReason };
}
