import { describe, expect, it } from 'vitest';
import { DelimitedParseError, parseTSV } from '@/common/csvParse';

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

  it.each([
    ['引用されていないフィールド内の引用符', 'Alice\tbroken"value', 1, 13],
    ['閉じ引用符後の文字', 'Alice\t"value"x', 1, 14],
    ['閉じていない引用フィールド', 'Alice\t"value', 1, 7],
  ])('%sを行・列情報つきで拒否する', (_label, source, line, column) => {
    try {
      parseTSV(source);
      throw new Error('parseTSVが不正な引用符を受け付けました');
    } catch (error) {
      expect(error).toBeInstanceOf(DelimitedParseError);
      expect(error).toMatchObject({ line, column });
    }
  });
});
