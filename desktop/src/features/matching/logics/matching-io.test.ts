import { describe, expect, it } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import { MatchingService } from './matching-io';

function createUser(name: string, xId: string, casts: string[], preferenceMode?: UserBean['preference_mode']): UserBean {
  return {
    name,
    x_id: xId,
    casts,
    preference_mode: preferenceMode,
    raw_extra: [],
  };
}

function createCast(name: string, ngAccountId?: string): CastBean {
  return {
    name,
    is_present: true,
    ng_entries: ngAccountId ? [{ accountId: ngAccountId }] : [],
  };
}

describe('MatchingService.runMatching', () => {
  it('M002 は希望点が最大になるように応募者を出勤キャストへ割り当てる', () => {
    const result = MatchingService.runMatching(
      [
        createUser('Alice', '@alice', ['Cast B']),
        createUser('Bob', '@bob', ['Cast A']),
      ],
      [createCast('Cast A'), createCast('Cast B')],
      'M002',
      { rotationCount: 1, totalTables: 2 },
      'accountId',
      'exclude',
    );

    expect(result.ngConflict).toBeUndefined();
    expect(result.userMap.get('@alice')?.[0]?.cast.name).toBe('Cast B');
    expect(result.userMap.get('@bob')?.[0]?.cast.name).toBe('Cast A');
    expect(result.scoreSummary).toMatchObject({
      totalScore: 180,
      averageScore: 90,
      firstChoiceCount: 2,
      isConfirmable: true,
    });
  });

  it('出勤キャスト数やローテーション数が不足すると容量不足として失敗する', () => {
    const result = MatchingService.runMatching(
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

  it('exclude モードで NG しかない場合は NG 競合として失敗する', () => {
    const result = MatchingService.runMatching(
      [createUser('Alice', '@alice', ['Cast A'])],
      [createCast('Cast A', '@alice')],
      'M002',
      { rotationCount: 1, totalTables: 1 },
      'accountId',
      'exclude',
    );

    expect(result).toMatchObject({
      ngConflict: true,
      failureReason: 'ng-conflict',
    });
  });

  it('warn モードでは NG を結果へ残し、確定不可理由として集計する', () => {
    const result = MatchingService.runMatching(
      [createUser('Alice', '@alice', ['Cast A'])],
      [createCast('Cast A', '@alice')],
      'M002',
      { rotationCount: 1, totalTables: 1 },
      'accountId',
      'warn',
    );

    expect(result.userMap.get('@alice')?.[0]).toMatchObject({
      isNGWarning: true,
      ngReason: 'このユーザーはキャスト「Cast A」のNG対象です',
      score: 90,
    });
    expect(result.scoreSummary).toMatchObject({
      ngWarningCount: 1,
      isConfirmable: false,
      blockingReasons: ['Alice が Cast A のNG対象です。'],
    });
  });

  it('M003 はキャスト単位を作れない設定を invalid-settings として返す', () => {
    const result = MatchingService.runMatching(
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

  it('M003 の warn モードでも NG 警告を最終結果へ付与する', () => {
    const result = MatchingService.runMatching(
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
      'accountId',
      'warn',
    );

    expect(result.userMap.get('@alice')?.[0]).toMatchObject({
      cast: { name: 'Cast A' },
      isNGWarning: true,
      ngReason: 'このユーザーはキャスト「Cast A」のNG対象です',
    });
    expect(result.scoreSummary?.isConfirmable).toBe(false);
  });
});
