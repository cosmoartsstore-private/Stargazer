const HEADER_SIGNATURE_DELIMITER = '|';

/** ヘッダー列名をテンプレート照合用の比較文字列へ正規化する。 */
function normalizeHeaderColumn(column: string): string {
  return column.trim().toLowerCase();
}

/**
 * CSV ヘッダー配列から header_templates 照合用の安定した signature を生成する。
 *
 * 前後空白と大文字小文字の差を吸収し、空の列名を除外して同じ列構成なら同じ signature になるようにする。
 */
export function computeHeaderSignature(columns: string[]): string {
  return columns
    .map(normalizeHeaderColumn)
    .filter((column) => column.length > 0)
    .join(HEADER_SIGNATURE_DELIMITER);
}
