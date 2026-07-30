/** Xのユーザー名を保存・比較・表示の各用途へ変換する。 */

const X_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

/**
 * 「@username」または「username」から、先頭の@を除いたXのユーザー名を抽出する。
 * @returns ユーザー名。抽出できない場合は null
 */
export function parseXUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const username = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return X_USERNAME_PATTERN.test(username) ? username : null;
}

/** Xのユーザー名を、入力時の大文字小文字を保った@username形式へ整える。 */
export function formatXAccountId(input: string): string | null {
  const username = parseXUsername(input);
  if (!username) return null;
  return `@${username}`;
}

/** X IDを大小文字と先頭の@を区別せず照合するための比較キーを返す。 */
export function normalizeXAccountId(input: string): string | null {
  return parseXUsername(input)?.toLowerCase() ?? null;
}

/** 保存値を画面表示用の@username形式へ整え、形式不正値は確認できるよう原文を返す。 */
export function formatXAccountIdForDisplay(input: string): string {
  return formatXAccountId(input) ?? input.trim();
}

/** X IDを、外部ブラウザで開くプロフィールURLへ変換する。 */
export function buildXProfileUrl(input: string | undefined): string | null {
  if (!input) return null;
  const username = parseXUsername(input);
  return username ? `https://x.com/${username}` : null;
}

export interface XIdRowIdentity {
  rowNumber: number;
  xId: string;
}

export type XIdIdentityIssueKind = 'empty' | 'invalid' | 'duplicate';

export interface XIdIdentityIssue extends XIdRowIdentity {
  kind: XIdIdentityIssueKind;
}

/**
 * 空、形式不正、または先頭の@と大文字小文字を除いて重複するX IDを返す。
 */
export function findXIdIdentityIssues(
  rows: XIdRowIdentity[],
): XIdIdentityIssue[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeXAccountId(row.xId);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return rows.flatMap<XIdIdentityIssue>((row) => {
    if (!row.xId.trim()) return [{ ...row, kind: 'empty' }];
    const key = normalizeXAccountId(row.xId);
    if (!key) return [{ ...row, kind: 'invalid' }];
    if ((counts.get(key) ?? 0) > 1) return [{ ...row, kind: 'duplicate' }];
    return [];
  });
}
