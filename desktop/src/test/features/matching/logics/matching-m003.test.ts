import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import { runMultipleMatching } from '@/features/matching/logics/matching-m003';

function user(name: string, xId: string, casts: string[], castIds?: Array<number | null>): UserBean {
  return { name, x_id: xId, casts, cast_ids: castIds, raw_extra: [] };
}

function cast(
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

function averageScore(result: ReturnType<typeof runMultipleMatching>): number {
  const scores = [...result.userMap.values()]
    .flat()
    .map((match) => match.score ?? 0);
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runMultipleMatching', () => {
  it('複数キャスト単位をテーブルへ割り当て、空席分も同じテーブルに補う', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const result = runMultipleMatching(
      [user('Alice', '@alice', ['Cast A'])],
      [cast('Cast A'), cast('Cast B')],
      {
        usersPerTable: 2,
        castsPerRotation: 2,
        rotationCount: 1,
        totalTables: 1,
        searchTimeLimitMs: 10,
      },
    );

    expect(result.ngConflict).toBeUndefined();
    expect(result.userMap.get('@alice')).toHaveLength(2);
    expect(result.tableSlots).toHaveLength(2);
    expect(result.tableSlots?.[0].user?.name).toBe('Alice');
    expect(result.tableSlots?.[1]).toMatchObject({ user: null, tableIndex: 1 });
    expect(result.tableSlots?.[1].matches).toHaveLength(2);
  });

  it('同名キャストの希望点と順位を安定IDごとに区別する', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const result = runMultipleMatching(
      [user('Alice', '@alice', ['同名キャスト'], [1])],
      [
        cast('同名キャスト', undefined, 1),
        cast('同名キャスト', undefined, 2),
      ],
      {
        usersPerTable: 1,
        castsPerRotation: 2,
        rotationCount: 1,
        totalTables: 1,
        searchTimeLimitMs: 1,
        relaxedAfterMs: 0,
      },
    );

    const matches = [...(result.userMap.get('@alice') ?? [])]
      .sort((left, right) => left.cast.id - right.cast.id);
    expect(matches).toMatchObject([
      { cast: { id: 1 }, rank: 1, score: 90 },
      { cast: { id: 2 }, rank: 0, score: 0 },
    ]);
  });

  it('quality モードでは制限時間内の複数試行から平均点が最も高い候補を返す', () => {
    const nowValues = [0, 0, 1, 1, 3];
    const randomValues = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.4, 0.9];
    vi.spyOn(Date, 'now').mockImplementation(() => nowValues.shift() ?? 3);
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues.shift() ?? 0.9);

    const result = runMultipleMatching(
      [
        user('Alice', '@alice', ['Cast A']),
        user('Bob', '@bob', ['Cast A']),
        user('Carol', '@carol', ['Cast B']),
        user('Dave', '@dave', ['Cast B']),
      ],
      [cast('Cast A'), cast('Cast B')],
      {
        usersPerTable: 2,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 2,
        searchTimeLimitMs: 3,
        searchMode: 'quality',
      },
    );

    expect(averageScore(result)).toBe(90);
    expect(result.userMap.get('@alice')?.[0].cast.name).toBe('Cast A');
    expect(result.userMap.get('@bob')?.[0].cast.name).toBe('Cast A');
    expect(result.userMap.get('@carol')?.[0].cast.name).toBe('Cast B');
    expect(result.userMap.get('@dave')?.[0].cast.name).toBe('Cast B');
    expect(randomValues).toHaveLength(0);
  });

  it('quality モードでは初回の低スコア候補で早期終了せず、後続の高スコア候補を採用する', () => {
    const nowValues = [0, 0, 1, 1, 3];
    const randomValues = [0.9, 0.9, 0.4, 0.9, 0.9, 0.9, 0.9, 0.9];
    vi.spyOn(Date, 'now').mockImplementation(() => nowValues.shift() ?? 3);
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues.shift() ?? 0.9);

    const result = runMultipleMatching(
      [
        user('Alice', '@alice', ['Cast A']),
        user('Bob', '@bob', ['Cast A']),
        user('Carol', '@carol', ['Cast B']),
        user('Dave', '@dave', ['Cast B']),
      ],
      [cast('Cast A'), cast('Cast B')],
      {
        usersPerTable: 2,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 2,
        searchTimeLimitMs: 3,
        searchMode: 'quality',
      },
    );

    expect(averageScore(result)).toBe(90);
    expect(randomValues).toHaveLength(0);
  });

  it('efficiency モードでは緩和時間後に基準点未満の成立候補を返す', () => {
    const nowValues = [0, 0, 1, 1, 2, 2];
    const randomValues = [
      0.9, 0.9, 0.4, 0.9,
      0.9, 0.9, 0.4, 0.9,
      0.9, 0.9, 0.9, 0.9,
    ];
    vi.spyOn(Date, 'now').mockImplementation(() => nowValues.shift() ?? 2);
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues.shift() ?? 0.9);

    const result = runMultipleMatching(
      [
        user('Alice', '@alice', ['Cast A']),
        user('Bob', '@bob', ['Cast A']),
        user('Carol', '@carol', ['Cast B']),
        user('Dave', '@dave', ['Cast B']),
      ],
      [cast('Cast A'), cast('Cast B')],
      {
        usersPerTable: 2,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 2,
        searchTimeLimitMs: 3,
        relaxedAfterMs: 1,
        searchMode: 'efficiency',
      },
    );

    expect(averageScore(result)).toBe(45);
    expect(randomValues).toHaveLength(4);
  });

  it('キャスト数が単位人数で割り切れない場合は invalid-settings を返す', () => {
    const result = runMultipleMatching(
      [user('Alice', '@alice', ['Cast A'])],
      [cast('Cast A'), cast('Cast B'), cast('Cast C')],
      {
        usersPerTable: 1,
        castsPerRotation: 2,
        rotationCount: 1,
        totalTables: 1,
      },
    );

    expect(result).toMatchObject({
      ngConflict: true,
      failureReason: 'invalid-settings',
    });
  });

  it('テーブル数またはキャスト単位数が応募者グループに足りない場合は容量不足にする', () => {
    expect(runMultipleMatching(
      [user('Alice', '@alice', ['Cast A']), user('Bob', '@bob', ['Cast B'])],
      [cast('Cast A'), cast('Cast B')],
      {
        usersPerTable: 1,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 1,
      },
    )).toMatchObject({
      ngConflict: true,
      failureReason: 'invalid-settings',
    });

    expect(runMultipleMatching(
      [user('Alice', '@alice', ['Cast A']), user('Bob', '@bob', ['Cast B']), user('Carol', '@carol', ['Cast C'])],
      [cast('Cast A'), cast('Cast B')],
      {
        usersPerTable: 1,
        castsPerRotation: 1,
        rotationCount: 1,
      },
    )).toMatchObject({
      ngConflict: true,
      failureReason: 'insufficient-capacity',
    });
  });

  it('NG 排除で成立する組み合わせがない場合は探索時間切れとして返す', () => {
    const result = runMultipleMatching(
      [user('Alice', '@alice', ['Cast A'])],
      [cast('Cast A', '@alice')],
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
  });

  it('NG 排除で希望キャストを使えない場合は成立可能な別キャストへ割り当てる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const result = runMultipleMatching(
      [user('Alice', '@alice', ['Cast A'])],
      [cast('Cast A', '@alice'), cast('Cast B')],
      {
        usersPerTable: 1,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 2,
        searchTimeLimitMs: 1,
      },
    );

    expect(result.ngConflict).toBeUndefined();
    expect(result.userMap.get('@alice')?.[0].cast.name).toBe('Cast B');
  });

  it('応募者または出勤キャストがない場合は空の結果を返す', () => {
    expect(runMultipleMatching([], [cast('Cast A')], {
      usersPerTable: 1,
      castsPerRotation: 1,
      rotationCount: 1,
    })).toEqual({ userMap: new Map() });

    expect(runMultipleMatching([user('Alice', '@alice', ['Cast A'])], [{ id: 99, name: 'Resting', is_present: false }], {
      usersPerTable: 1,
      castsPerRotation: 1,
      rotationCount: 1,
    })).toEqual({ userMap: new Map() });
  });
});
