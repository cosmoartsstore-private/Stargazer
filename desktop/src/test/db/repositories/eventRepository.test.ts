import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEvent,
  createSession,
  deleteEvent,
  getEventMeta,
  listEvents,
  listSessions,
  renameEvent,
  setEventMeta,
} from '@/db/repositories/eventRepository';
import { runWithEventLifecycleLock } from '@/db/repositories/commandContext';

const invokeMock = vi.hoisted(() => vi.fn());
const repositoryState = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/db/database', () => ({
  getCurrentEventName: () => 'Event A',
  getSharedDb: () => ({
    select: repositoryState.select,
    execute: repositoryState.execute,
  }),
}));

beforeEach(() => {
  invokeMock.mockReset();
  repositoryState.select.mockReset();
  repositoryState.execute.mockReset();
  repositoryState.select.mockResolvedValue([]);
  repositoryState.execute.mockResolvedValue({});
  invokeMock.mockImplementation(async (command: string): Promise<unknown> => {
    if (command === 'list_events') return ['Event A', 'Event B'];
    if (command === 'list_sessions') return ['20260619120000'];
    if (command === 'create_session') return '20260619120000';
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
    await runWithEventLifecycleLock(['Event A'], () => deleteEvent('Event A'));
    expect(invokeMock).toHaveBeenCalledWith('delete_event', { eventName: 'Event A' });
  });

  it('イベント名変更 command を呼ぶ', async () => {
    await renameEvent('Event A', 'Event B');
    expect(invokeMock).toHaveBeenCalledWith('rename_event', { oldName: 'Event A', newName: 'Event B' });
  });

  it('取込セッション一覧を取得する', async () => {
    await expect(listSessions('Event A')).resolves.toEqual(['20260619120000']);
    expect(invokeMock).toHaveBeenCalledWith('list_sessions', { eventName: 'Event A' });
  });

  it('取込セッション作成 command の timestamp を返す', async () => {
    await expect(createSession('Event A')).resolves.toBe('20260619120000');
    expect(invokeMock).toHaveBeenCalledWith('create_session', { eventName: 'Event A' });
  });

});

describe('event meta', () => {
  it('イベント写真と説明メモを共有DBから取得する', async () => {
    repositoryState.select.mockResolvedValue([
      { key: 'notes', value: '受付は20時から' },
      { key: 'photo_data_url', value: 'data:image/png;base64,event' },
    ]);

    await expect(getEventMeta()).resolves.toEqual({
      notes: '受付は20時から',
      photo_data_url: 'data:image/png;base64,event',
    });
    expect(repositoryState.select).toHaveBeenCalledWith(
      "SELECT key, value FROM meta WHERE key IN ('notes', 'photo_data_url')",
    );
  });

  it('未保存のイベント写真と説明メモはnullとして返す', async () => {
    await expect(getEventMeta()).resolves.toEqual({
      notes: null,
      photo_data_url: null,
    });
  });

  it('指定された項目だけをatomic commandへ渡す', async () => {
    await setEventMeta({ notes: '案内メモ', photo_data_url: null });

    expect(invokeMock).toHaveBeenCalledWith('set_event_meta_atomic', {
      eventName: 'Event A',
      patch: {
        update_notes: true,
        notes: '案内メモ',
        update_photo_data_url: true,
        photo_data_url: null,
      },
    });
    expect(repositoryState.execute).not.toHaveBeenCalled();
  });
});
