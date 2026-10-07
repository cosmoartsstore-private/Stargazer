import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApplicantDisplayColumns, buildApplicantDisplayColumnSchema, getApplicantDisplayColumnValue, getStoredApplicantDisplayColumnIds, normalizeApplicantDisplayColumnIds, persistApplicantDisplayColumnIds } from '@/common/applicantDisplayColumns';
import { STORAGE_KEYS } from '@/common/config';

function installStorage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(STORAGE_KEYS.APPLICANT_DISPLAY_COLUMNS, initial);
  const storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
  vi.stubGlobal('window', { localStorage: storage });
  return storage;
}

const applicants = [{ vrc_url: 'https://vrchat.com/home/user/test', raw_extra: [{ key: '備考', value: 'A' }, { key: '備考', value: 'B' }, { key: '', value: 'C' }] }];
const columns = buildApplicantDisplayColumns(applicants);

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('応募データの任意表示列', () => {
  it('取込順と重複見出しを保持し、空見出しへ表示名を補う', () => {
    expect(columns.map((column) => column.id)).toEqual(['vrc_url', 'raw_extra:0', 'raw_extra:1', 'raw_extra:2']);
    expect(columns[1].label).not.toBe(columns[2].label);
    expect(columns[1].label).toContain('備考');
    expect(columns[2].label).toContain('備考');
    expect(columns[3].label).not.toBe('');
    expect(buildApplicantDisplayColumnSchema(applicants)).toEqual(['備考', '備考', '']);
  });

  it('空の応募一覧では列とschemaを返さない', () => {
    expect(buildApplicantDisplayColumns([])).toEqual([]);
    expect(buildApplicantDisplayColumnSchema([])).toEqual([]);
  });

  it('追加列がない応募にもVRChat URL列を返す', () => {
    expect(buildApplicantDisplayColumns([{ vrc_url: null, raw_extra: [] }])).toHaveLength(1);
  });

  it('行のURLと追加列を読み取り、欠けている値は空文字列を返す', () => {
    expect(getApplicantDisplayColumnValue(applicants[0], columns[0])).toBe(applicants[0].vrc_url);
    expect(getApplicantDisplayColumnValue(applicants[0], columns[2])).toBe('B');
    expect(getApplicantDisplayColumnValue({ vrc_url: null, raw_extra: [] }, columns[0])).toBe('');
    expect(getApplicantDisplayColumnValue({ vrc_url: null, raw_extra: [] }, columns[2])).toBe('');
  });

  it('存在しない列と重複を除き、選択順を維持する', () => {
    expect(normalizeApplicantDisplayColumnIds(['raw_extra:1', 'missing', 'vrc_url', 'raw_extra:1'], columns)).toEqual(['raw_extra:1', 'vrc_url']);
  });

  it('schemaごとの履歴を保ち、同じschemaだけを更新する', () => {
    installStorage();
    const schema = buildApplicantDisplayColumnSchema(applicants);
    expect(persistApplicantDisplayColumnIds(schema, ['vrc_url', 'missing'], columns)).toBe(true);
    expect(persistApplicantDisplayColumnIds(['別の見出し'], ['raw_extra:1'], columns)).toBe(true);
    expect(persistApplicantDisplayColumnIds(schema, ['raw_extra:0'], columns)).toBe(true);
    expect(getStoredApplicantDisplayColumnIds(schema, columns)).toEqual(['raw_extra:0']);
    expect(getStoredApplicantDisplayColumnIds(['別の見出し'], columns)).toEqual(['raw_extra:1']);
    expect(getStoredApplicantDisplayColumnIds(['備考', '', '備考'], columns)).toEqual([]);
    expect(getStoredApplicantDisplayColumnIds(['備考', '備考'], columns)).toEqual([]);
  });

  it('重複履歴では最後の選択を採用し、現在存在する列へ限定する', () => {
    installStorage(JSON.stringify({ version: 1, entries: [{ schema: ['備考'], selectedColumnIds: ['vrc_url'] }, { schema: ['備考'], selectedColumnIds: ['raw_extra:0', 'missing', 'raw_extra:0'] }] }));
    expect(getStoredApplicantDisplayColumnIds(['備考'], columns)).toEqual(['raw_extra:0']);
  });

  it.each([null, '', 'invalid', 'null', '[]', '{}', '{"version":2,"entries":[]}', '{"version":1,"entries":null}'])('不正な保存形式を選択として採用しない: %s', (raw) => {
    installStorage(raw);
    expect(getStoredApplicantDisplayColumnIds(['備考'], columns)).toEqual([]);
  });

  it('壊れた履歴項目を除外し、有効な履歴は読み取る', () => {
    const entries = [null, [], {}, { schema: [1], selectedColumnIds: [] }, { schema: ['備考'], selectedColumnIds: [1] }, { schema: ['備考'], selectedColumnIds: ['vrc_url'] }];
    installStorage(JSON.stringify({ version: 1, entries }));
    expect(getStoredApplicantDisplayColumnIds(['備考'], columns)).toEqual(['vrc_url']);
  });

  it('保存領域を利用できない場合は保存失敗を返す', () => {
    vi.stubGlobal('window', undefined);
    expect(persistApplicantDisplayColumnIds([], [], columns)).toBe(false);
    expect(getStoredApplicantDisplayColumnIds([], columns)).toEqual([]);
    const storage = installStorage();
    storage.setItem.mockImplementation(() => { throw new Error('保存拒否'); });
    expect(persistApplicantDisplayColumnIds([], [], columns)).toBe(false);
  });
});
