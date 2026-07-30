import { describe, expect, it } from 'vitest';
import type { CastBean, CautionCandidate, NGUserEntry } from '@/features/ng-management/ngUserManagementModel';
import {
  buildXProfileUrl,
  createCandidateCautionUser,
  createCastNgEntry,
  createManualCautionUser,
  filterCastsByName,
  isDuplicateCastNgEntry,
  removeCastNgEntry,
  resolveDisplayedThreshold,
  resolveSelectedCastId,
  updateCastNgEntryNotes,
} from '@/features/ng-management/ngUserManagementModel';

const casts: CastBean[] = [
  { id: 11, name: 'Polaris', is_present: true },
  { id: 12, name: 'Vega', is_present: false },
];

describe('selection and filtering', () => {
  it('選択中のキャストが残っていれば維持し、未選択・削除済みなら先頭へ移す', () => {
    expect(resolveSelectedCastId(casts, 12)).toBe(12);
    expect(resolveSelectedCastId(casts, null)).toBe(11);
    expect(resolveSelectedCastId(casts, 99)).toBe(11);
    expect(resolveSelectedCastId([], 12)).toBeNull();
  });

  it('正整数の入力だけを表示閾値に使う', () => {
    expect(resolveDisplayedThreshold('10', 2)).toBe(10);
    expect(resolveDisplayedThreshold('', 2)).toBe(2);
    expect(resolveDisplayedThreshold('0', 2)).toBe(2);
    expect(resolveDisplayedThreshold('1.5', 2)).toBe(2);
    expect(resolveDisplayedThreshold('invalid', 2)).toBe(2);
  });

  it('空白だけの検索は全件を返し、それ以外は大小文字を区別せず名前で絞る', () => {
    expect(filterCastsByName(casts, '  ')).toBe(casts);
    expect(filterCastsByName(casts, 'LAR')).toEqual([casts[0]]);
    expect(filterCastsByName(casts, 'missing')).toEqual([]);
  });
});

describe('buildXProfileUrl', () => {
  it.each([
    ['Sample_User', 'https://x.com/Sample_User'],
    ['@Sample_User', 'https://x.com/Sample_User'],
  ])('%s をXプロフィールURLへ変換する', (accountId, expected) => {
    expect(buildXProfileUrl(accountId)).toBe(expected);
  });

  it('X IDとして解釈できない値はURLを返さない', () => {
    expect(buildXProfileUrl(undefined)).toBeNull();
    expect(buildXProfileUrl('')).toBeNull();
    expect(buildXProfileUrl('https://twitter.com/Sample_User/status/1')).toBeNull();
    expect(buildXProfileUrl('https://example.com/user')).toBeNull();
  });
});

describe('cast NG entries', () => {
  it('入力をトリムし、大文字小文字を保った内部usernameへ変換する', () => {
    expect(createCastNgEntry({
      username: '  Alice  ',
      accountId: '  @MixedCase  ',
      notes: '  理由メモ  ',
    })).toEqual({
      username: 'Alice',
      accountId: 'MixedCase',
      notes: '理由メモ',
    });
  });

  it('空の任意項目を省略し、X IDが不正なら登録値を作らない', () => {
    expect(createCastNgEntry({ username: ' ', accountId: '@alice', notes: ' ' })).toEqual({
      username: undefined,
      accountId: 'alice',
      notes: undefined,
    });
    expect(createCastNgEntry({ username: 'Alice', accountId: 'https://example.com/alice', notes: '' })).toBeNull();
  });

  it('usernameを使わず、先頭の@と大文字小文字を除いたX IDだけで重複を判定する', () => {
    const entries: NGUserEntry[] = [{ username: 'Alice', accountId: 'Sample' }];

    expect(isDuplicateCastNgEntry(entries, { username: 'Alice', accountId: 'Sample' })).toBe(true);
    expect(isDuplicateCastNgEntry(entries, { username: 'alice', accountId: '@Sample' })).toBe(true);
    expect(isDuplicateCastNgEntry(entries, { username: 'Alice', accountId: 'sample' })).toBe(true);
    expect(isDuplicateCastNgEntry(entries, { username: 'Alice', accountId: 'other' })).toBe(false);
    expect(isDuplicateCastNgEntry(undefined, { username: 'Alice', accountId: 'Sample' })).toBe(false);
  });

  it('対象と同じusername・accountIdの登録をすべて削除する', () => {
    const target = { username: 'Alice', accountId: 'alice' };
    const retained = { username: 'Alice', accountId: 'other' };

    expect(removeCastNgEntry([target, retained, { ...target, notes: '別メモ' }], target)).toEqual([retained]);
    expect(removeCastNgEntry(undefined, target)).toEqual([]);
  });

  it('指定indexのメモだけを更新し、空文字は未設定へ戻す', () => {
    const entries: NGUserEntry[] = [
      { username: 'Alice', accountId: 'alice', notes: '旧メモ' },
      { username: 'Bob', accountId: 'bob', notes: '維持' },
    ];

    expect(updateCastNgEntryNotes(entries, 0, '新メモ')).toEqual([
      { username: 'Alice', accountId: 'alice', notes: '新メモ' },
      entries[1],
    ]);
    expect(updateCastNgEntryNotes(entries, 0, '')[0]).toEqual({
      username: 'Alice',
      accountId: 'alice',
      notes: undefined,
    });
  });
});

describe('caution user conversion', () => {
  it('手動入力を登録時刻付き要注意人物へ変換する', () => {
    expect(createManualCautionUser({
      username: '  Alice  ',
      accountId: '@MixedCase',
      notes: '  引き継ぎ事項  ',
    }, '2026-07-28T10:00:00.000Z')).toEqual({
      username: 'Alice',
      accountId: 'MixedCase',
      ngCastCount: 0,
      registeredAt: '2026-07-28T10:00:00.000Z',
      notes: '引き継ぎ事項',
    });
  });

  it('手動登録の名前が空なら整形後のX IDを表示名に使う', () => {
    expect(createManualCautionUser({
      username: '',
      accountId: '@alice',
      notes: '',
    }, 'registered-at')).toEqual({
      username: '@alice',
      accountId: 'alice',
      ngCastCount: 0,
      registeredAt: 'registered-at',
      notes: undefined,
    });
    expect(createManualCautionUser({ username: 'Alice', accountId: '', notes: '' }, 'registered-at')).toBeNull();
  });

  it('自動候補の名称・NG人数・理由を保持して固定登録へ変換する', () => {
    const candidate: CautionCandidate = {
      accountId: '@MixedCase',
      usernames: ['Alice', 'Alicia'],
      castCount: 3,
    };

    expect(createCandidateCautionUser(candidate, 'registered-at', 'NG報告3件')).toEqual({
      username: 'Alice / Alicia',
      accountId: 'MixedCase',
      ngCastCount: 3,
      registeredAt: 'registered-at',
      notes: 'NG報告3件',
    });
  });

  it('候補に名前がなければX IDを表示名に使い、不正なX IDは拒否する', () => {
    expect(createCandidateCautionUser({ accountId: '@alice', usernames: [], castCount: 2 }, 'registered-at', '理由')).toMatchObject({
      username: '@alice',
      accountId: 'alice',
    });
    expect(createCandidateCautionUser({ accountId: '', usernames: [], castCount: 2 }, 'registered-at', '理由')).toBeNull();
    expect(createCandidateCautionUser({ accountId: 'https://x.com/alice', usernames: [], castCount: 2 }, 'registered-at', '理由')).toBeNull();
  });
});
