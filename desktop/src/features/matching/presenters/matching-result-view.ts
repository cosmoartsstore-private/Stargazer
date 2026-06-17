import type { CastBean, UserBean } from '@/common/types/entities';
import type { MatchedCast, MatchingFailureReason, TableSlot } from '@/features/matching/logics/matching-io';

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

export function buildResultRows(winners: UserBean[], resultMap: Map<string, MatchedCast[]> | null): ResultRow[] {
  if (!resultMap) {
    return [];
  }
  return winners.map((winner) => ({
    user: winner,
    matches: resultMap.get(winner.x_id) ?? [],
  }));
}

export function buildCastResultRows(rows: ResultRow[], casts: CastBean[]): CastResultRow[] {
  if (rows.length === 0) {
    return [];
  }

  const castByName = new Map(casts.map((cast) => [cast.name, cast]));
  const castOrder = new Map(casts.map((cast, index) => [cast.name, index]));
  const assignmentsByCast = new Map<string, CastResultAssignment[]>();

  rows.forEach(({ user, matches }) => {
    matches.forEach((match) => {
      const current = assignmentsByCast.get(match.cast.name) ?? [];
      current.push({ user, match });
      assignmentsByCast.set(match.cast.name, current);
      if (!castByName.has(match.cast.name)) {
        castByName.set(match.cast.name, match.cast);
      }
    });
  });

  const castNames = new Set<string>();
  casts.filter((cast) => cast.is_present).forEach((cast) => castNames.add(cast.name));
  assignmentsByCast.forEach((_, castName) => castNames.add(castName));

  return [...castNames]
    .sort((left, right) => {
      const leftOrder = castOrder.get(left);
      const rightOrder = castOrder.get(right);
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return left.localeCompare(right, 'ja');
    })
    .map((castName) => ({
      cast: castByName.get(castName) ?? { name: castName, is_present: true },
      assignments: assignmentsByCast.get(castName) ?? [],
    }));
}

export function formatFailureMessage(reason: MatchingFailureReason | undefined): string {
  switch (reason) {
    case 'time-limit':
      return 'マッチングが見つかりませんでした。30秒以内に、NGなしで成立する組み合わせを作成できませんでした。';
    case 'insufficient-capacity':
      return '出勤キャスト数またはテーブル数が不足しているため、有効な割り当てを作れませんでした。';
    case 'invalid-settings':
      return 'マッチング設定に不整合があるため、有効な割り当てを作れませんでした。';
    case 'ng-conflict':
    default:
      return 'NG 条件により有効な割り当てを作れませんでした。設定か対象データを見直してください。';
  }
}

export function getMatchPreference(match: MatchedCast): { label: string; tone: MatchPreferenceTone } {
  if (match.rank === 1) return { label: '第一希望', tone: 'First' };
  if (match.rank === 2) return { label: '第二希望', tone: 'Second' };
  if (match.rank === 3) return { label: '第三希望', tone: 'Third' };
  if (typeof match.score === 'number' && match.score > 0) return { label: '希望', tone: 'Flat' };
  return { label: '希望外', tone: 'Outside' };
}

export function getRotationLabel(rotationIndex: number | null | undefined): string {
  if (typeof rotationIndex !== 'number' || rotationIndex < 0) {
    return 'ローテ未設定';
  }
  return `第${rotationIndex + 1}ローテ`;
}

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

export function getCastResultColumnKeys(rows: ResultRow[]): Array<number | null> {
  const rotationIndexes = collectRotationIndexes(rows);
  return rotationIndexes.length > 0 ? rotationIndexes : [null];
}

export function getCastResultColumnLabel(columnKey: number | null): string {
  return columnKey === null ? '応対する応募者' : getRotationLabel(columnKey);
}

export function getAssignmentsForColumn(row: CastResultRow, columnKey: number | null): CastResultAssignment[] {
  if (columnKey === null) {
    return row.assignments;
  }
  return row.assignments.filter((assignment) => assignment.match.rotationIndex === columnKey);
}

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
