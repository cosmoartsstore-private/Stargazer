/** 区切り文字、改行、ダブルクォートを扱う最小限の delimited text パーサ。 */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const len = text.length;
  let i = 0;
  while (i < len) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (c === delimiter && !inQuotes) {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r' && i + 1 < len && text[i + 1] === '\n' && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 2;
    } else if (c === '\n' && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (c === '\r' && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** TSV 全文を、タブ区切り・改行・ダブルクォート対応で二次元配列に変換する。 */
export function parseTSV(text: string): string[][] {
  return parseDelimited(text, '\t');
}
