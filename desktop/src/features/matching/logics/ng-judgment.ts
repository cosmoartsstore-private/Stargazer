/**
 * NGユーザー判定ロジック。
 * XアカウントIDを共通の比較キーへ変換して判定する。
 */

import type { UserBean, CastBean, NGUserEntry } from '@/common/types/entities';
import { normalizeXAccountId } from '@/common/xIdUtils';
import { getMsg } from '@/messages/getMsg';

function matchEntry(user: UserBean, entry: NGUserEntry): boolean {
  const userXId = normalizeXAccountId(user.x_id);
  const entryXId = normalizeXAccountId(entry.accountId ?? '');
  return (
    userXId !== null
    && entryXId !== null
    && userXId === entryXId
  );
}

/**
 * キャストのNGリスト（ng_entries）に対してユーザーがNGかどうか判定する。
 */
export function isUserNGForCast(user: UserBean, cast: CastBean): boolean {
  const entries = cast.ng_entries;
  if (entries && entries.length > 0) {
    return entries.some((entry) => matchEntry(user, entry));
  }
  return false;
}

/**
 * 結果整合性の確認でNG組み合わせを検出した場合の理由文言を返す。
 */
export function getNGReasonForCast(castName: string): string {
  return getMsg('ngJudgment.ngReasonForCast', { castName });
}
