import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import { runSingleCastMatching } from '@/features/matching/logics/matching-table-engine';

const users: UserBean[] = [
  { name: 'Alice', x_id: '@alice', casts: ['Cast A'], raw_extra: [] },
  { name: 'Bob', x_id: '@bob', casts: ['Cast B'], raw_extra: [] },
];

const casts: CastBean[] = [
  { id: 1, name: 'Cast A', is_present: true },
  { id: 2, name: 'Cast B', is_present: true },
  { id: 3, name: 'Resting', is_present: false },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runSingleCastMatching', () => {
  it('出勤キャストだけを使い、指定テーブル数まで空席を補う', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const result = runSingleCastMatching(users, casts, 3, 1, 'accountId', 'exclude', true);

    expect(result.ngConflict).toBeUndefined();
    expect(result.userMap.size).toBe(2);
    expect(result.tableSlots).toHaveLength(3);
    expect(result.tableSlots?.[2]).toEqual({ user: null, matches: [], tableIndex: 3 });
    expect([...result.userMap.values()].flat().every((match) => match.cast.name !== 'Resting')).toBe(true);
  });

  it('応募者数またはローテーション数が出勤キャスト数を超える場合は容量不足にする', () => {
    expect(runSingleCastMatching(users, [casts[0]], 2, 1, 'accountId', 'exclude', true)).toMatchObject({
      ngConflict: true,
      failureReason: 'insufficient-capacity',
    });
    expect(runSingleCastMatching([users[0]], casts, 1, 3, 'accountId', 'exclude', true)).toMatchObject({
      ngConflict: true,
      failureReason: 'insufficient-capacity',
    });
  });

  it('応募者または出勤キャストがない場合は空の結果を返す', () => {
    expect(runSingleCastMatching([], casts, 1, 1, 'accountId', 'exclude', true)).toEqual({
      userMap: new Map(),
    });
    expect(runSingleCastMatching(users, [{ id: 3, name: 'Resting', is_present: false }], 1, 1, 'accountId', 'exclude', true)).toEqual({
      userMap: new Map(),
    });
  });

  it('登録順モードではランダム化しない', () => {
    const random = vi.spyOn(Math, 'random');

    runSingleCastMatching(users, casts, 2, 1, 'accountId', 'exclude', false);

    expect(random).not.toHaveBeenCalled();
  });
});
