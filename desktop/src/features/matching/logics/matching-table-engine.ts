import type { CastBean, UserBean } from '@/common/types/entities';
import { shuffleArray } from '@/common/arrayUtils';
import type { MatchedCast, MatchingResult, TableSlot } from './matching-io';
import { getNGReasonForCast, isUserNGForCast } from './ng-judgment';
import {
  assignWithHungarian,
  buildRotation,
  getPreferenceRank,
  getPreferenceScore,
} from './matching-hungarian-engine';

interface TableBasedMatchingInput {
  winners: UserBean[];
  physicalSlots: CastBean[];
  rotationCastPool: CastBean[];
  totalTables: number;
  rotationCount: number;
}

/** 1テーブルの全ローテーションについて、NG排除と同一キャスト重複を点数化する。 */
function scoreTableSlot(
  winner: UserBean,
  rotation: CastBean[][],
  slotIndex: number,
): number {
  let totalScore = 0;
  const seenCastIds = new Set<number>();

  for (let roundIndex = 0; roundIndex < rotation.length; roundIndex += 1) {
    const cast = rotation[roundIndex][slotIndex];
    if (isUserNGForCast(winner, cast) || seenCastIds.has(cast.id)) {
      return Number.NEGATIVE_INFINITY;
    }

    seenCastIds.add(cast.id);
    totalScore += getPreferenceScore(winner, cast);
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
    const score = winner ? getPreferenceScore(winner, cast) : 0;
    const isNGWarning = winner ? isUserNGForCast(winner, cast) : false;
    return {
      cast,
      rank: winner ? getPreferenceRank(winner, cast) : 0,
      rotationIndex: roundIndex,
      score,
      isNGWarning,
      ngReason: isNGWarning ? getNGReasonForCast(cast.name) : null,
    };
  });
}

/** M001/M002 共通の、1テーブル1応募者型マッチング結果を構築する。 */
function runTableBasedMatching(input: TableBasedMatchingInput): MatchingResult {
  const { winners, physicalSlots, rotationCastPool, totalTables, rotationCount } = input;
  const userMap = new Map<string, MatchedCast[]>();

  if (winners.length === 0 || physicalSlots.length === 0 || rotationCastPool.length === 0) {
    return { userMap };
  }

  // 空きキャストも巡回へ含め、物理テーブルに対応するslotだけを割り当て対象にする。
  const rotation = buildRotation(rotationCastPool, rotationCount);
  const { assignment, hasInfeasible } = assignWithHungarian(
    winners.length,
    physicalSlots,
    (winnerIndex, _, slotIndex) =>
      scoreTableSlot(
        winners[winnerIndex],
        rotation,
        slotIndex,
      ),
  );

  if (hasInfeasible) {
    return { userMap: new Map(), ngConflict: true, failureReason: 'ng-conflict' };
  }

  const tableSlots: TableSlot[] = [];
  for (let slotIndex = 0; slotIndex < physicalSlots.length; slotIndex += 1) {
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

/** 1テーブル1応募者型のマッチングを、登録順またはランダム順のキャストで実行する。 */
export function runSingleCastMatching(
  winners: UserBean[],
  allCasts: CastBean[],
  totalTables: number,
  rotationCount: number,
  randomizeCasts: boolean,
): MatchingResult {
  const activeCasts = allCasts.filter((cast) => cast.is_present);
  const userMap = new Map<string, MatchedCast[]>();

  if (winners.length === 0 || activeCasts.length === 0) {
    return { userMap };
  }

  if (winners.length > activeCasts.length || Math.max(1, rotationCount) > activeCasts.length) {
    return { userMap: new Map(), ngConflict: true, failureReason: 'insufficient-capacity' };
  }

  const orderedCasts = randomizeCasts ? shuffleArray(activeCasts) : activeCasts;
  const physicalSlots = orderedCasts.slice(
    0,
    Math.max(winners.length, Math.min(totalTables, activeCasts.length)),
  );
  return runTableBasedMatching({
    winners,
    physicalSlots,
    rotationCastPool: orderedCasts,
    totalTables,
    rotationCount,
  });
}
