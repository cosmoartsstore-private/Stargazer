/**
 * X（旧Twitter）ID / URL のパース用ユーティリティ。
 */

/**
 * 入力文字列（URL または @username / username）から X のユーザー名を抽出する。
 * @returns ユーザー名。抽出できない場合は null
 */
export function parseXUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('@')) {
    const rest = trimmed.slice(1).trim();
    return rest ? rest : null;
  }

  const urlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([^/?#]+)/i);
  if (urlMatch) return urlMatch[1];

  if (trimmed.includes('/') || trimmed.includes('.') || trimmed.startsWith('http')) {
    return null;
  }

  return trimmed;
}

/** X ID またはプロフィール URL を、入力時の大文字小文字を保った @username 形式へ整える。 */
export function formatXAccountId(input: string): string | null {
  const username = parseXUsername(input);
  if (!username) return null;
  return username.startsWith('@') ? username : `@${username}`;
}

/** X IDを大小文字を区別せず照合するための比較キーを返す。 */
export function normalizeXAccountId(input: string): string | null {
  return formatXAccountId(input)?.toLowerCase() ?? null;
}

export interface XIdRowIdentity {
  rowNumber: number;
  xId: string;
}

export type XIdIdentityIssueKind = 'empty' | 'duplicate';

export interface XIdIdentityIssue extends XIdRowIdentity {
  kind: XIdIdentityIssueKind;
}

/**
 * 空の X ID と、前後空白・大文字小文字を正規化すると重複する X ID を返す。
 * X のアカウント識別では大文字小文字を区別しないため、比較時だけ小文字へ統一する。
 */
export function findXIdIdentityIssues(
  rows: XIdRowIdentity[],
): XIdIdentityIssue[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.xId.trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return rows.flatMap<XIdIdentityIssue>((row) => {
    const key = row.xId.trim().toLowerCase();
    if (!key) return [{ ...row, kind: 'empty' }];
    if ((counts.get(key) ?? 0) > 1) return [{ ...row, kind: 'duplicate' }];
    return [];
  });
}
