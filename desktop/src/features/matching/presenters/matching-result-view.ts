import type { CastBean, UserBean } from '@/common/types/entities';
import type { MatchedCast, MatchingFailureReason, TableSlot } from '@/features/matching/logics/matching-io';
import { getMsg } from '@/messages/getMsg';

export interface ResultRow {
  user: UserBean;
  matches: MatchedCast[];
}

export interface CastResultAssignment {
  user: UserBean;
  match: MatchedCast;
}

export interface CastResultRow {
  cast: CastBean;
  assignments: CastResultAssignment[];
}

export type MatchPreferenceTone = 'First' | 'Second' | 'Third' | 'Flat' | 'Outside';

export interface RotationMatchGroup {
  rotationIndex: number | null;
  matches: MatchedCast[];
}

export interface TableSlotGroup {
  tableIndex: number;
  slots: TableSlot[];
}

const UNGROUPED_ROTATION_KEY = -1;

/** 応募者一覧の順序を保って、ユーザー別の結果表示行を作る。 */
export function buildResultRows(winners: UserBean[], resultMap: Map<string, MatchedCast[]> | null): ResultRow[] {
  if (!resultMap) {
    return [];
  }
  return winners.map((winner) => ({
    user: winner,
    matches: resultMap.get(winner.x_id) ?? [],
  }));
}

/** ユーザー別結果をキャスト別に再集計し、キャスト結果表の行を作る。 */
export function buildCastResultRows(rows: ResultRow[], casts: CastBean[]): CastResultRow[] {
  if (rows.length === 0) {
    return [];
  }

  const castById = new Map(casts.map((cast) => [cast.id, cast]));
  const castOrder = new Map(casts.map((cast, index) => [cast.id, index]));
  const assignmentsByCast = new Map<number, CastResultAssignment[]>();

  rows.forEach(({ user, matches }) => {
    matches.forEach((match) => {
      const castId = match.cast.id;
      const current = assignmentsByCast.get(castId) ?? [];
      current.push({ user, match });
      assignmentsByCast.set(castId, current);
      if (!castById.has(castId)) {
        castById.set(castId, match.cast);
      }
    });
  });

  const castIds = new Set<number>();
  casts.filter((cast) => cast.is_present).forEach((cast) => castIds.add(cast.id));
  assignmentsByCast.forEach((_, castId) => castIds.add(castId));

  return [...castIds]
    .sort((left, right) => {
      const leftOrder = castOrder.get(left);
      const rightOrder = castOrder.get(right);
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      const leftName = castById.get(left)?.name ?? '';
      const rightName = castById.get(right)?.name ?? '';
      return leftName.localeCompare(rightName, 'ja') || left - right;
    })
    .map((castId) => ({
      cast: castById.get(castId)!,
      assignments: assignmentsByCast.get(castId) ?? [],
    }));
}

/** マッチング失敗理由を、画面に表示する説明文へ変換する。 */
export function formatFailureMessage(reason: MatchingFailureReason | undefined): string {
  switch (reason) {
    case 'time-limit':
      return getMsg('matchingResultView.timeLimitFailure');
    case 'insufficient-capacity':
      return getMsg('matchingResultView.insufficientCapacityFailure');
    case 'invalid-settings':
      return getMsg('matchingResultView.invalidSettingsFailure');
    case 'ng-conflict':
    default:
      return getMsg('matchingResultView.ngConflictFailure');
  }
}

/** マッチ結果の順位・点数から、表示ラベルと色分け用分類を返す。 */
export function getMatchPreference(match: MatchedCast): { label: string; tone: MatchPreferenceTone } {
  if (match.rank === 1) return { label: getMsg('matchingResultView.firstChoice'), tone: 'First' };
  if (match.rank === 2) return { label: getMsg('matchingResultView.secondChoice'), tone: 'Second' };
  if (match.rank === 3) return { label: getMsg('matchingResultView.thirdChoice'), tone: 'Third' };
  if (typeof match.score === 'number' && match.score > 0) {
    return { label: getMsg('matchingResultView.preferred'), tone: 'Flat' };
  }
  return { label: getMsg('matchingResultView.outsidePreference'), tone: 'Outside' };
}

/** 0-based のローテーション番号を画面用のラベルへ変換する。 */
export function getRotationLabel(rotationIndex: number | null | undefined): string {
  if (typeof rotationIndex !== 'number' || rotationIndex < 0) {
    return getMsg('matchingResultView.rotationNotConfigured');
  }
  return getMsg('matchingResultView.rotationLabel', { number: rotationIndex + 1 });
}

/** ユーザー1名分のマッチ結果をローテーション番号ごとにまとめる。 */
export function groupMatchesByRotation(matches: MatchedCast[]): RotationMatchGroup[] {
  const grouped = new Map<number, MatchedCast[]>();
  matches.forEach((match) => {
    const key = typeof match.rotationIndex === 'number' ? match.rotationIndex : UNGROUPED_ROTATION_KEY;
    const current = grouped.get(key) ?? [];
    current.push(match);
    grouped.set(key, current);
  });

  return [...grouped.entries()]
    .sort((left, right) => {
      if (left[0] === UNGROUPED_ROTATION_KEY) return 1;
      if (right[0] === UNGROUPED_ROTATION_KEY) return -1;
      return left[0] - right[0];
    })
    .map(([rotationIndex, groupMatches]) => ({
      rotationIndex: rotationIndex === UNGROUPED_ROTATION_KEY ? null : rotationIndex,
      matches: groupMatches,
    }));
}

/** 結果全体から、キャスト別表で必要なローテーション列の番号を集める。 */
function collectRotationIndexes(rows: ResultRow[]): number[] {
  const indexes = new Set<number>();
  rows.forEach(({ matches }) => {
    matches.forEach((match) => {
      if (typeof match.rotationIndex === 'number') {
        indexes.add(match.rotationIndex);
      }
    });
  });
  return [...indexes].sort((left, right) => left - right);
}

/** キャスト別表の列キーを、ローテーション別または単一列として返す。 */
export function getCastResultColumnKeys(rows: ResultRow[]): Array<number | null> {
  const rotationIndexes = collectRotationIndexes(rows);
  return rotationIndexes.length > 0 ? rotationIndexes : [null];
}

/** キャスト別表の列キーをヘッダー表示名へ変換する。 */
export function getCastResultColumnLabel(columnKey: number | null): string {
  return columnKey === null
    ? getMsg('matchingResultView.assignedApplicants')
    : getRotationLabel(columnKey);
}

/** キャスト別表の指定列に表示する割り当てだけを抽出する。 */
export function getAssignmentsForColumn(row: CastResultRow, columnKey: number | null): CastResultAssignment[] {
  if (columnKey === null) {
    return row.assignments;
  }
  return row.assignments.filter((assignment) => assignment.match.rotationIndex === columnKey);
}

/** マッチング形式ごとのスロットを、表示用にテーブル番号ごとへまとめる。 */
export function groupTableSlots(tableSlots: TableSlot[] | undefined): TableSlotGroup[] {
  if (!tableSlots || tableSlots.length === 0) {
    return [];
  }

  const grouped = new Map<number, TableSlot[]>();
  tableSlots.forEach((slot, index) => {
    const tableIndex = slot.tableIndex ?? index + 1;
    const current = grouped.get(tableIndex) ?? [];
    current.push(slot);
    grouped.set(tableIndex, current);
  });

  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([tableIndex, slots]) => ({ tableIndex, slots }));
}
