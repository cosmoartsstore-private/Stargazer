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

function getCastNames(cast: CastBean): string[] {
  return [cast.name, ...(cast.aliases ?? [])];
}

/**
 * 正式名と別名義から安定IDを引ける索引を作る。
 * 同じ名称が複数キャストに属する場合は、誤った希望へ結び付けないため null にする。
 */
function buildCastIdByName(casts: CastBean[]): Map<string, number | null> {
  const castIdsByName = new Map<string, Set<number>>();
  for (const cast of casts) {
    for (const name of getCastNames(cast)) {
      if (!name) continue;
      const castIds = castIdsByName.get(name) ?? new Set<number>();
      castIds.add(cast.id);
      castIdsByName.set(name, castIds);
    }
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

/**
 * 応募者の希望内にあるキャストの位置を返す。
 * cast_ids が明示されているデータでは名前を代替キーとして使わない。
 */
export function getCastPreferenceIndex(user: UserBean, cast: CastBean): number {
  if (user.cast_ids !== undefined) {
    return user.cast_ids.indexOf(cast.id);
  }
  // 旧データの名前fallbackでは名簿全体の曖昧性を判定できないため、正式名だけを使う。
  return user.casts.indexOf(cast.name);
}

/** 現在の正式名・別名義と安定IDを完全一致で対応付け、応募者の希望順位へ付与する。 */
export function attachCastIdsToUsers(users: UserBean[], casts: CastBean[]): UserBean[] {
  const castIdByName = buildCastIdByName(casts);

  return users.map((user) => ({
    ...user,
    cast_ids: user.casts.map((castName) => castIdByName.get(castName) ?? null),
  }));
}

/**
 * キャスト名変更を、安定IDで参照している応募者の希望表示名へ反映する。
 * cast_ids を持たない旧データだけは、変更前の正式名を代替キーとして使う。
 */
export function renameCastInPreferences(
  users: UserBean[],
  renamedCast: CastBean,
  oldName: string,
  newName: string,
): UserBean[] {
  return users.map((user) => {
    let changed = false;
    const castNames = user.casts.map((castName, index) => {
      const isRenamedCast = user.cast_ids === undefined
        ? castName === oldName
        : user.cast_ids[index] === renamedCast.id;
      if (!isRenamedCast) return castName;
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
  const currentCastNames = new Set(casts.map((cast) => cast.name));
  const issues: UnavailableCastReference[] = [];

  for (const user of users) {
    if (user.cast_ids === undefined) {
      user.casts.forEach((castName, preferenceIndex) => {
        if (!castName || currentCastNames.has(castName)) return;
        issues.push({
          applicantName: user.name,
          xId: user.x_id,
          preferenceIndex,
          castName,
          castId: null,
          reason: 'unresolved',
        });
      });
      continue;
    }

    const preferenceCount = Math.max(user.casts.length, user.cast_ids.length);
    for (let preferenceIndex = 0; preferenceIndex < preferenceCount; preferenceIndex += 1) {
      const castName = user.casts[preferenceIndex] ?? '';
      const castId = user.cast_ids[preferenceIndex] ?? null;
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
