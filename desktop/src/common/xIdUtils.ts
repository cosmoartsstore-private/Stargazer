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
