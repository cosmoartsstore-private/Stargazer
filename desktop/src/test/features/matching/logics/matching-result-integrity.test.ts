import { describe, expect, it } from 'vitest';
import type { CastBean } from '@/common/types/entities';
import type { MatchedCast, TableSlot } from '@/features/matching/logics/matching-io';
import {
  findUnavailableMatchingResultCasts,
  updateMatchingResultCastName,
} from '@/features/matching/logics/matching-result-integrity';

function match(cast: CastBean): MatchedCast {
  return { cast, rank: 0 };
}

describe('findUnavailableMatchingResultCasts', () => {
  it('同じIDの現在キャストは改名されていても利用可能と判定する', () => {
    const result = new Map([['user', [match({ id: 1, name: '旧名', is_present: true })]]]);

    expect(findUnavailableMatchingResultCasts(
      result,
      undefined,
      [{ id: 1, name: '新名', is_present: true }],
    )).toEqual([]);
  });

  it('同名で再登録された別IDは削除済み結果の代替にしない', () => {
    const deletedCast = { id: 1, name: 'Cast A', is_present: true };
    const result = new Map([['user', [match(deletedCast)]]]);

    expect(findUnavailableMatchingResultCasts(
      result,
      undefined,
      [{ id: 2, name: 'Cast A', is_present: true }],
    )).toEqual([deletedCast]);
  });

  it('空席を含むテーブル結果の削除済みキャストも検出し、重複はまとめる', () => {
    const deletedCast = { id: 3, name: 'Cast C', is_present: true };
    const slots: TableSlot[] = [
      { user: null, matches: [match(deletedCast)] },
      { user: null, matches: [match(deletedCast)] },
    ];

    expect(findUnavailableMatchingResultCasts(null, slots, [])).toEqual([deletedCast]);
  });

  it('同じIDの改名をユーザー別・テーブル別結果へ反映する', () => {
    const oldCast = { id: 1, name: '旧名', is_present: true };
    const otherCast = { id: 2, name: '別キャスト', is_present: true };
    const warningMatch: MatchedCast = {
      ...match(oldCast),
      isNGWarning: true,
      ngReason: 'キャスト「旧名」のNG対象です',
    };
    const result = new Map([['@user', [warningMatch, match(otherCast)]]]);
    const slots: TableSlot[] = [{ user: null, matches: [match(oldCast)] }];

    const updated = updateMatchingResultCastName(result, slots, 1, '新名');

    expect(updated.resultMap?.get('@user')?.map((value) => value.cast.name)).toEqual([
      '新名',
      '別キャスト',
    ]);
    expect(updated.resultMap?.get('@user')?.[0].ngReason).toBe(
      'キャスト「新名」のNG対象です',
    );
    expect(updated.tableSlots?.[0].matches[0].cast.name).toBe('新名');
    expect(result.get('@user')?.[0].cast.name).toBe('旧名');
  });
});
