/**
 * イベントと取込セッションのライフサイクル境界。
 * UI は Tauri command 名を直接扱わず、この repository を経由する。
 */
import { invoke } from '@tauri-apps/api/core';
import { getSharedDb } from '../database';
import {
  enqueueEventWrite,
  getRequiredEventName,
  runWithEventLifecycleLock,
} from './commandContext';

export interface EventMeta {
  notes: string | null;
  photo_data_url: string | null;
}

/** イベント名の一覧を backend から取得する。 */
export async function listEvents(): Promise<string[]> {
  return invoke<string[]>('list_events');
}

/** 新しいイベントを backend command で作成する。 */
export async function createEvent(name: string): Promise<void> {
  await runWithEventLifecycleLock(
    [name],
    () => invoke('create_event', { eventName: name }),
  );
}

/** イベントと配下データを backend command で削除する。 */
export async function deleteEvent(name: string): Promise<void> {
  await invoke('delete_event', { eventName: name });
}

/** イベント名を backend command で変更する。 */
export async function renameEvent(oldName: string, newName: string): Promise<void> {
  await invoke('rename_event', { oldName, newName });
}

/** 指定イベントの取込セッション一覧を backend から取得する。 */
export async function listSessions(eventName: string): Promise<string[]> {
  return invoke<string[]>('list_sessions', { eventName });
}

/** 指定イベントに新しい取込セッションを作成し、timestamp を返す。 */
export async function createSession(eventName: string): Promise<string> {
  return invoke<string>('create_session', { eventName });
}

interface MetaRow {
  key: string;
  value: string | null;
}

/** イベント写真と説明メモを共有DBから取得する。 */
export async function getEventMeta(): Promise<EventMeta> {
  const rows = await getSharedDb().select<MetaRow[]>(
    "SELECT key, value FROM meta WHERE key IN ('notes', 'photo_data_url')",
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    notes: values.get('notes') ?? null,
    photo_data_url: values.get('photo_data_url') ?? null,
  };
}

/** 指定されたイベント写真または説明メモだけを共有DBへ保存する。 */
export async function setEventMeta(patch: Partial<EventMeta>): Promise<void> {
  const eventName = getRequiredEventName();
  await enqueueEventWrite(eventName, () => invoke('set_event_meta_atomic', {
    eventName,
    patch: {
      update_notes: 'notes' in patch,
      notes: patch.notes ?? null,
      update_photo_data_url: 'photo_data_url' in patch,
      photo_data_url: patch.photo_data_url ?? null,
    },
  }));
}
