import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import type { MatchedCast, TableSlot } from '@/features/matching/logics/matching-io';
import {
  buildCastResultRows,
  buildResultRows,
  formatFailureMessage,
  getAssignmentsForColumn,
  getCastResultColumnKeys,
  getCastResultColumnLabel,
  getMatchPreference,
  getRotationLabel,
  groupMatchesByRotation,
  groupTableSlots,
} from './matching-result-view';

const alice: UserBean = { name: 'Alice', x_id: '@alice', casts: ['Cast A'], raw_extra: [] };
const bob: UserBean = { name: 'Bob', x_id: '@bob', casts: ['Cast B'], raw_extra: [] };
const castA: CastBean = { name: 'Cast A', is_present: true };
const castB: CastBean = { name: 'Cast B', is_present: true };
const inactiveCast: CastBean = { name: 'Inactive', is_present: false };

const aliceMatch: MatchedCast = { cast: castA, rank: 1, rotationIndex: 0, score: 90 };
const bobMatch: MatchedCast = { cast: castB, rank: 0, rotationIndex: 1, score: 50 };

describe('matching result presenters', () => {
  it('応募者順に結果行を構築し、未割り当ては空配列にする', () => {
    const rows = buildResultRows([alice, bob], new Map([['@alice', [aliceMatch]]]));

    expect(rows).toEqual([
      { user: alice, matches: [aliceMatch] },
      { user: bob, matches: [] },
    ]);
  });

  it('キャスト別行は出勤キャスト順を保ち、割り当てがある外部キャストも含める', () => {
    const externalCast: CastBean = { name: 'External', is_present: true };
    const rows = buildCastResultRows(
      [
        { user: alice, matches: [aliceMatch] },
        { user: bob, matches: [{ ...bobMatch, cast: externalCast }] },
      ],
      [castA, inactiveCast],
    );

    expect(rows.map((row) => row.cast.name)).toEqual(['Cast A', 'External']);
    expect(rows[0].assignments).toEqual([{ user: alice, match: aliceMatch }]);
    expect(rows[1].assignments[0].user).toBe(bob);
  });

  it('希望表示を rank と score から分類する', () => {
    expect(getMatchPreference({ ...aliceMatch, rank: 1 })).toEqual({ label: '第一希望', tone: 'First' });
    expect(getMatchPreference({ ...aliceMatch, rank: 2 })).toEqual({ label: '第二希望', tone: 'Second' });
    expect(getMatchPreference({ ...aliceMatch, rank: 3 })).toEqual({ label: '第三希望', tone: 'Third' });
    expect(getMatchPreference({ ...aliceMatch, rank: 0, score: 50 })).toEqual({ label: '希望', tone: 'Flat' });
    expect(getMatchPreference({ ...aliceMatch, rank: 0, score: 0 })).toEqual({ label: '希望外', tone: 'Outside' });
  });

  it('ローテーション表示とグループ順を整える', () => {
    expect(getRotationLabel(undefined)).toBe('ローテ未設定');
    expect(getRotationLabel(1)).toBe('第2ローテ');
    expect(groupMatchesByRotation([{ ...bobMatch, rotationIndex: 2 }, { ...aliceMatch, rotationIndex: undefined }])).toEqual([
      { rotationIndex: 2, matches: [{ ...bobMatch, rotationIndex: 2 }] },
      { rotationIndex: null, matches: [{ ...aliceMatch, rotationIndex: undefined }] },
    ]);
  });

  it('キャスト別結果の列キーと列ラベルを返す', () => {
    const rows = [
      { user: alice, matches: [aliceMatch] },
      { user: bob, matches: [bobMatch] },
    ];

    expect(getCastResultColumnKeys(rows)).toEqual([0, 1]);
    expect(getCastResultColumnLabel(null)).toBe('応対する応募者');
    expect(getCastResultColumnLabel(0)).toBe('第1ローテ');
  });

  it('列キーに対応する割り当てだけを返す', () => {
    const castRow = {
      cast: castA,
      assignments: [
        { user: alice, match: aliceMatch },
        { user: bob, match: bobMatch },
      ],
    };

    expect(getAssignmentsForColumn(castRow, null)).toHaveLength(2);
    expect(getAssignmentsForColumn(castRow, 0)).toEqual([{ user: alice, match: aliceMatch }]);
  });

  it('テーブル番号ごとにスロットをまとめる', () => {
    const slots: TableSlot[] = [
      { user: alice, matches: [aliceMatch], tableIndex: 2 },
      { user: bob, matches: [bobMatch], tableIndex: 1 },
      { user: null, matches: [] },
    ];

    expect(groupTableSlots(slots)).toEqual([
      { tableIndex: 1, slots: [slots[1]] },
      { tableIndex: 2, slots: [slots[0]] },
      { tableIndex: 3, slots: [slots[2]] },
    ]);
  });

  it('失敗理由ごとにユーザー向け文言を返す', () => {
    expect(formatFailureMessage('time-limit')).toContain('30秒以内');
    expect(formatFailureMessage('insufficient-capacity')).toContain('不足');
    expect(formatFailureMessage('invalid-settings')).toContain('不整合');
    expect(formatFailureMessage('ng-conflict')).toContain('NG 条件');
    expect(formatFailureMessage(undefined)).toContain('NG 条件');
  });
});
