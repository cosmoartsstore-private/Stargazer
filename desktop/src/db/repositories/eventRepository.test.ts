import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEvent,
  createSession,
  deleteEvent,
  deleteSession,
  getEventMeta,
  getSessionMeta,
  listEvents,
  listSessions,
  renameEvent,
  setEventMeta,
  setSessionMeta,
  type EventMeta,
  type SessionMeta,
} from './eventRepository';

interface ExecuteCall {
  query: string;
  values?: unknown[];
}

interface FakeDb {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  calls: ExecuteCall[];
}

const invokeMock = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({
  sharedDb: null as FakeDb | null,
  sessionDb: null as FakeDb | null,
  eventName: 'Sample Event' as string | null,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('../database', () => ({
  getSharedDb: () => {
    if (!mockState.sharedDb) throw new Error('shared db is not set');
    return mockState.sharedDb;
  },
  getSessionDb: () => {
    if (!mockState.sessionDb) throw new Error('session db is not set');
    return mockState.sessionDb;
  },
  getCurrentEventName: () => mockState.eventName,
}));

function createDb(rows: Array<{ key: string; value: string | null }> = []): FakeDb {
  const calls: ExecuteCall[] = [];
  return {
    calls,
    execute: vi.fn(async (query: string, values?: unknown[]) => {
      calls.push({ query, values });
      return {};
    }),
    select: vi.fn(async <T>(): Promise<T> => rows as T),
  };
}

beforeEach(() => {
  mockState.sharedDb = createDb();
  mockState.sessionDb = createDb();
  mockState.eventName = 'Sample Event';
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command: string): Promise<unknown> => {
    if (command === 'list_events') return ['Event A', 'Event B'];
    if (command === 'list_sessions') return [{ timestamp: '2026-06-19T12:00:00.000Z' }];
    if (command === 'create_session') return '2026-06-19T12:00:00.000Z';
    return undefined;
  });
});

describe('event command façade', () => {
  it('イベント一覧を取得する', async () => {
    await expect(listEvents()).resolves.toEqual(['Event A', 'Event B']);
    expect(invokeMock).toHaveBeenCalledWith('list_events');
  });

  it('イベント作成 command を呼ぶ', async () => {
    await createEvent('Event A');
    expect(invokeMock).toHaveBeenCalledWith('create_event', { eventName: 'Event A' });
  });

  it('イベント削除 command を呼ぶ', async () => {
    await deleteEvent('Event A');
    expect(invokeMock).toHaveBeenCalledWith('delete_event', { eventName: 'Event A' });
  });

  it('イベント名変更 command を呼ぶ', async () => {
    await renameEvent('Event A', 'Event B');
    expect(invokeMock).toHaveBeenCalledWith('rename_event', { oldName: 'Event A', newName: 'Event B' });
  });

  it('取込セッション一覧を取得する', async () => {
    await expect(listSessions('Event A')).resolves.toEqual([{ timestamp: '2026-06-19T12:00:00.000Z' }]);
    expect(invokeMock).toHaveBeenCalledWith('list_sessions', { eventName: 'Event A' });
  });

  it('取込セッション作成 command の timestamp を返す', async () => {
    await expect(createSession('Event A')).resolves.toBe('2026-06-19T12:00:00.000Z');
    expect(invokeMock).toHaveBeenCalledWith('create_session', { eventName: 'Event A' });
  });

  it('取込セッション削除 command を呼ぶ', async () => {
    await deleteSession('Event A', '2026-06-19T12:00:00.000Z');
    expect(invokeMock).toHaveBeenCalledWith('delete_session', {
      eventName: 'Event A',
      timestamp: '2026-06-19T12:00:00.000Z',
    });
  });
});

describe('event meta', () => {
  it('shared DB の meta 行を EventMeta に復元する', async () => {
    mockState.sharedDb = createDb([
      { key: 'event_date', value: '2026-06-19' },
      { key: 'notes', value: '説明' },
      { key: 'photo_data_url', value: 'data:image/png;base64,sample' },
      { key: 'created_at', value: '2026-06-19T12:00:00.000Z' },
    ]);

    const expected: EventMeta = {
      event_name: 'Sample Event',
      event_date: '2026-06-19',
      notes: '説明',
      photo_data_url: 'data:image/png;base64,sample',
      created_at: '2026-06-19T12:00:00.000Z',
    };
    await expect(getEventMeta()).resolves.toEqual(expected);
  });

  it('未保存のイベント meta は null と現在イベント名で補完する', async () => {
    mockState.eventName = null;

    const expected: EventMeta = {
      event_name: '',
      event_date: null,
      notes: null,
      photo_data_url: null,
      created_at: null,
    };
    await expect(getEventMeta()).resolves.toEqual(expected);
  });

  it('指定されたイベント meta だけを upsert する', async () => {
    await setEventMeta({
      event_date: '2026-06-19',
      notes: null,
      photo_data_url: null,
    });

    expect(mockState.sharedDb?.calls).toEqual([
      {
        query: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['event_date', '2026-06-19'],
      },
      {
        query: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['notes', null],
      },
      {
        query: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['photo_data_url', null],
      },
    ]);
  });

  it('イベント meta の日付クリアと写真保存を upsert する', async () => {
    await setEventMeta({
      event_date: null,
      photo_data_url: 'data:image/png;base64,sample',
    });

    expect(mockState.sharedDb?.calls).toEqual([
      {
        query: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['event_date', null],
      },
      {
        query: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['photo_data_url', 'data:image/png;base64,sample'],
      },
    ]);
  });

  it('空のイベント meta patch では DB を更新しない', async () => {
    await setEventMeta({});
    expect(mockState.sharedDb?.execute).not.toHaveBeenCalled();
  });
});

describe('session meta', () => {
  it('session DB の meta 行を SessionMeta に復元する', async () => {
    mockState.sessionDb = createDb([
      { key: 'imported_at', value: '2026-06-19T12:00:00.000Z' },
      { key: 'header_template_id', value: '12' },
    ]);

    const expected: SessionMeta = {
      imported_at: '2026-06-19T12:00:00.000Z',
      header_template_id: 12,
    };
    await expect(getSessionMeta()).resolves.toEqual(expected);
  });

  it('空文字や数値化できない header_template_id は null に戻す', async () => {
    mockState.sessionDb = createDb([
      { key: 'imported_at', value: null },
      { key: 'header_template_id', value: 'not-number' },
    ]);

    const invalidTemplateMeta: SessionMeta = {
      imported_at: null,
      header_template_id: null,
    };
    await expect(getSessionMeta()).resolves.toEqual(invalidTemplateMeta);

    mockState.sessionDb = createDb([{ key: 'header_template_id', value: '' }]);
    const emptyTemplateMeta: SessionMeta = {
      imported_at: null,
      header_template_id: null,
    };
    await expect(getSessionMeta()).resolves.toEqual(emptyTemplateMeta);
  });

  it('指定されたセッション meta だけを upsert し、template id は文字列化する', async () => {
    await setSessionMeta({
      imported_at: '2026-06-19T12:00:00.000Z',
      header_template_id: 12,
    });

    expect(mockState.sessionDb?.calls).toEqual([
      {
        query: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['imported_at', '2026-06-19T12:00:00.000Z'],
      },
      {
        query: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['header_template_id', '12'],
      },
    ]);
  });

  it('null の header_template_id は null として保存する', async () => {
    await setSessionMeta({ header_template_id: null });

    expect(mockState.sessionDb?.calls).toEqual([
      {
        query: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['header_template_id', null],
      },
    ]);
  });

  it('null の imported_at は null として保存する', async () => {
    await setSessionMeta({ imported_at: null });

    expect(mockState.sessionDb?.calls).toEqual([
      {
        query: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        values: ['imported_at', null],
      },
    ]);
  });

  it('空のセッション meta patch では DB を更新しない', async () => {
    await setSessionMeta({});
    expect(mockState.sessionDb?.execute).not.toHaveBeenCalled();
  });
});
