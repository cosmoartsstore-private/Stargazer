// キャスト情報（名簿、NG、連絡先、イベント内出席状態）はイベント共有 DB に保存する。
// 同一イベント内の複数取込セッションをまたいで保持するため、この repository は共有 DB のみを対象にする。
import { invoke } from '@tauri-apps/api/core';
import { getSharedDb } from '../database';
import type { CastBean, NGUserEntry } from '@/common/types/entities';
import { enqueueEventWrite, getRequiredEventName } from './commandContext';
import { groupRowsBy } from './groupRowsBy';

interface CastRow {
  id: number;
  name: string;
  group_name: string | null;
  is_attend: number;
  photo_data_url: string | null;
  memo: string | null;
}
interface UrlRow {
  cast_id: number;
  url: string;
}
interface AliasRow {
  cast_id: number;
  alias: string;
}
interface NgRow {
  cast_id: number;
  username: string | null;
  userid: string | null;
  notes: string | null;
}

/** backend command へ渡すため、未指定の任意項目を null または空配列へ正規化する。 */
function toCastPayload(cast: Omit<CastBean, 'id'>): {
  name: string;
  aliases: string[];
  is_present: boolean;
  contact_urls: string[];
  ng_entries: NGUserEntry[];
  group_name: string | null;
  photo_data_url: string | null;
  memo: string | null;
} {
  return {
    name: cast.name,
    aliases: cast.aliases ?? [],
    is_present: cast.is_present,
    contact_urls: cast.contact_urls ?? [],
    ng_entries: cast.ng_entries ?? [],
    group_name: cast.group_name ?? null,
    photo_data_url: cast.photo_data_url ?? null,
    memo: cast.memo ?? null,
  };
}

/** 現在イベントのキャスト一覧を、連絡先・NG・出席状態つきで読み込む。 */
export async function getAllCasts(): Promise<CastBean[]> {
  const db = getSharedDb();
  const [rows, aliasRows, urlRows, ngRows] = await Promise.all([
    db.select<CastRow[]>(
      'SELECT id, name, group_name, is_attend, photo_data_url, memo FROM casts ORDER BY id',
    ),
    db.select<AliasRow[]>('SELECT cast_id, alias FROM cast_aliases ORDER BY cast_id, id'),
    db.select<UrlRow[]>('SELECT cast_id, url FROM cast_urls ORDER BY cast_id, id'),
    db.select<NgRow[]>(
      'SELECT cast_id, username, userid, notes FROM cast_ng_entries ORDER BY cast_id, id',
    ),
  ]);

  const aliasRowsByCastId = groupRowsBy(aliasRows, (row) => row.cast_id);
  const urlRowsByCastId = groupRowsBy(urlRows, (row) => row.cast_id);
  const ngRowsByCastId = groupRowsBy(ngRows, (row) => row.cast_id);

  return rows.map((row) => {
    const aliases = aliasRowsByCastId.get(row.id)?.map((aliasRow) => aliasRow.alias);
    const urls = urlRowsByCastId.get(row.id)?.map((urlRow) => urlRow.url);
    const ngEntries = ngRowsByCastId.get(row.id)?.flatMap((ngRow) => {
      const entry: NGUserEntry = {
        username: ngRow.username ?? undefined,
        accountId: ngRow.userid ?? undefined,
        notes: ngRow.notes ?? undefined,
      };
      return entry.username || entry.accountId ? [entry] : [];
    });
    return {
      id: row.id,
      name: row.name,
      aliases: aliases?.length ? aliases : undefined,
      is_present: row.is_attend === 1,
      group_name: row.group_name ?? undefined,
      photo_data_url: row.photo_data_url ?? undefined,
      memo: row.memo ?? undefined,
      contact_urls: urls?.length ? urls : undefined,
      ng_entries: ngEntries?.length ? ngEntries : undefined,
    };
  });
}

/** キャストを1件追加し、連絡先 URL と NG エントリも同じ transaction で保存する。 */
export async function insertCast(cast: Omit<CastBean, 'id'>): Promise<number> {
  const eventName = getRequiredEventName();
  return enqueueEventWrite(eventName, () => invoke<number>('insert_cast_atomic', {
    eventName,
    cast: toCastPayload(cast),
  }));
}

/** キャストの編集可能項目を部分更新し、URL/NG は指定時のみ全置換する。 */
export async function updateCastFields(
  castId: number,
  patch: Partial<Omit<CastBean, 'id' | 'name'>>,
): Promise<void> {
  const eventName = getRequiredEventName();
  await enqueueEventWrite(eventName, () => invoke('update_cast_fields_atomic', {
    eventName,
    castId,
    patch: {
      update_is_present: 'is_present' in patch,
      is_present: patch.is_present === true,
      update_aliases: 'aliases' in patch,
      aliases: patch.aliases ?? [],
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
  }));
}

/** 現在イベントの全キャストを、単一SQLで出席または待機へ変更する。 */
export async function setAllCastPresence(isPresent: boolean): Promise<void> {
  const eventName = getRequiredEventName();
  await enqueueEventWrite(eventName, () => invoke('set_all_cast_presence_atomic', {
    eventName,
    isPresent,
  }));
}

/** キャスト名を変更する。関連テーブルは cast_id 参照のため更新不要。 */
export async function renameCast(castId: number, newName: string): Promise<void> {
  const eventName = getRequiredEventName();
  await enqueueEventWrite(eventName, () => invoke('rename_cast_atomic', {
    eventName,
    castId,
    newName,
  }));
}

/** キャストと関連 URL/NG エントリを削除する。 */
export async function deleteCast(castId: number): Promise<void> {
  const eventName = getRequiredEventName();
  await enqueueEventWrite(eventName, () => invoke('delete_cast_atomic', {
    eventName,
    castId,
  }));
}
