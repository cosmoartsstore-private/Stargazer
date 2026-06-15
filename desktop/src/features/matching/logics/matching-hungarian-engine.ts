import type { UserBean } from '@/common/types/entities';
import munkres from 'munkres-js';

const INF = 1e9;

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

export const PREFERENCE_WEIGHTS: Readonly<Record<number, number>> = {
  1: 90,
  2: 70,
  3: 50,
};

export function getPreferenceScore(user: UserBean, castName: string): number {
  if (!Array.isArray(user.casts) || user.casts.length === 0) {
    return 0;
  }

  const prefIndex = user.casts.indexOf(castName);
  if (prefIndex < 0) {
    return 0;
  }

  if (user.preference_mode === 'flat') {
    return 50;
  }

  return PREFERENCE_WEIGHTS[prefIndex + 1] ?? 0;
}

export function shuffleArray<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function buildRotation<T>(base: readonly T[], numRounds: number): T[][] {
  const roundCount = Math.max(1, numRounds);
  return Array.from({ length: roundCount }, (_, roundIndex) =>
    Array.from({ length: base.length }, (_, slotIndex) => base[(slotIndex + roundIndex) % base.length]),
  );
}

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
