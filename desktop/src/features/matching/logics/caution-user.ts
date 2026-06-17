/**
 * 要注意人物の判定・自動登録（仕様書 2-1）。
 *
 * - NGカウント（自動登録）: 現行UIでは X ID の一致で判定する
 * - 同一人物判定 (isCautionUser): ユーザー名 AND アカウントID の両方一致（厳密 AND）
 * - NG例外判定 (isNGException): ユーザー名 AND アカウントID の両方一致（厳密 AND）
 */

import type { UserBean, CastBean } from '@/common/types/entities';
import type { NGJudgmentType, CautionUser, NGException } from '@/features/matching/types/matching-system-types';
import { isUserNGForCast } from '@/features/matching/logics/ng-judgment';

/** ユーザーをNGにしているキャスト名の一覧を返す（状態列の理由表示用）。 */
export function getCautionNGCastNames(
  user: UserBean,
  casts: CastBean[],
  judgmentType: NGJudgmentType,
): string[] {
  return casts
    .filter((cast) => isUserNGForCast(user, cast, judgmentType))
    .map((cast) => cast.name);
}

function normalize(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/^@/, '');
}

/**
 * 応募ユーザーが要注意リストの誰かと一致するか。
 * 仕様 2-1: アカウントIDが一致すれば要注意と判定。
 * ユーザー名が両方存在する場合は、ユーザー名も一致する必要がある。
 */
export function isCautionUser(
  user: UserBean,
  cautionUsers: CautionUser[],
): boolean {
  const nameNorm = normalize(user.name);
  const idNorm = normalize(user.x_id);

  // アカウントIDが空の場合は判定不可
  if (!idNorm) return false;

  return cautionUsers.some((c) => {
    const cNameNorm = normalize(c.username);
    const cIdNorm = normalize(c.accountId);

    // アカウントIDが一致しない場合は別人
    if (cIdNorm !== idNorm) return false;

    // アカウントIDが一致した場合、ユーザー名が両方存在するなら名前も一致する必要がある
    if (nameNorm && cNameNorm) {
      return nameNorm === cNameNorm;
    }

    // どちらか片方でもユーザー名が空なら、アカウントIDの一致だけで判定
    return true;
  });
}

/**
 * 例外リストに一致すれば警告を出さない。
 * 仕様 3-2/3-3: ユーザー名 AND アカウントID の両方が一致（厳密）。
 * accountId がない場合は例外判定不可。
 */
export function isNGException(
  user: UserBean,
  exceptions: NGException[],
): boolean {
  const nameNorm = normalize(user.name);
  const idNorm = normalize(user.x_id);
  return exceptions.some(
    (e) => normalize(e.username) === nameNorm && normalize(e.accountId) === idNorm,
  );
}

/**
 * 応募リストのユーザーについて、何人のキャストがそのユーザーをNGにしているか集計し、
 * 閾値以上なら要注意リスト用のエントリを返す。
 *
 * カウントロジック:
 *   - 各キャストのNGリストとの照合は呼び出し側から渡された判定基準に従う。
 *     現行UIからの呼び出しでは X ID 固定で判定する。
 *   - isUserNGForCast を再利用し、ng-judgment.ts と一貫した判定を行う。
 *
 * 登録される CautionUser:
 *   - 応募ユーザーの username / accountId(x_id) の両方が揃っている場合のみ登録。
 *     これにより isCautionUser（厳密 AND）で正しくマッチできる。
 */
export function computeAutoCautionUsers(
  casts: CastBean[],
  applyUsers: UserBean[],
  judgmentType: NGJudgmentType,
  threshold: number,
): CautionUser[] {
  const result: CautionUser[] = [];
  const now = new Date().toISOString();
  for (const user of applyUsers) {
    const nameNorm = normalize(user.name);
    const idNorm = normalize(user.x_id);
    // 登録される CautionUser には両方必要（isCautionUser が厳密 AND のため）
    if (!nameNorm || !idNorm) continue;

    let count = 0;
    for (const cast of casts) {
      // 現行UIでは X ID 固定の判定基準が渡される。
      if (isUserNGForCast(user, cast, judgmentType)) count += 1;
    }
    if (count >= threshold) {
      // @マークを必ず付与
      const xId = user.x_id.trim();
      const accountId = xId.startsWith('@') ? xId : `@${xId}`;
      result.push({
        username: user.name.trim(),
        accountId,
        registrationType: 'auto',
        ngCastCount: count,
        registeredAt: now,
      });
    }
  }
  return result;
}
