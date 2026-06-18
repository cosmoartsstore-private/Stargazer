import {
  getAssignmentsForColumn,
  getCastResultColumnLabel,
  getMatchPreference,
  type CastResultAssignment,
  type CastResultRow,
} from './matching-result-view';

/** キャスト1名分の割り当てを、TSV セルに入れる短い説明へ変換する。 */
function formatCastAssignmentForTsv(assignment: CastResultAssignment): string {
  const preference = getMatchPreference(assignment.match);
  const warning = assignment.match.isNGWarning ? ' / NG' : '';
  return `${assignment.user.name} (${assignment.user.x_id} / ${preference.label}${warning})`;
}

/** キャスト別マッチング結果を、ダウンロード用 TSV の行配列へ変換する。 */
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
