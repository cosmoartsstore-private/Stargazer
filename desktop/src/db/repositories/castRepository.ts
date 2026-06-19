// キャスト情報（名簿、NG、連絡先、イベント内出席状態）はイベント共有 DB に保存する。
// 同一イベント内の複数取込セッションをまたいで保持するため、この repository は共有 DB のみを対象にする。
import { invoke } from '@tauri-apps/api/core';
import { getSharedDb } from '../database';
import type { CastBean, NGUserEntry } from '@/common/types/entities';
import { getRequiredEventName } from './commandContext';

interface CastRow {
  id: number;
  name: string;
  group_name: string | null;
  is_attend: number;
  photo_data_url: string | null;
  memo: string | null;
}
interface UrlRow { url: string; }
interface NgRow  { username: string | null; userid: string | null; }

/** backend command へ渡すため、未指定の任意項目を null または空配列へ正規化する。 */
function toCastPayload(cast: CastBean): {
  name: string;
  is_present: boolean;
  contact_urls: string[];
  ng_entries: NGUserEntry[];
  group_name: string | null;
  photo_data_url: string | null;
  memo: string | null;
} {
  return {
    name: cast.name,
    is_present: cast.is_present,
    contact_urls: cast.contact_urls ?? [],
    ng_entries: cast.ng_entries ?? [],
    group_name: cast.group_name ?? null,
    photo_data_url: cast.photo_data_url ?? null,
    memo: cast.memo ?? null,
  };
}

/** キャスト本体に紐づく連絡先 URL と NG エントリを読み込む。 */
async function fetchCastFull(castId: number): Promise<{ urls: string[]; ng_entries: NGUserEntry[] }> {
  const db = getSharedDb();
  const urls = await db.select<UrlRow[]>('SELECT url FROM cast_urls WHERE cast_id = ?', [castId]);
  const ngs  = await db.select<NgRow[]>('SELECT username, userid FROM cast_ng_entries WHERE cast_id = ?', [castId]);
  return {
    urls: urls.map((u) => u.url),
    ng_entries: ngs
      .map((n): NGUserEntry => ({ username: n.username ?? undefined, accountId: n.userid ?? undefined }))
      .filter((e) => e.username || e.accountId),
  };
}

/** 現在イベントのキャスト一覧を、連絡先・NG・出席状態つきで読み込む。 */
export async function getAllCasts(): Promise<CastBean[]> {
  const db = getSharedDb();
  const rows = await db.select<CastRow[]>('SELECT * FROM casts ORDER BY id');
  const result: CastBean[] = [];
  for (const row of rows) {
    const { urls, ng_entries } = await fetchCastFull(row.id);
    const presRows = await db.select<[{ is_present: number }]>(
      'SELECT is_present FROM event_cast_present WHERE cast_id = ?',
      [row.id],
    );
    const is_present = presRows.length > 0 ? presRows[0].is_present === 1 : true;
    result.push({
      name: row.name,
      is_present,
      group_name: row.group_name ?? undefined,
      photo_data_url: row.photo_data_url ?? undefined,
      memo: row.memo ?? undefined,
      contact_urls: urls.length ? urls : undefined,
      ng_entries: ng_entries.length ? ng_entries : undefined,
    });
  }
  return result;
}

/** キャストのイベント内出席状態を更新する。存在しない名前は無視する。 */
export async function updateCastAttend(name: string, isPresent: boolean): Promise<void> {
  await invoke('update_cast_attend_atomic', {
    eventName: getRequiredEventName(),
    name,
    isPresent,
  });
}

/** 現在イベントに登録されているキャスト数を返す。 */
export async function getCastCount(): Promise<number> {
  const db = getSharedDb();
  const rows = await db.select<[{ n: number }]>('SELECT COUNT(*) AS n FROM casts');
  return rows[0]?.n ?? 0;
}

/** キャスト一覧を全置換する。途中失敗時は既存一覧を残す。 */
export async function persistAllCasts(casts: CastBean[]): Promise<void> {
  await invoke('persist_all_casts_atomic', {
    eventName: getRequiredEventName(),
    casts: casts.map(toCastPayload),
  });
}

/** キャストを1件追加し、連絡先 URL と NG エントリも同じ transaction で保存する。 */
export async function insertCast(cast: CastBean): Promise<void> {
  await invoke('insert_cast_atomic', {
    eventName: getRequiredEventName(),
    cast: toCastPayload(cast),
  });
}

/** キャストの編集可能項目を部分更新し、URL/NG は指定時のみ全置換する。 */
export async function updateCastFields(name: string, patch: Partial<Omit<CastBean, 'name'>>): Promise<void> {
  await invoke('update_cast_fields_atomic', {
    eventName: getRequiredEventName(),
    name,
    patch: {
      update_is_present: 'is_present' in patch,
      is_present: patch.is_present === true,
      update_group_name: 'group_name' in patch,
      group_name: patch.group_name ?? null,
      update_photo_data_url: 'photo_data_url' in patch,
      photo_data_url: patch.photo_data_url ?? null,
      update_memo: 'memo' in patch,
      memo: patch.memo ?? null,
      update_contact_urls: 'contact_urls' in patch,
      contact_urls: patch.contact_urls ?? [],
      update_ng_entries: 'ng_entries' in patch,
      ng_entries: patch.ng_entries ?? [],
    },
  });
}

/** キャスト名を変更する。関連テーブルは cast_id 参照のため更新不要。 */
export async function renameCast(oldName: string, newName: string): Promise<void> {
  await invoke('rename_cast_atomic', {
    eventName: getRequiredEventName(),
    oldName,
    newName,
  });
}

/** キャストと関連 URL/NG エントリを削除する。 */
export async function deleteCast(name: string): Promise<void> {
  await invoke('delete_cast_atomic', {
    eventName: getRequiredEventName(),
    name,
  });
}
