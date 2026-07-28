import rawMessages from './messages.ja.properties?raw';

export type MessageParams = Readonly<Record<string, string | number>>;

const MESSAGE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/;
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const LITERAL_OPEN_BRACE = '\uE000';
const LITERAL_CLOSE_BRACE = '\uE001';

function findSeparator(line: string): number {
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '=' || character === ':') return index;
  }

  return -1;
}

function unescapePropertyValue(value: string): string {
  return value.replace(/\\(n|r|t|\\|=|:)/g, (_, escaped: string) => {
    if (escaped === 'n') return '\n';
    if (escaped === 'r') return '\r';
    if (escaped === 't') return '\t';
    return escaped;
  });
}

/** UTF-8 の文言resourceを検証し、参照用catalogへ変換する。 */
function parseMessages(source: string): ReadonlyMap<string, string> {
  const messages = new Map<string, string>();

  source.split(/\r?\n/).forEach((rawLine, lineIndex) => {
    const line = rawLine.trimStart();
    if (line.length === 0 || line.startsWith('#') || line.startsWith('!')) return;

    const separatorIndex = findSeparator(line);
    if (separatorIndex < 1) {
      throw new Error(`messages.ja.properties:${lineIndex + 1} の形式が不正です。`);
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!MESSAGE_KEY_PATTERN.test(key)) {
      throw new Error(`messages.ja.properties:${lineIndex + 1} のキー「${key}」が不正です。`);
    }
    if (messages.has(key)) {
      throw new Error(`messages.ja.properties:${lineIndex + 1} のキー「${key}」が重複しています。`);
    }

    messages.set(key, unescapePropertyValue(line.slice(separatorIndex + 1)));
  });

  return messages;
}

const messages = parseMessages(rawMessages);

/** 文言キーを解決し、`{name}` 形式の変数を埋め込む。`{{` と `}}` は波括弧として出力する。 */
export function getMsg(key: string, params: MessageParams = {}): string {
  const template = messages.get(key);
  if (template === undefined) throw new Error(`文言キー「${key}」が定義されていません。`);

  const escapedTemplate = template
    .split('{{').join(LITERAL_OPEN_BRACE)
    .split('}}').join(LITERAL_CLOSE_BRACE);
  const resolved = escapedTemplate.replace(PLACEHOLDER_PATTERN, (_, name: string) => {
    if (!(name in params)) {
      throw new Error(`文言キー「${key}」の変数「${name}」が指定されていません。`);
    }
    return String(params[name]);
  });

  return resolved
    .split(LITERAL_OPEN_BRACE).join('{')
    .split(LITERAL_CLOSE_BRACE).join('}');
}
