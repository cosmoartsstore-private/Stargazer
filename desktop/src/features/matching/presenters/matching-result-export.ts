import {
  getAssignmentsForColumn,
  getCastResultColumnLabel,
  getMatchPreference,
  type CastResultAssignment,
  type CastResultRow,
} from './matching-result-view';

function formatCastAssignmentForTsv(assignment: CastResultAssignment): string {
  const preference = getMatchPreference(assignment.match);
  const warning = assignment.match.isNGWarning ? ' / NG' : '';
  return `${assignment.user.name} (${assignment.user.x_id} / ${preference.label}${warning})`;
}

export function buildCastMatchingTsvRows(rows: CastResultRow[], columnKeys: Array<number | null>): (string | number)[][] {
  return [
    ['キャスト名', ...columnKeys.map(getCastResultColumnLabel)],
    ...rows.map((row) => [
      row.cast.name,
      ...columnKeys.map((columnKey) =>
        getAssignmentsForColumn(row, columnKey)
          .map(formatCastAssignmentForTsv)
          .join(', '),
      ),
    ]),
  ];
}
