import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import type {
  MatchedCast,
  MatchingScoreSummary,
  TableSlot,
} from '@/features/matching/logics/matching-io';
import {
  buildMatchingResultSnapshot,
  getEventSavedMatchingResult,
  listEventSavedMatchingResults,
  restoreMatchingResultSnapshot,
  saveMatchingResult,
  type MatchingResultSnapshot,
} from '@/db/repositories/matchingRepository';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

const SESSION_CONTEXT = {
  eventName: 'Sample Event',
  timestamp: '20260807120000',
  generation: 1,
};

const scoreSummary: MatchingScoreSummary = {
  totalScore: 150,
  averageScore: 75,
  firstChoiceCount: 1,
  secondChoiceCount: 1,
  thirdChoiceCount: 0,
  flatPreferenceCount: 0,
  unpreferredCount: 0,
  ngWarningCount: 1,
};

function user(name: string, xId: string): UserBean {
  return { name, x_id: xId, casts: [], preference_mode: 'ranked', raw_extra: [] };
}

function match(cast: CastBean, overrides: Partial<MatchedCast> = {}): MatchedCast {
  return {
    cast,
    rank: 1,
    rotationIndex: 0,
    score: 100,
    isNGWarning: false,
    ngReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  invokeMock.mockReset();
});

describe('matching result snapshot', () => {
  it('出席キャストと結果内参照を自己完結した保存データへ変換する', () => {
    const firstCast: CastBean = {
      id: 10,
      name: 'キャストA',
      aliases: ['検索用別名'],
      is_present: true,
      ng_entries: [{ username: '応募者B', accountId: 'applicant_b', notes: '表示専用メモ' }],
      memo: '名簿メモ',
    };
    const referencedAbsentCast: CastBean = { id: 20, name: 'キャストB', is_present: false };
    const unrelatedAbsentCast: CastBean = { id: 30, name: 'キャストC', is_present: false };
    const firstWinner = user('応募者A', 'applicant_a');
    const secondWinner = user('応募者B', 'applicant_b');
    const result = new Map<string, MatchedCast[]>([
      [firstWinner.x_id, [match(firstCast)]],
      [secondWinner.x_id, [match(referencedAbsentCast, {
        rank: 2,
        rotationIndex: 1,
        score: 50,
        isNGWarning: true,
        ngReason: 'NG条件を確認してください',
      })]],
    ]);
    const tableSlots: TableSlot[] = [{
      tableIndex: 1,
      user: firstWinner,
      matches: [match(firstCast)],
    }];

    const snapshot = buildMatchingResultSnapshot(
      [firstWinner, secondWinner],
      [firstCast, referencedAbsentCast, unrelatedAbsentCast],
      result,
      tableSlots,
      scoreSummary,
    );

    expect(snapshot.casts).toEqual([
      {
        id: 10,
        name: 'キャストA',
        isPresent: true,
        ngEntries: [{ username: '応募者B', accountId: 'applicant_b' }],
      },
      { id: 20, name: 'キャストB', isPresent: false, ngEntries: [] },
    ]);
    expect(snapshot.applicants).toEqual([
      {
        user: { name: '応募者A', xId: 'applicant_a' },
        matches: [{
          castId: 10,
          rank: 1,
          rotationIndex: 0,
          score: 100,
          isNgWarning: false,
          ngReason: null,
        }],
      },
      {
        user: { name: '応募者B', xId: 'applicant_b' },
        matches: [{
          castId: 20,
          rank: 2,
          rotationIndex: 1,
          score: 50,
          isNgWarning: true,
          ngReason: 'NG条件を確認してください',
        }],
      },
    ]);
    expect(snapshot.tableSlots).toEqual([{
      tableIndex: 1,
      user: { name: '応募者A', xId: 'applicant_a' },
      matches: [{
        castId: 10,
        rank: 1,
        rotationIndex: 0,
        score: 100,
        isNgWarning: false,
        ngReason: null,
      }],
    }]);
    expect(snapshot.scoreSummary).toBe(scoreSummary);
  });

  it('割り当てがない当選者を保存対象として受け付けない', () => {
    const winner = user('応募者A', 'applicant_a');

    expect(() => buildMatchingResultSnapshot(
      [winner],
      [],
      new Map(),
      [],
      scoreSummary,
    )).toThrow('保存するマッチング結果に割り当てがない応募者が含まれています。');
  });

  it('保存データを結果表示用の型へ復元する', () => {
    const snapshot: MatchingResultSnapshot = {
      casts: [{ id: 10, name: 'キャストA', isPresent: true, ngEntries: [] }],
      applicants: [{
        user: { name: '応募者A', xId: 'applicant_a' },
        matches: [{
          castId: 10,
          rank: 1,
          rotationIndex: 0,
          score: 100,
          isNgWarning: false,
          ngReason: null,
        }],
      }],
      tableSlots: [{
        tableIndex: 1,
        user: { name: '応募者A', xId: 'applicant_a' },
        matches: [{
          castId: 10,
          rank: 1,
          rotationIndex: 0,
          score: 100,
          isNgWarning: false,
          ngReason: null,
        }],
      }],
      scoreSummary,
    };

    const restored = restoreMatchingResultSnapshot(snapshot);

    expect(restored.winners).toEqual([{
      name: '応募者A',
      x_id: 'applicant_a',
      casts: [],
      preference_mode: 'ranked',
      raw_extra: [],
    }]);
    expect(restored.casts).toEqual([{ id: 10, name: 'キャストA', is_present: true }]);
    expect(restored.result.get('applicant_a')).toEqual([{
      cast: { id: 10, name: 'キャストA', is_present: true },
      rank: 1,
      rotationIndex: 0,
      score: 100,
      isNGWarning: false,
      ngReason: null,
    }]);
    expect(restored.tableSlots[0]).toEqual({
      tableIndex: 1,
      user: restored.winners[0],
      matches: restored.result.get('applicant_a'),
    });
    expect(restored.scoreSummary).toBe(scoreSummary);
  });

  it('必須配列または参照先キャストが欠けた保存データを拒否する', () => {
    const malformed = {
      casts: [],
      applicants: [],
      tableSlots: null,
      scoreSummary,
    } as unknown as MatchingResultSnapshot;
    expect(() => restoreMatchingResultSnapshot(malformed))
      .toThrow('保存済みマッチング結果の表示データが不正です。');

    const missingCast: MatchingResultSnapshot = {
      casts: [],
      applicants: [{
        user: { name: '応募者A', xId: 'applicant_a' },
        matches: [{
          castId: 99,
          rank: 1,
          rotationIndex: 0,
          score: 100,
          isNgWarning: false,
          ngReason: null,
        }],
      }],
      tableSlots: [],
      scoreSummary,
    };
    expect(() => restoreMatchingResultSnapshot(missingCast))
      .toThrow('保存済みマッチング結果のキャスト情報が不足しています。');
  });
});

describe('saved matching result operations', () => {
  it('保存 payload を backend command に渡してIDを返す', async () => {
    const snapshot: MatchingResultSnapshot = {
      casts: [], applicants: [], tableSlots: [], scoreSummary,
    };
    invokeMock.mockResolvedValueOnce(42);

    await expect(saveMatchingResult('マッチング結果', 'M003', 2, snapshot, SESSION_CONTEXT))
      .resolves.toBe(42);
    expect(invokeMock).toHaveBeenCalledWith('save_matching_result_atomic', {
      eventName: 'Sample Event',
      timestamp: '20260807120000',
      label: 'マッチング結果',
      matchingTypeCode: 'M003',
      winnerCount: 2,
      snapshot,
    });
  });

  it('イベント共有DBの保存一覧と詳細を backend から取得する', async () => {
    const summaries = [{
      savedResultId: 42,
      label: 'マッチング結果',
      matchingTypeCode: 'M003' as const,
      winnerCount: 2,
      createdAt: '2026-08-07 12:00:00',
    }];
    const detail = {
      ...summaries[0],
      snapshot: { casts: [], applicants: [], tableSlots: [], scoreSummary },
    };
    invokeMock.mockResolvedValueOnce(summaries).mockResolvedValueOnce(detail);

    await expect(listEventSavedMatchingResults('Sample Event')).resolves.toEqual(summaries);
    await expect(getEventSavedMatchingResult('Sample Event', { savedResultId: 42 }))
      .resolves.toEqual(detail);
    expect(invokeMock.mock.calls).toEqual([
      ['list_event_saved_matching_results', { eventName: 'Sample Event' }],
      ['get_event_saved_matching_result', { eventName: 'Sample Event', savedResultId: 42 }],
    ]);
  });
});
