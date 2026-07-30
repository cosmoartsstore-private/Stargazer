/**
 * 要注意人物の候補集計と固定登録済みユーザーの判定。
 *
 * - 候補集計: キャストごとのNGを X ID でまとめる
 * - 固定登録判定: X IDを必須とし、登録側と応募側の表示名が両方ある場合は名前も照合する
 */

import type { UserBean, CastBean, CautionUser } from '@/common/types/entities';
import {
  formatXAccountIdForDisplay,
  normalizeXAccountId,
  parseXUsername,
} from '@/common/xIdUtils';
import { isUserNGForCast } from '@/features/matching/logics/ng-judgment';

/** ユーザーをNGにしているキャスト名の一覧を返す（状態列の理由表示用）。 */
export function getCautionNGCastNames(
  user: UserBean,
  casts: CastBean[],
): string[] {
  return casts
    .filter((cast) => isUserNGForCast(user, cast))
    .map((cast) => cast.name);
}

function normalizeName(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** 名前未入力時にX IDから補完した表示名は、本人照合用の名前として扱わない。 */
function normalizeRegisteredName(cautionUser: CautionUser): string {
  const normalizedName = normalizeName(cautionUser.username);
  const fallbackName = normalizeName(formatXAccountIdForDisplay(cautionUser.accountId));
  return normalizedName === fallbackName ? '' : normalizedName;
}

/** 要注意人物に追加可能な、複数キャストのNG登録から集計した候補。 */
export interface CautionCandidate {
  accountId: string;
  usernames: string[];
  castCount: number;
}

/**
 * 応募ユーザーが要注意リストの誰かと一致するか。
 * アカウントIDを必須とし、双方にユーザー名がある場合は名前も一致した人だけを要注意と判定する。
 */
export function isCautionUser(
  user: UserBean,
  cautionUsers: CautionUser[],
): boolean {
  const nameNorm = normalizeName(user.name);
  const idNorm = normalizeXAccountId(user.x_id);
  if (!idNorm) return false;
  return cautionUsers.some((cautionUser) => {
    if (normalizeXAccountId(cautionUser.accountId) !== idNorm) return false;
    const cautionNameNorm = normalizeRegisteredName(cautionUser);
    return !nameNorm || !cautionNameNorm || nameNorm === cautionNameNorm;
  });
}

/**
 * キャストごとのNG登録から、閾値以上の要注意人物候補を集計する。
 * X IDの比較キーで集計し、登録済みのIDは候補から除外する。
 */
export function computeCautionCandidates(
  casts: CastBean[],
  threshold: number,
  registeredCautionAccountIds: Iterable<string>,
): CautionCandidate[] {
  const registeredIds = new Set(
    Array.from(registeredCautionAccountIds, (accountId) => normalizeXAccountId(accountId))
      .filter((accountId): accountId is string => accountId !== null),
  );
  const candidatesById = new Map<string, {
    accountId: string;
    usernames: Set<string>;
    castNames: Set<string>;
  }>();

  for (const cast of casts) {
    for (const entry of cast.ng_entries ?? []) {
      const accountId = entry.accountId ? parseXUsername(entry.accountId) : null;
      const accountIdKey = accountId ? normalizeXAccountId(accountId) : null;
      if (!accountId || !accountIdKey || registeredIds.has(accountIdKey)) continue;

      let candidate = candidatesById.get(accountIdKey);
      if (!candidate) {
        candidate = {
          accountId,
          usernames: new Set(),
          castNames: new Set(),
        };
        candidatesById.set(accountIdKey, candidate);
      }
      if (entry.username) candidate.usernames.add(entry.username);
      candidate.castNames.add(cast.name);
    }
  }

  return Array.from(candidatesById.values())
    .filter((candidate) => candidate.castNames.size >= threshold)
    .map((candidate) => ({
      accountId: candidate.accountId,
      usernames: Array.from(candidate.usernames),
      castCount: candidate.castNames.size,
    }))
    .sort((a, b) => b.castCount - a.castCount);
}
