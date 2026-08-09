import { describe, expect, it } from 'vitest';
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

describe('runMultipleMatching', () => {
  it('複数キャスト単位をテーブルへ割り当て、空席分も同じテーブルに補う', () => {
    const castA = cast('Cast A');

    const result = runMultipleMatching(
      [user('Alice', '@alice', ['Cast A'], [castA.id])],
      [castA, cast('Cast B')],
      {
        usersPerTable: 2,
        castsPerRotation: 2,
        rotationCount: 1,
        totalTables: 1,
      },
    );

    expect(result.ngConflict).toBeUndefined();
    expect(result.userMap.get('@alice')).toHaveLength(2);
    expect(result.tableSlots).toHaveLength(2);
    expect(result.tableSlots?.[0].user?.name).toBe('Alice');
    expect(result.tableSlots?.[1]).toMatchObject({ user: null, tableIndex: 1 });
    expect(result.tableSlots?.[1].matches).toHaveLength(2);
  });

  it('応募者を割り当てない物理テーブルを当日枠用の空きテーブルとして残す', () => {
    const result = runMultipleMatching(
      [
        user('Alice', '@alice', ['Cast A']),
        user('Bob', '@bob', ['Cast A']),
      ],
      [cast('Cast A'), cast('Cast B')],
      {
        usersPerTable: 2,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 2,
      },
    );

    expect(result.ngConflict).toBeUndefined();
    expect(result.tableSlots).toHaveLength(4);
    const emptySlots = result.tableSlots?.filter((slot) => slot.user === null) ?? [];
    expect(emptySlots).toHaveLength(2);
    expect(new Set(emptySlots.map((slot) => slot.tableIndex)).size).toBe(1);
    expect(emptySlots.every((slot) => slot.matches.length === 1)).toBe(true);
    expect(new Set(result.tableSlots?.map((slot) => slot.tableIndex))).toEqual(new Set([1, 2]));
  });

  it('同名キャストの希望点と順位を安定IDごとに区別する', () => {
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
      },
    );

    const matches = [...(result.userMap.get('@alice') ?? [])]
      .sort((left, right) => left.cast.id - right.cast.id);
    expect(matches).toMatchObject([
      { cast: { id: 1 }, rank: 1, score: 90 },
      { cast: { id: 2 }, rank: 0, score: 0 },
    ]);
  });

  it('応募者グループ全体の希望点が最大になる割り当てを決定的に返す', () => {
    const castA = cast('Cast A');
    const castB = cast('Cast B');

    const result = runMultipleMatching(
      [
        user('Alice', '@alice', ['Cast A'], [castA.id]),
        user('Bob', '@bob', ['Cast A'], [castA.id]),
        user('Carol', '@carol', ['Cast B'], [castB.id]),
        user('Dave', '@dave', ['Cast B'], [castB.id]),
      ],
      [castA, castB],
      {
        usersPerTable: 2,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 2,
      },
    );

    expect(averageScore(result)).toBe(90);
    expect(result.userMap.get('@alice')?.[0].cast.name).toBe('Cast A');
    expect(result.userMap.get('@bob')?.[0].cast.name).toBe('Cast A');
    expect(result.userMap.get('@carol')?.[0].cast.name).toBe('Cast B');
    expect(result.userMap.get('@dave')?.[0].cast.name).toBe('Cast B');
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

  it('NG 排除で成立する組み合わせがない場合はNG競合として返す', () => {
    const result = runMultipleMatching(
      [user('Alice', '@alice', ['Cast A'])],
      [cast('Cast A', '@alice')],
      {
        usersPerTable: 1,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 1,
      },
    );

    expect(result).toMatchObject({
      ngConflict: true,
      failureReason: 'ng-conflict',
    });
  });

  it('NG 排除で希望キャストを使えない場合は成立可能な別キャストへ割り当てる', () => {
    const castA = cast('Cast A', '@alice');

    const result = runMultipleMatching(
      [user('Alice', '@alice', ['Cast A'], [castA.id])],
      [castA, cast('Cast B')],
      {
        usersPerTable: 1,
        castsPerRotation: 1,
        rotationCount: 1,
        totalTables: 2,
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
