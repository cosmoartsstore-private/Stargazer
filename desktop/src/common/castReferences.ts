import type { CastBean, UserBean } from '@/common/types/entities';

export type UnavailableCastReferenceReason = 'unresolved' | 'deleted';

export interface UnavailableCastReference {
  applicantName: string;
  xId: string;
  /** 0-based の希望順位。 */
  preferenceIndex: number;
  castName: string;
  castId: number | null;
  reason: UnavailableCastReferenceReason;
}

export interface CastNameUsage {
  castId: number;
  castName: string;
  source: 'name' | 'alias';
  aliasIndex?: number;
}

/**
 * 正式名から安定IDを引ける索引を作る。
 * 別名義は検索用の補助情報であり、応募データの希望判定には使わない。
 * 同じ名称が複数キャストに属する場合は、誤った希望へ結び付けないため null にする。
 */
function buildCastIdByFormalName(casts: CastBean[]): Map<string, number | null> {
  const castIdsByName = new Map<string, Set<number>>();
  for (const cast of casts) {
    if (!cast.name) continue;
    const castIds = castIdsByName.get(cast.name) ?? new Set<number>();
    castIds.add(cast.id);
    castIdsByName.set(cast.name, castIds);
  }

  return new Map(
    [...castIdsByName].map(([name, castIds]) => [
      name,
      castIds.size === 1 ? [...castIds][0] : null,
    ]),
  );
}

/** 指定した名称が、現在の名簿で正式名・別名義のどちらに使われているか返す。 */
export function findCastNameUsages(name: string, casts: CastBean[]): CastNameUsage[] {
  const usages: CastNameUsage[] = [];
  for (const cast of casts) {
    if (cast.name === name) {
      usages.push({ castId: cast.id, castName: cast.name, source: 'name' });
    }
    cast.aliases?.forEach((alias, aliasIndex) => {
      if (alias === name) {
        usages.push({ castId: cast.id, castName: cast.name, source: 'alias', aliasIndex });
      }
    });
  }
  return usages;
}

/** 応募者の希望内にあるキャストの位置を、保存時に確定した安定IDで返す。 */
export function getCastPreferenceIndex(user: UserBean, cast: CastBean): number {
  return user.cast_ids?.indexOf(cast.id) ?? -1;
}

/** 現在の正式名と安定IDを完全一致で対応付け、応募者の希望順位へ付与する。 */
export function attachCastIdsToUsers(users: UserBean[], casts: CastBean[]): UserBean[] {
  const castIdByName = buildCastIdByFormalName(casts);

  return users.map((user) => ({
    ...user,
    cast_ids: user.casts.map((castName) => castIdByName.get(castName) ?? null),
  }));
}

/** キャスト名変更を、安定IDで参照している応募者の希望表示名へ反映する。 */
export function renameCastInPreferences(
  users: UserBean[],
  renamedCast: CastBean,
  newName: string,
): UserBean[] {
  return users.map((user) => {
    let changed = false;
    const castNames = user.casts.map((castName, index) => {
      if (user.cast_ids?.[index] !== renamedCast.id) return castName;
      changed = true;
      return newName;
    });
    return changed ? { ...user, casts: castNames } : user;
  });
}

/** 現在のキャストへ解決できない希望参照を、応募者全体から抽出する。 */
export function findUnavailableCastReferences(
  users: UserBean[],
  casts: CastBean[],
): UnavailableCastReference[] {
  const currentCastIds = new Set(casts.map((cast) => cast.id));
  const issues: UnavailableCastReference[] = [];

  for (const user of users) {
    const preferenceCount = Math.max(user.casts.length, user.cast_ids?.length ?? 0);
    for (let preferenceIndex = 0; preferenceIndex < preferenceCount; preferenceIndex += 1) {
      const castName = user.casts[preferenceIndex] ?? '';
      const castId = user.cast_ids?.[preferenceIndex] ?? null;
      if (!castName && castId === null) continue;

      if (castId === null) {
        issues.push({
          applicantName: user.name,
          xId: user.x_id,
          preferenceIndex,
          castName,
          castId,
          reason: 'unresolved',
        });
      } else if (!currentCastIds.has(castId)) {
        issues.push({
          applicantName: user.name,
          xId: user.x_id,
          preferenceIndex,
          castName,
          castId,
          reason: 'deleted',
        });
      }
    }
  }

  return issues;
}
