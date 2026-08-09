export class DelimitedParseError extends Error {
  constructor(
    public readonly line: number,
    public readonly column: number,
  ) {
    super(`区切りテキストの${line}行${column}列付近に不正な引用符があります。`);
    this.name = 'DelimitedParseError';
  }
}

type FieldParseState = 'fieldStart' | 'unquoted' | 'quoted' | 'afterQuote';

/** 引用フィールドの開始位置と終了位置を区別し、壊れた引用符を正常データとして扱わない。 */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let state: FieldParseState = 'fieldStart';
  let quotedFieldLine = 1;
  let quotedFieldColumn = 1;
  const len = text.length;
  let i = 0;
  let line = 1;
  let column = 1;

  const finishField = () => {
    row.push(field);
    field = '';
    state = 'fieldStart';
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };
  const consumeNewline = () => {
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else i += 1;
    line += 1;
    column = 1;
  };

  while (i < len) {
    const c = text[i];

    if (state === 'quoted') {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        column += 2;
      } else if (c === '"') {
        state = 'afterQuote';
        i += 1;
        column += 1;
      } else if (c === '\r' || c === '\n') {
        const newline = c === '\r' && text[i + 1] === '\n' ? '\r\n' : c;
        field += newline;
        consumeNewline();
      } else {
        field += c;
        i += 1;
        column += 1;
      }
      continue;
    }

    if (state === 'afterQuote') {
      if (c === delimiter) {
        finishField();
        i += 1;
        column += 1;
      } else if (c === '\r' || c === '\n') {
        finishRow();
        consumeNewline();
      } else {
        throw new DelimitedParseError(line, column);
      }
      continue;
    }

    if (state === 'fieldStart' && c === '"') {
      state = 'quoted';
      quotedFieldLine = line;
      quotedFieldColumn = column;
      i += 1;
      column += 1;
    } else if (c === '"') {
      throw new DelimitedParseError(line, column);
    } else if (c === delimiter) {
      finishField();
      i += 1;
      column += 1;
    } else if (c === '\r' || c === '\n') {
      finishRow();
      consumeNewline();
    } else {
      state = 'unquoted';
      field += c;
      i += 1;
      column += 1;
    }
  }

  if (state === 'quoted') {
    throw new DelimitedParseError(quotedFieldLine, quotedFieldColumn);
  }
  if (field.length > 0 || row.length > 0 || state === 'afterQuote') {
    finishRow();
  }
  return rows;
}

/** TSV 全文を、タブ区切り・改行・ダブルクォート対応で二次元配列に変換する。 */
export function parseTSV(text: string): string[][] {
  return parseDelimited(text, '\t');
}
