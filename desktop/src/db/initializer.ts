/**
 * アプリ起動時のDB初期化と旧形式データの一回限りのマイグレーション。
 *
 * 実行順:
 *  1. DB接続（plugin-sqlがマイグレーションSQLを自動適用）
 *  2. caution_users テーブルが空 → localStorage から取り込み
 *  3. currentEventId を確定（なければ default イベントを作成）
 */

import { getDb } from './database';
import {
  getAllCautionUsers,
  persistAllCautionUsers,
} from './repositories/cautionUserRepository';
import {
  ensureCurrentEvent,
  getCurrentEventId,
} from './repositories/eventRepository';
import { STORAGE_KEYS } from '@/common/config';
import type { CautionUser } from '@/features/matching/types/matching-system-types';

async function migrateCautionUsersFromLocalStorage(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MATCHING_SETTINGS);
    if (!raw) return;
    const d = JSON.parse(raw) as Record<string, unknown>;
    const caution = d.caution as { cautionUsers?: CautionUser[] } | undefined;
    const users = Array.isArray(caution?.cautionUsers) ? caution!.cautionUsers : [];
    if (users.length === 0) return;
    await persistAllCautionUsers(users);
    console.info(`[DB init] localStorage から ${users.length} 件の要注意ユーザーを移行しました`);
  } catch (e) {
    console.warn('[DB init] 要注意ユーザーのマイグレーションをスキップ:', e);
  }
}

async function resolveCurrentEvent(): Promise<number> {
  const existingId = await getCurrentEventId();
  if (existingId !== null) return existingId;
  return ensureCurrentEvent('default');
}

export interface DbInitResult {
  currentEventId: number;
}

/** アプリ起動時に一度だけ呼び出す */
export async function initializeDatabase(): Promise<DbInitResult> {
  await getDb();

  const cautionUsers = await getAllCautionUsers();
  if (cautionUsers.length === 0) {
    await migrateCautionUsersFromLocalStorage();
  }

  const currentEventId = await resolveCurrentEvent();

  return { currentEventId };
}
