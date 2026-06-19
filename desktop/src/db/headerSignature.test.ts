import { describe, expect, it } from 'vitest';
import { computeHeaderSignature } from './headerSignature';

describe('computeHeaderSignature', () => {
  it('前後空白と大文字小文字の差を正規化する', () => {
    expect(computeHeaderSignature([' Name ', 'X ID', '\tMemo\n'])).toBe('name|x id|memo');
  });

  it('空文字と空白だけの列名を signature から除外する', () => {
    expect(computeHeaderSignature(['name', '', '   ', 'account'])).toBe('name|account');
  });

  it('列順と重複列を保持する', () => {
    expect(computeHeaderSignature(['memo', 'name', 'memo'])).toBe('memo|name|memo');
  });

  it('日本語列名は空白除去後の文字列を保持する', () => {
    expect(computeHeaderSignature([' 名前 ', 'X ID', ' 備考 '])).toBe('名前|x id|備考');
  });

  it('有効な列名がない場合は空文字を返す', () => {
    expect(computeHeaderSignature([])).toBe('');
    expect(computeHeaderSignature(['', '  '])).toBe('');
  });
});
