import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import type { SessionWorkflowState } from '@/common/types/sessionWorkflow';
import {
  getMatchingCastFingerprint,
  getMatchingInputFingerprint,
  isSameLotteryResult,
  isSameWorkflowState,
  type MatchingInputSnapshot,
} from '@/features/matching/logics/matching-input-integrity';

const workflow: SessionWorkflowState = {
  matchingTypeCode: 'M003',
  lotteryCount: 4,
  rotationCount: 2,
  totalTables: 2,
  usersPerTable: 2,
  castsPerRotation: 2,
  allowM003EmptySeats: true,
  m003SameDaySlotCount: 1,
};

function winner(overrides: Partial<UserBean> = {}): UserBean {
  return {
    id: 1,
    name: '応募者A',
    x_id: '@applicant_a',
    casts: ['キャストA', 'キャストB'],
    cast_ids: [10, 20],
    preference_mode: 'ranked',
    is_guaranteed: true,
    raw_extra: [],
    ...overrides,
  };
}

function cast(overrides: Partial<CastBean> = {}): CastBean {
  return {
    id: 10,
    name: 'キャストA',
    is_present: true,
    ng_entries: [{ username: '応募者A', accountId: '@applicant_a' }],
    ...overrides,
  };
}

function snapshot(overrides: Partial<MatchingInputSnapshot> = {}): MatchingInputSnapshot {
  return {
    winners: [winner()],
    casts: [cast()],
    workflow,
    searchMode: 'quality',
    isLotteryResultCurrent: true,
    ...overrides,
  };
}

describe('getMatchingCastFingerprint', () => {
  it('結果へ影響する値が同じキャスト一覧から同じ指紋を作る', () => {
    const left = [cast()];
    const right = [cast({
      aliases: ['別名'],
      contact_urls: ['https://example.com/cast-a'],
      group_name: '第1グループ',
      photo_data_url: 'data:image/png;base64,example',
      memo: '運営メモ',
      ng_entries: [{ username: '応募者A', accountId: '@applicant_a', notes: '補足' }],
    })];

    expect(getMatchingCastFingerprint(right)).toBe(getMatchingCastFingerprint(left));
  });

  it.each([
    ['安定ID', [cast({ id: 11 })]],
    ['名前', [cast({ name: 'キャストB' })]],
    ['出勤状態', [cast({ is_present: false })]],
    ['NGユーザー名', [cast({ ng_entries: [{ username: '応募者B', accountId: '@applicant_a' }] })]],
    ['NGアカウントID', [cast({ ng_entries: [{ username: '応募者A', accountId: '@applicant_b' }] })]],
  ])('%sが異なるキャスト一覧を別の指紋にする', (_label, changedCasts) => {
    expect(getMatchingCastFingerprint(changedCasts)).not.toBe(getMatchingCastFingerprint([cast()]));
  });

  it('キャストとNG項目の並び順を実行条件として区別する', () => {
    const castA = cast({
      ng_entries: [
        { username: '応募者A', accountId: '@applicant_a' },
        { username: '応募者B', accountId: '@applicant_b' },
      ],
    });
    const castB = cast({ id: 20, name: 'キャストB', ng_entries: [] });

    expect(getMatchingCastFingerprint([castA, castB])).not.toBe(
      getMatchingCastFingerprint([castB, castA]),
    );
    expect(getMatchingCastFingerprint([castA])).not.toBe(getMatchingCastFingerprint([{
      ...castA,
      ng_entries: [...(castA.ng_entries ?? [])].reverse(),
    }]));
  });

  it('空一覧と未登録のNG一覧を安定して表現する', () => {
    expect(getMatchingCastFingerprint([])).toBe('[]');
    expect(getMatchingCastFingerprint([cast({ ng_entries: undefined })])).toBe(
      getMatchingCastFingerprint([cast({ ng_entries: [] })]),
    );
  });
});

describe('getMatchingInputFingerprint', () => {
  it('同じ実行条件なら参照と結果に影響しない応募者情報が異なっても同じ指紋を作る', () => {
    const changedMetadata = snapshot({
      winners: [winner({
        vrc_url: 'https://vrchat.com/home/user/example',
        raw_extra: [{ key: '備考', value: '追加情報' }],
      })],
      workflow: { ...workflow },
    });

    expect(getMatchingInputFingerprint(changedMetadata)).toBe(getMatchingInputFingerprint(snapshot()));
  });

  it.each([
    ['応募者の安定ID', winner({ id: 2 })],
    ['応募者名', winner({ name: '応募者B' })],
    ['X ID', winner({ x_id: '@applicant_b' })],
    ['希望キャスト名', winner({ casts: ['キャストB', 'キャストA'] })],
    ['希望キャストID', winner({ cast_ids: [20, 10] })],
    ['希望形式', winner({ preference_mode: 'flat' })],
    ['確定枠', winner({ is_guaranteed: false })],
  ])('%sの変更を別の入力として検出する', (_label, changedWinner) => {
    expect(getMatchingInputFingerprint(snapshot({ winners: [changedWinner] }))).not.toBe(
      getMatchingInputFingerprint(snapshot()),
    );
  });

  it('キャスト、ワークフロー、探索モード、抽選結果の有効状態を入力へ含める', () => {
    const baseline = getMatchingInputFingerprint(snapshot());
    const changedSnapshots = [
      snapshot({ casts: [cast({ is_present: false })] }),
      snapshot({ workflow: { ...workflow, rotationCount: workflow.rotationCount + 1 } }),
      snapshot({ searchMode: 'efficiency' }),
      snapshot({ isLotteryResultCurrent: false }),
    ];

    expect(changedSnapshots.map(getMatchingInputFingerprint)).not.toContain(baseline);
  });

  it('当選者とキャストの並び順を実行条件として区別する', () => {
    const winnerB = winner({ id: 2, name: '応募者B', x_id: '@applicant_b' });
    const castB = cast({ id: 20, name: 'キャストB' });
    const ordered = snapshot({ winners: [winner(), winnerB], casts: [cast(), castB] });

    expect(getMatchingInputFingerprint({ ...ordered, winners: [...ordered.winners].reverse() })).not.toBe(
      getMatchingInputFingerprint(ordered),
    );
    expect(getMatchingInputFingerprint({ ...ordered, casts: [...ordered.casts].reverse() })).not.toBe(
      getMatchingInputFingerprint(ordered),
    );
  });

  it('空一覧と未指定の任意項目を安定して表現する', () => {
    const withoutOptionalValues = winner({
      id: undefined,
      cast_ids: undefined,
      preference_mode: undefined,
      is_guaranteed: undefined,
    });

    expect(getMatchingInputFingerprint(snapshot({ winners: [], casts: [] }))).toBe(
      getMatchingInputFingerprint(snapshot({ winners: [], casts: [] })),
    );
    expect(getMatchingInputFingerprint(snapshot({ winners: [withoutOptionalValues] }))).toBe(
      getMatchingInputFingerprint(snapshot({
        winners: [{ ...withoutOptionalValues, is_guaranteed: false }],
      })),
    );
  });
});

describe('isSameWorkflowState', () => {
  it('全項目が一致するワークフローを同一と判定する', () => {
    expect(isSameWorkflowState({ ...workflow }, workflow)).toBe(true);
  });

  it.each([
    ['matchingTypeCode', 'M002'],
    ['lotteryCount', 5],
    ['rotationCount', 3],
    ['totalTables', 3],
    ['usersPerTable', 3],
    ['castsPerRotation', 3],
    ['allowM003EmptySeats', false],
    ['m003SameDaySlotCount', 2],
  ] as const)('%sの不一致を検出する', (key, changedValue) => {
    const actual = { ...workflow, [key]: changedValue } as SessionWorkflowState;

    expect(isSameWorkflowState(actual, workflow)).toBe(false);
  });

  it('0とfalseを含む境界条件も値どおりに比較する', () => {
    const zeroState: SessionWorkflowState = {
      ...workflow,
      lotteryCount: 0,
      totalTables: 0,
      allowM003EmptySeats: false,
      m003SameDaySlotCount: 0,
    };

    expect(isSameWorkflowState({ ...zeroState }, zeroState)).toBe(true);
    expect(isSameWorkflowState({ ...zeroState, lotteryCount: 1 }, zeroState)).toBe(false);
  });
});

describe('isSameLotteryResult', () => {
  it('X ID、確定枠、並び順が一致する抽選結果を同一と判定する', () => {
    const winners = [winner(), winner({ id: 2, x_id: '@applicant_b', is_guaranteed: false })];
    const persistedRows = [
      { x_id: '@applicant_a', is_guaranteed: 1 },
      { x_id: '@applicant_b', is_guaranteed: 0 },
    ];

    expect(isSameLotteryResult(winners, persistedRows)).toBe(true);
  });

  it('X ID、確定枠、並び順の不一致を検出する', () => {
    const winners = [winner(), winner({ id: 2, x_id: '@applicant_b', is_guaranteed: false })];

    expect(isSameLotteryResult(winners, [
      { x_id: '@other', is_guaranteed: 1 },
      { x_id: '@applicant_b', is_guaranteed: 0 },
    ])).toBe(false);
    expect(isSameLotteryResult(winners, [
      { x_id: '@applicant_a', is_guaranteed: 0 },
      { x_id: '@applicant_b', is_guaranteed: 0 },
    ])).toBe(false);
    expect(isSameLotteryResult(winners, [
      { x_id: '@applicant_b', is_guaranteed: 0 },
      { x_id: '@applicant_a', is_guaranteed: 1 },
    ])).toBe(false);
  });

  it('件数の不一致を双方の向きで検出する', () => {
    expect(isSameLotteryResult([winner()], [])).toBe(false);
    expect(isSameLotteryResult([], [{ x_id: '@applicant_a', is_guaranteed: 0 }])).toBe(false);
  });

  it('空の抽選結果同士を同一とし、未指定の確定枠を通常枠として扱う', () => {
    expect(isSameLotteryResult([], [])).toBe(true);
    expect(isSameLotteryResult(
      [winner({ is_guaranteed: undefined })],
      [{ x_id: '@applicant_a', is_guaranteed: 0 }],
    )).toBe(true);
  });
});
