import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import { runMatching } from '@/features/matching/logics/matching-io';

function createUser(
  name: string,
  xId: string,
  casts: string[],
  preferenceMode?: UserBean['preference_mode'],
  castIds?: Array<number | null>,
): UserBean {
  return {
    name,
    x_id: xId,
    casts,
    cast_ids: castIds,
    preference_mode: preferenceMode,
    raw_extra: [],
  };
}

function createCast(
  name: string,
  ngAccountId?: string,
  id = Array.from(name).reduce((hash, character) => hash * 31 + character.charCodeAt(0), 17),
): CastBean {
  return {
    id,
    name,
    is_present: true,
    ng_entries: ngAccountId ? [{ accountId: ngAccountId }] : [],
  };
}

describe('runMatching', () => {
  it('M002 は希望点が最大になるように応募者を出勤キャストへ割り当てる', () => {
    const result = runMatching(
      [
        createUser('Alice', '@alice', ['Cast B']),
        createUser('Bob', '@bob', ['Cast A']),
      ],
      [createCast('Cast A'), createCast('Cast B')],
      'M002',
      { rotationCount: 1, totalTables: 2 },
    );

    expect(result.ngConflict).toBeUndefined();
    expect(result.userMap.get('@alice')?.[0]?.cast.name).toBe('Cast B');
    expect(result.userMap.get('@bob')?.[0]?.cast.name).toBe('Cast A');
    expect(result.scoreSummary).toMatchObject({
      totalScore: 180,
      averageScore: 90,
      firstChoiceCount: 2,
    });
  });

  it('M002 は同名キャストをIDで区別して希望先へ割り当てる', () => {
    const result = runMatching(
      [createUser('Alice', '@alice', ['同名キャスト'], 'ranked', [2])],
      [
        createCast('同名キャスト', undefined, 1),
        createCast('同名キャスト', undefined, 2),
      ],
      'M002',
      { rotationCount: 1, totalTables: 2 },
    );

    expect(result.userMap.get('@alice')?.[0]).toMatchObject({
      cast: { id: 2 },
      rank: 1,
      score: 90,
    });
    expect(result.scoreSummary).toMatchObject({
      firstChoiceCount: 1,
      totalScore: 90,
    });
  });

  it('順不同希望は50点として集計し、希望外には含めない', () => {
    const result = runMatching(
      [createUser('Alice', '@alice', ['Cast A', 'Cast B', 'Cast C', 'Cast D'], 'flat')],
      [createCast('Cast D')],
      'M002',
      { rotationCount: 1, totalTables: 1 },
    );

    expect(result.userMap.get('@alice')?.[0]).toMatchObject({
      cast: { name: 'Cast D' },
      rank: 0,
      score: 50,
    });
    expect(result.scoreSummary).toMatchObject({
      totalScore: 50,
      flatPreferenceCount: 1,
      unpreferredCount: 0,
    });
  });

  it('出勤キャスト数やローテーション数が不足すると容量不足として失敗する', () => {
    const result = runMatching(
      [
        createUser('Alice', '@alice', ['Cast A']),
        createUser('Bob', '@bob', ['Cast B']),
      ],
      [createCast('Cast A')],
      'M002',
      { rotationCount: 1, totalTables: 2 },
    );

    expect(result).toMatchObject({
      ngConflict: true,
      failureReason: 'insufficient-capacity',
    });
    expect(result.scoreSummary).toBeUndefined();
  });

  it('NGしかない場合は常に候補から除外し、NG競合として失敗する', () => {
    const result = runMatching(
      [createUser('Alice', '@alice', ['Cast A'])],
      [createCast('Cast A', '@alice')],
      'M002',
      { rotationCount: 1, totalTables: 1 },
    );

    expect(result).toMatchObject({
      ngConflict: true,
      failureReason: 'ng-conflict',
    });
  });

  it('M003 はキャスト単位を作れない設定を invalid-settings として返す', () => {
    const result = runMatching(
      [createUser('Alice', '@alice', ['Cast A'])],
      [createCast('Cast A'), createCast('Cast B'), createCast('Cast C')],
      'M003',
      {
        usersPerTable: 1,
        castsPerRotation: 2,
        rotationCount: 1,
        totalTables: 1,
        searchTimeLimitMs: 1,
      },
    );

    expect(result).toMatchObject({
      ngConflict: true,
      failureReason: 'invalid-settings',
    });
  });

  it('M003でもNGしかない場合は候補から除外する', () => {
    const result = runMatching(
      [createUser('Alice', '@alice', ['Cast A'])],
      [createCast('Cast A', '@alice')],
      'M003',
      {
        usersPerTable: 1,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 1,
        searchTimeLimitMs: 1,
      },
    );

    expect(result).toMatchObject({
      ngConflict: true,
      failureReason: 'time-limit',
    });
    expect(result.userMap.get('@alice')).toBeUndefined();
    expect(result.scoreSummary).toBeUndefined();
  });
});
