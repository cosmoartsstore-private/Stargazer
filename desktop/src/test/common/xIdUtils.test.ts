import { describe, expect, it } from 'vitest';
import { mapRowToUserBeanWithMapping } from '@/common/sheetParsers';
import {
  findXIdIdentityIssues,
  formatXAccountId,
  normalizeXAccountId,
  parseXUsername,
} from '@/common/xIdUtils';

describe('parseXUsername', () => {
  it('先頭の @ と前後空白を除いたユーザー名を返す', () => {
    expect(parseXUsername('  @sample_user  ')).toBe('sample_user');
  });

  it('X と Twitter のプロフィール URL からユーザー名部分を返す', () => {
    expect(parseXUsername('https://x.com/sample_user/status/123')).toBe('sample_user');
    expect(parseXUsername('twitter.com/SampleUser?lang=ja')).toBe('SampleUser');
  });

  it('URL ではない単独ユーザー名はそのまま返す', () => {
    expect(parseXUsername('sample_user_store')).toBe('sample_user_store');
  });

  it('プロフィール URL と判定できない文字列は null を返す', () => {
    expect(parseXUsername('https://example.com/sample_user')).toBeNull();
    expect(parseXUsername('')).toBeNull();
    expect(parseXUsername('@   ')).toBeNull();
  });
});

describe('normalizeXAccountId', () => {
  it('ユーザー名・@ID・プロフィールURLを大小文字を区別しない比較キーへ揃える', () => {
    expect(normalizeXAccountId('sample_user')).toBe('@sample_user');
    expect(normalizeXAccountId('@sample_user')).toBe('@sample_user');
    expect(normalizeXAccountId('https://x.com/sample_user')).toBe('@sample_user');
    expect(normalizeXAccountId('https://x.com/Sample_User')).toBe('@sample_user');
  });

  it('X ID として解釈できない値は null を返す', () => {
    expect(normalizeXAccountId('https://example.com/sample_user')).toBeNull();
    expect(normalizeXAccountId('')).toBeNull();
  });
});

describe('formatXAccountId', () => {
  it('入力時の大文字小文字を保ったまま@ID形式へ揃える', () => {
    expect(formatXAccountId('Sample_User')).toBe('@Sample_User');
    expect(formatXAccountId('https://x.com/MixedCase')).toBe('@MixedCase');
  });
});

describe('findXIdIdentityIssues', () => {
  it('空の X ID を問題行として返す', () => {
    expect(findXIdIdentityIssues([
      { rowNumber: 1, xId: 'alice' },
      { rowNumber: 2, xId: '   ' },
    ])).toEqual([
      { rowNumber: 2, xId: '   ', kind: 'empty' },
    ]);
  });

  it('大文字小文字だけが異なる重複 X ID は該当行をすべて返す', () => {
    expect(findXIdIdentityIssues([
      { rowNumber: 1, xId: 'Sample_User' },
      { rowNumber: 2, xId: 'sample_user' },
      { rowNumber: 3, xId: 'other_user' },
    ])).toEqual([
      { rowNumber: 1, xId: 'Sample_User', kind: 'duplicate' },
      { rowNumber: 2, xId: 'sample_user', kind: 'duplicate' },
    ]);
  });

  it('@ID と X プロフィール URL を取込変換した後の重複を検出する', () => {
    const mapping = {
      name: 0,
      x_id: 1,
      vrc_url: -1,
      cast1: -1,
      cast2: -1,
      cast3: -1,
      castInputType: 'single',
    } as const;
    const users = [
      mapRowToUserBeanWithMapping(['Alice', '@Sample_User'], mapping),
      mapRowToUserBeanWithMapping(['Bob', 'https://x.com/sample_user'], mapping),
    ];

    expect(findXIdIdentityIssues(users.map((user, index) => ({
      rowNumber: index + 1,
      xId: user.x_id,
    })))).toHaveLength(2);
  });

  it('重複行を1件削除した状態では残った X ID を問題にしない', () => {
    expect(findXIdIdentityIssues([
      { rowNumber: 2, xId: 'sample_user' },
      { rowNumber: 3, xId: 'other_user' },
    ])).toEqual([]);
  });

  it('複数の空 X ID を重複として二重計上しない', () => {
    expect(findXIdIdentityIssues([
      { rowNumber: 1, xId: '' },
      { rowNumber: 2, xId: ' ' },
    ])).toEqual([
      { rowNumber: 1, xId: '', kind: 'empty' },
      { rowNumber: 2, xId: ' ', kind: 'empty' },
    ]);
  });
});
