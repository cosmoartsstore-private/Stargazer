/**
 * NGユーザー判定ロジック（仕様書 1-1 に基づく）。
 * 判定基準: ユーザー名のみ / アカウントIDのみ / どちらか片方一致。
 * 大文字小文字・前後空白はトリムして比較。
 */

import type { UserBean, CastBean, NGUserEntry } from '@/common/types/entities';
import type { NGJudgmentType } from '@/features/matching/types/matching-system-types';

function normalize(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function normalizeIdForCompare(s: string | undefined): string {
  const n = normalize(s);
  return n.startsWith('@') ? n.slice(1) : n;
}

function matchEntry(user: UserBean, entry: NGUserEntry, judgmentType: NGJudgmentType): boolean {
  const nameMatch =
    entry.username !== undefined &&
    entry.username.trim() !== '' &&
    normalize(user.name) === normalize(entry.username);
  const idMatch =
    entry.accountId !== undefined &&
    entry.accountId.trim() !== '' &&
    normalizeIdForCompare(user.x_id) === normalizeIdForCompare(entry.accountId);

  if (judgmentType === 'username') return nameMatch;
  if (judgmentType === 'accountId') return idMatch;
  return nameMatch || idMatch;
}

/**
 * キャストのNGリスト（ng_entries）に対してユーザーがNGかどうか判定する。
 */
export function isUserNGForCast(
  user: UserBean,
  cast: CastBean,
  judgmentType: NGJudgmentType,
): boolean {
  const entries = cast.ng_entries;
  if (entries && entries.length > 0) {
    return entries.some((entry) => matchEntry(user, entry, judgmentType));
  }
  return false;
}

/**
 * NG理由文言を返す（警告モード表示用）。
 */
export function getNGReasonForCast(castName: string): string {
  return `このユーザーはキャスト「${castName}」のNG対象です`;
}
