import { describe, expect, it } from 'vitest';
import { parseTSV } from '@/common/csvParse';

describe('parseTSV', () => {
  it('タブ区切りと複数種類の改行を二次元配列に変換する', () => {
    expect(parseTSV('name\tx\r\nAlice\t@alice\nBob\t@bob\rCarol\t@carol')).toEqual([
      ['name', 'x'],
      ['Alice', '@alice'],
      ['Bob', '@bob'],
      ['Carol', '@carol'],
    ]);
  });

  it('引用符内のタブと改行をセル内容として保持する', () => {
    expect(parseTSV('name\tnote\n"Alice"\t"line1\nline2\tend"')).toEqual([
      ['name', 'note'],
      ['Alice', 'line1\nline2\tend'],
    ]);
  });

  it('引用符内の連続ダブルクォートを1文字のダブルクォートとして扱う', () => {
    expect(parseTSV('name\tnote\nAlice\t"say ""hello"""')).toEqual([
      ['name', 'note'],
      ['Alice', 'say "hello"'],
    ]);
  });

  it('末尾の空セルを保持する', () => {
    expect(parseTSV('name\tnote\t\nAlice\t\t')).toEqual([
      ['name', 'note', ''],
      ['Alice', '', ''],
    ]);
  });
});
