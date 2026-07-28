import { describe, expect, it } from 'vitest';
import type { ColumnMapping } from '@/common/importFormat';
import {
  buildImportPreviewModel,
  getImportHeaderLabel,
  getSelectedImportColumnValue,
  IMPORT_PREVIEW_MAX_ROWS,
  UNUSED_COLUMN_VALUE,
  type ImportSourceRow,
} from '@/features/import/importPreviewModel';

const rankedMapping: ColumnMapping = {
  name: 0,
  x_id: 1,
  vrc_url: -1,
  cast1: 2,
  cast2: 3,
  cast3: 4,
  castInputType: 'single',
};

describe('import column display helpers', () => {
  it('空の見出しには1始まりの列名を補う', () => {
    expect(getImportHeaderLabel(['名前', ''], 0)).toBe('名前');
    expect(getImportHeaderLabel(['名前', ''], 1)).toBe('列2');
    expect(getImportHeaderLabel([], 2)).toBe('列3');
  });

  it('選択肢に存在しない列番号は未使用値へ戻す', () => {
    const options = [
      { value: UNUSED_COLUMN_VALUE, label: '使用しない' },
      { value: '0', label: '列1: 名前' },
    ];

    expect(getSelectedImportColumnValue(0, options)).toBe('0');
    expect(getSelectedImportColumnValue(3, options)).toBe(UNUSED_COLUMN_VALUE);
    expect(getSelectedImportColumnValue(-1, options)).toBe(UNUSED_COLUMN_VALUE);
  });
});

describe('buildImportPreviewModel', () => {
  it('順位なし形式で未使用の希望列と未割当列を追加列として保持する', () => {
    const model = buildImportPreviewModel(
      ['名前', 'X ID', '希望キャスト', '第2希望', '備考', ''],
      [{ rowNumber: 7, cells: ['Alice', '@Alice_ID', 'Cast A, Cast B', 'Cast C', '参加希望', '自由記述'] }],
      { ...rankedMapping, castInputType: 'multiple' },
    );

    expect(model.importMapping).toEqual({
      ...rankedMapping,
      castInputType: 'multiple',
      cast2: -1,
      cast3: -1,
      extraColumns: [
        { columnIndex: 3, label: '第2希望' },
        { columnIndex: 4, label: '備考' },
        { columnIndex: 5, label: '列6' },
      ],
    });
    expect(model.mappedRows[0]?.user).toMatchObject({
      name: 'Alice',
      x_id: 'Alice_ID',
      casts: ['Cast A', 'Cast B'],
      preference_mode: 'flat',
      raw_extra: [
        { key: '第2希望', value: 'Cast C' },
        { key: '備考', value: '参加希望' },
        { key: '列6', value: '自由記述' },
      ],
    });
  });

  it('見出しより長いデータ行も全列表示し、プレビューは先頭5行に制限する', () => {
    const sourceRows: ImportSourceRow[] = Array.from({ length: 7 }, (_, index) => ({
      rowNumber: index + 10,
      cells: [`User ${index}`, `user_${index}`, 'Cast A', '', '', 'row only column'],
    }));
    const model = buildImportPreviewModel(['名前', 'X ID', '第1希望'], sourceRows, rankedMapping);

    expect(model.rawColumnIndexes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(model.previewRows).toHaveLength(IMPORT_PREVIEW_MAX_ROWS);
    expect(model.previewRows.map(({ sourceRow }) => sourceRow.rowNumber)).toEqual([10, 11, 12, 13, 14]);
    expect(model.previewCastColumnIndexes).toEqual([0, 1, 2]);
  });

  it('空と大小文字違いの重複X IDを問題行として集計し取込を拒否する', () => {
    const model = buildImportPreviewModel(
      ['名前', 'X ID'],
      [
        { rowNumber: 4, cells: ['Empty', ''] },
        { rowNumber: 8, cells: ['Alice', '@Sample_User'] },
        { rowNumber: 12, cells: ['Bob', 'https://x.com/sample_user'] },
      ],
      { ...rankedMapping, cast1: -1, cast2: -1, cast3: -1 },
    );

    expect(model.identityIssues).toEqual([
      { rowNumber: 4, xId: '', kind: 'empty' },
      { rowNumber: 8, xId: 'Sample_User', kind: 'duplicate' },
      { rowNumber: 12, xId: 'sample_user', kind: 'duplicate' },
    ]);
    expect([...model.issueRowNumbers]).toEqual([4, 8, 12]);
    expect(model.mappedRowByNumber.get(8)?.user.name).toBe('Alice');
    expect(model.emptyIdCount).toBe(1);
    expect(model.duplicateIdCount).toBe(2);
    expect(model.validCount).toBe(0);
    expect(model.canImport).toBe(false);
  });

  it('X ID列が未選択なら問題行は作らず取込可能件数を0件とする', () => {
    const model = buildImportPreviewModel(
      ['名前'],
      [{ rowNumber: 1, cells: ['Alice'] }],
      { ...rankedMapping, x_id: -1, cast1: -1, cast2: -1, cast3: -1 },
    );

    expect(model.identityIssues).toEqual([]);
    expect(model.validCount).toBe(0);
    expect(model.canImport).toBe(false);
  });

  it('1件以上ありX IDに問題がなければ取込を許可する', () => {
    const validModel = buildImportPreviewModel(
      ['名前', 'X ID'],
      [{ rowNumber: 1, cells: ['Alice', '@alice'] }],
      { ...rankedMapping, cast1: -1, cast2: -1, cast3: -1 },
    );
    const emptyModel = buildImportPreviewModel(['名前', 'X ID'], [], rankedMapping);

    expect(validModel.validCount).toBe(1);
    expect(validModel.canImport).toBe(true);
    expect(emptyModel.canImport).toBe(false);
  });
});
