import { describe, expect, it } from 'vitest';
import { parseXUsername } from './xIdUtils';

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
