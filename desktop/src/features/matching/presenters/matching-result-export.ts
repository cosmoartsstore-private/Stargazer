import {
  getAssignmentsForColumn,
  getCastResultColumnLabel,
  getMatchPreference,
  type CastResultAssignment,
  type CastResultRow,
} from './matching-result-view';
import { getMsg } from '@/messages/getMsg';
import { toPng } from 'html-to-image';

/** 表示中の結果要素を高解像度PNGとして保存する。 */
export async function exportElementAsPng(node: HTMLElement | null, filename: string): Promise<void> {
  if (!node) return;
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  anchor.click();
}

/** キャスト1名分の割り当てを、TSV セルに入れる短い説明へ変換する。 */
function formatCastAssignmentForTsv(assignment: CastResultAssignment): string {
  const preference = getMatchPreference(assignment.match);
  const messageKey = assignment.match.isNGWarning
    ? 'matchingResultExport.assignmentWithNg'
    : 'matchingResultExport.assignment';
  return getMsg(messageKey, {
    applicantName: assignment.user.name,
    xId: assignment.user.x_id,
    preference: preference.label,
  });
}

/** キャスト別マッチング結果を、ダウンロード用 TSV の行配列へ変換する。 */
export function buildCastMatchingTsvRows(rows: CastResultRow[], columnKeys: Array<number | null>): (string | number)[][] {
  return [
    [getMsg('matchingResultExport.castNameHeader'), ...columnKeys.map(getCastResultColumnLabel)],
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
