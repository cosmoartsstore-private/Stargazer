import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteHeaderTemplate,
  findHeaderTemplateBySignature,
  insertHeaderTemplate,
  listHeaderTemplates,
  updateHeaderTemplate,
  type HeaderTemplate,
} from './headerTemplateRepository';

interface ExecuteCall {
  query: string;
  values?: unknown[];
}

interface SelectCall {
  query: string;
  values?: unknown[];
}

interface FakeDb {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  executeCalls: ExecuteCall[];
  selectCalls: SelectCall[];
}

const mockState = vi.hoisted(() => ({
  sharedDb: null as FakeDb | null,
}));

vi.mock('../database', () => ({
  getSharedDb: () => {
    if (!mockState.sharedDb) throw new Error('shared db is not set');
    return mockState.sharedDb;
  },
}));

function templateRow(overrides: Partial<HeaderTemplate> = {}): HeaderTemplate {
  return {
    id: 1,
    signature: 'name|account|memo',
    label: '標準テンプレート',
    column_mapping: '{"name":"name"}',
    matching_settings: '{"mode":"M002"}',
    created_at: '2026-06-19T12:00:00.000Z',
    ...overrides,
  };
}

function createDb(rows: HeaderTemplate[] = [templateRow()]): FakeDb {
  const executeCalls: ExecuteCall[] = [];
  const selectCalls: SelectCall[] = [];
  return {
    executeCalls,
    selectCalls,
    execute: vi.fn(async (query: string, values?: unknown[]) => {
      executeCalls.push({ query, values });
      return { lastInsertId: 42 };
    }),
    select: vi.fn(async <T>(query: string, values?: unknown[]): Promise<T> => {
      selectCalls.push({ query, values });
      return rows as T;
    }),
  };
}

beforeEach(() => {
  mockState.sharedDb = createDb();
});

describe('header template read operations', () => {
  it('共有 DB のヘッダーテンプレートを新しい順で取得する', async () => {
    await expect(listHeaderTemplates()).resolves.toEqual([templateRow()]);

    expect(mockState.sharedDb?.selectCalls).toEqual([
      {
        query:
          'SELECT id, signature, label, column_mapping, matching_settings, created_at FROM header_templates ORDER BY created_at DESC, id DESC',
        values: undefined,
      },
    ]);
  });

  it('signature に一致するヘッダーテンプレートを取得する', async () => {
    await expect(findHeaderTemplateBySignature('name|account|memo')).resolves.toEqual(templateRow());

    expect(mockState.sharedDb?.selectCalls).toEqual([
      {
        query:
          'SELECT id, signature, label, column_mapping, matching_settings, created_at FROM header_templates WHERE signature = ? LIMIT 1',
        values: ['name|account|memo'],
      },
    ]);
  });

  it('signature に一致する行がない場合は null を返す', async () => {
    mockState.sharedDb = createDb([]);

    await expect(findHeaderTemplateBySignature('unknown')).resolves.toBeNull();
  });
});

describe('header template write operations', () => {
  it('未指定の任意項目を null に補完して保存し、採番 ID を返す', async () => {
    const id = await insertHeaderTemplate({ signature: 'name|account|memo' });

    expect(id).toBe(42);
    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query:
          'INSERT INTO header_templates (signature, label, column_mapping, matching_settings) VALUES (?, ?, ?, ?)',
        values: ['name|account|memo', null, null, null],
      },
    ]);
  });

  it('指定された任意項目を保存 payload に含める', async () => {
    await insertHeaderTemplate({
      signature: 'name|account|memo',
      label: '標準テンプレート',
      column_mapping: '{"name":"name"}',
      matching_settings: '{"mode":"M002"}',
    });

    expect(mockState.sharedDb?.executeCalls[0]).toEqual({
      query:
        'INSERT INTO header_templates (signature, label, column_mapping, matching_settings) VALUES (?, ?, ?, ?)',
      values: [
        'name|account|memo',
        '標準テンプレート',
        '{"name":"name"}',
        '{"mode":"M002"}',
      ],
    });
  });

  it('指定された項目だけを更新対象にする', async () => {
    await updateHeaderTemplate(7, {
      label: null,
      column_mapping: '{"name":"updated"}',
    });

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query: 'UPDATE header_templates SET label = ?, column_mapping = ? WHERE id = ?',
        values: [null, '{"name":"updated"}', 7],
      },
    ]);
  });

  it('signature と matching_settings を更新対象にする', async () => {
    await updateHeaderTemplate(8, {
      signature: 'updated|signature',
      matching_settings: null,
    });

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query: 'UPDATE header_templates SET signature = ?, matching_settings = ? WHERE id = ?',
        values: ['updated|signature', null, 8],
      },
    ]);
  });

  it('undefined の signature は既存互換として null に正規化する', async () => {
    await updateHeaderTemplate(8, {
      signature: undefined,
    });

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query: 'UPDATE header_templates SET signature = ? WHERE id = ?',
        values: [null, 8],
      },
    ]);
  });

  it('列割り当てを null でクリアし、マッチング設定を更新する', async () => {
    await updateHeaderTemplate(9, {
      column_mapping: null,
      matching_settings: '{"mode":"M003"}',
    });

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query: 'UPDATE header_templates SET column_mapping = ?, matching_settings = ? WHERE id = ?',
        values: [null, '{"mode":"M003"}', 9],
      },
    ]);
  });

  it('空の patch では DB を更新しない', async () => {
    await updateHeaderTemplate(7, {});

    expect(mockState.sharedDb?.execute).not.toHaveBeenCalled();
  });

  it('指定 ID のヘッダーテンプレートを削除する', async () => {
    await deleteHeaderTemplate(7);

    expect(mockState.sharedDb?.executeCalls).toEqual([
      {
        query: 'DELETE FROM header_templates WHERE id = ?',
        values: [7],
      },
    ]);
  });
});
