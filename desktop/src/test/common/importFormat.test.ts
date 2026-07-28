import { describe, expect, it } from 'vitest';
import {
  createEmptyColumnMapping,
  detectColumnMapping,
  getMappedColumnIndexes,
  resolveImportColumnMapping,
  type ColumnMapping,
} from '@/common/importFormat';

describe('createEmptyColumnMapping', () => {
  it('すべての応募項目を未選択の順位あり形式で初期化する', () => {
    expect(createEmptyColumnMapping()).toEqual({
      name: -1,
      x_id: -1,
      vrc_url: -1,
      cast1: -1,
      cast2: -1,
      cast3: -1,
      castInputType: 'single',
    });
  });
});

describe('detectColumnMapping', () => {
  it('日本語と英語の見出しから応募者情報と3つの希望列を判定する', () => {
    expect(detectColumnMapping([
      ' お名前 ',
      'X ID',
      'VRChat プロフィール',
      '第1希望',
      '第二希望',
      'Choice 3',
      '備考',
    ])).toEqual({
      name: 0,
      x_id: 1,
      vrc_url: 2,
      cast1: 3,
      cast2: 4,
      cast3: 5,
      castInputType: 'single',
    });
  });

  it('カンマ区切りの希望見出しを順位なしの単一列として判定する', () => {
    expect(detectColumnMapping(['ユーザー名', 'Twitter', '希望キャスト（カンマ区切り）'])).toEqual({
      name: 0,
      x_id: 1,
      vrc_url: -1,
      cast1: 2,
      cast2: -1,
      cast3: -1,
      castInputType: 'multiple',
    });
  });

  it('同じ項目に該当する見出しが複数あっても先頭列を使う', () => {
    const mapping = detectColumnMapping(['Name', 'お名前', 'XID', 'Twitter']);

    expect(mapping.name).toBe(0);
    expect(mapping.x_id).toBe(2);
  });
});

describe('resolveImportColumnMapping', () => {
  const mapping: ColumnMapping = {
    name: 0,
    x_id: 1,
    vrc_url: 2,
    cast1: 3,
    cast2: 4,
    cast3: 5,
    castInputType: 'multiple',
  };

  it('順位なし形式では第2・第3希望の列指定を取込対象から外す', () => {
    expect(resolveImportColumnMapping(mapping)).toEqual({
      ...mapping,
      cast2: -1,
      cast3: -1,
    });
  });

  it('順位あり形式の希望列は変更しない', () => {
    const rankedMapping = { ...mapping, castInputType: 'single' as const };

    expect(resolveImportColumnMapping(rankedMapping)).toBe(rankedMapping);
  });
});

describe('getMappedColumnIndexes', () => {
  it('割当済みの標準項目だけを重複なく返す', () => {
    const indexes = getMappedColumnIndexes({
      name: 0,
      nameColumn2: 6,
      x_id: 1,
      vrc_url: -1,
      cast1: 3,
      cast2: 3,
      cast3: -1,
      castInputType: 'single',
      extraColumns: [{ columnIndex: 7, label: '備考' }],
    });

    expect([...indexes]).toEqual([0, 1, 3]);
  });
});
