import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import type { MatchedCast } from '@/features/matching/logics/matching-io';
import type { CastResultRow } from './matching-result-view';
import { buildCastMatchingTsvRows } from './matching-result-export';

const user: UserBean = { name: 'Alice', x_id: '@alice', casts: ['Cast A'], raw_extra: [] };
const cast: CastBean = { name: 'Cast A', is_present: true };

describe('buildCastMatchingTsvRows', () => {
  it('キャスト別マッチング結果を TSV 用の行配列へ変換する', () => {
    const match: MatchedCast = { cast, rank: 1, rotationIndex: 0, isNGWarning: true };
    const rows: CastResultRow[] = [
      {
        cast,
        assignments: [{ user, match }],
      },
    ];

    expect(buildCastMatchingTsvRows(rows, [0])).toEqual([
      ['キャスト名', '第1ローテ'],
      ['Cast A', 'Alice (@alice / 第一希望 / NG)'],
    ]);
  });

  it('該当列に割り当てがない場合は空セルにする', () => {
    const match: MatchedCast = { cast, rank: 1, rotationIndex: 1 };
    const rows: CastResultRow[] = [
      {
        cast,
        assignments: [{ user, match }],
      },
    ];

    expect(buildCastMatchingTsvRows(rows, [0, 1])).toEqual([
      ['キャスト名', '第1ローテ', '第2ローテ'],
      ['Cast A', '', 'Alice (@alice / 第一希望)'],
    ]);
  });
});
