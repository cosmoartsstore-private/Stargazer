const TSV_EXTENSION = '.tsv';
const TSV_MIME_TYPE = 'text/tab-separated-values;charset=utf-8';

type TsvCellValue = string | number | null | undefined;

/** TSV セルとして扱えるように、区切り文字と改行を半角スペースへ置換する。 */
function tsvCell(value: TsvCellValue): string {
  return String(value ?? '').replace(/\t/g, ' ').replace(/[\r\n]+/g, ' ').trim();
}

/** TSV 拡張子で終わらないファイル名には拡張子を補完する。 */
function normalizeTsvFilename(filename: string): string {
  return filename.toLowerCase().endsWith(TSV_EXTENSION) ? filename : `${filename}${TSV_EXTENSION}`;
}

/** UTF-8 BOM なしの TSV Blob を生成する。 */
function createTsvBlob(body: string): Blob {
  return new Blob([body], { type: TSV_MIME_TYPE });
}

/** 二次元配列を UTF-8 BOM なしの TSV 文字列に変換する。 */
function buildTsvContent(rows: TsvCellValue[][]): string {
  const line = (row: TsvCellValue[]) => row.map(tsvCell).join('\t');
  return rows.map(line).join('\r\n');
}

/** TSV を指定ファイル名でダウンロードする。 */
export function downloadTsv(rows: TsvCellValue[][], filename: string): void {
  const body = buildTsvContent(rows);
  const blob = createTsvBlob(body);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = normalizeTsvFilename(filename);
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
