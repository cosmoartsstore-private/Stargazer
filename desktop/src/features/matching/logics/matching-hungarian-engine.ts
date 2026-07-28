import type { CastBean, UserBean } from '@/common/types/entities';
import { getCastPreferenceIndex } from '@/common/castReferences';
import munkres from 'munkres-js';

const INF = 1e9;

/** スコア最大化問題を、munkres-js が解くコスト最小化問題へ変換して割り当てる。 */
function hungarianAssign(scoreMatrix: number[][]): number[] {
  const n = scoreMatrix.length;
  if (n === 0) return [];
  const costMatrix = scoreMatrix.map((row) =>
    row.map((s) => (s <= -INF ? INF : -s)),
  );
  const pairs = munkres(costMatrix);
  const assignment = new Array<number>(n).fill(-1);
  for (const [r, c] of pairs) {
    assignment[r] = c;
  }
  return assignment;
}

const PREFERENCE_WEIGHTS: Readonly<Record<number, number>> = {
  1: 90,
  2: 70,
  3: 50,
};

/** 画面表示用の希望順位を、順不同希望では順位なしとして算出する。 */
export function getPreferenceRank(user: UserBean, cast: CastBean): number {
  const preferenceIndex = getCastPreferenceIndex(user, cast);
  return user.preference_mode !== 'flat' && preferenceIndex >= 0 && preferenceIndex < 3
    ? preferenceIndex + 1
    : 0;
}

/** 応募者の希望順位と希望モードから、キャスト1名分の評価点を算出する。 */
export function getPreferenceScore(user: UserBean, cast: CastBean): number {
  if (!Array.isArray(user.casts) || user.casts.length === 0) {
    return 0;
  }

  const prefIndex = getCastPreferenceIndex(user, cast);
  if (prefIndex < 0) {
    return 0;
  }

  if (user.preference_mode === 'flat') {
    return 50;
  }

  return PREFERENCE_WEIGHTS[prefIndex + 1] ?? 0;
}

/** 先頭スロットを1つずつずらし、ローテーションごとの巡回表を構築する。 */
export function buildRotation<T>(base: readonly T[], numRounds: number): T[][] {
  const roundCount = Math.max(1, numRounds);
  return Array.from({ length: roundCount }, (_, roundIndex) =>
    Array.from({ length: base.length }, (_, slotIndex) => base[(slotIndex + roundIndex) % base.length]),
  );
}

/** 任意のスロット評価関数を使い、各行に最も総得点が高いスロットを割り当てる。 */
export function assignWithHungarian<TSlot>(
  rowCount: number,
  slots: readonly TSlot[],
  scoreFor: (rowIndex: number, slot: TSlot, slotIndex: number) => number,
): { assignment: number[]; hasInfeasible: boolean } {
  if (rowCount === 0 || slots.length === 0) {
    return { assignment: [], hasInfeasible: false };
  }

  const scoreMatrix = Array.from({ length: rowCount }, (_, rowIndex) =>
    slots.map((slot, slotIndex) => scoreFor(rowIndex, slot, slotIndex)),
  );

  const assignment = hungarianAssign(scoreMatrix);
  const hasInfeasible = assignment.some((slotIndex, rowIndex) => {
    if (slotIndex < 0 || slotIndex >= slots.length) {
      return true;
    }
    return scoreMatrix[rowIndex][slotIndex] <= -INF;
  });

  return { assignment, hasInfeasible };
}
