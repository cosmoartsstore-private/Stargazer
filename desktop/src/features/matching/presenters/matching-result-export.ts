import {
  getAssignmentsForColumn,
  getCastResultColumnLabel,
  getMatchPreference,
  type CastResultAssignment,
  type CastResultRow,
} from './matching-result-view';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import { getMsg } from '@/messages/getMsg';
import { toPng } from 'html-to-image';

// 高DPI変換時の端数丸めで最終行・右端が欠けないよう、出力境界に余白を加える。
const PNG_EDGE_SAFETY_PX = 4;

function parsePixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 表示中の結果要素を高解像度PNGとして保存する。 */
export async function exportElementAsPng(node: HTMLElement | null, filename: string): Promise<void> {
  if (!node) return;

  // スクロール領域の実寸を指定し、画面外の列も複製後の画像へ含める。
  const computedStyle = window.getComputedStyle(node);
  const width = Math.ceil(
    Math.max(node.clientWidth, node.scrollWidth)
      + parsePixelValue(computedStyle.borderLeftWidth)
      + parsePixelValue(computedStyle.borderRightWidth)
      + PNG_EDGE_SAFETY_PX,
  );
  const height = Math.ceil(
    Math.max(node.clientHeight, node.scrollHeight)
      + parsePixelValue(computedStyle.borderTopWidth)
      + parsePixelValue(computedStyle.borderBottomWidth)
      + PNG_EDGE_SAFETY_PX,
  );
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    width,
    height,
    style: {
      boxSizing: 'border-box',
      overflow: 'hidden',
    },
  });
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
    xId: formatXAccountIdForDisplay(assignment.user.x_id),
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
