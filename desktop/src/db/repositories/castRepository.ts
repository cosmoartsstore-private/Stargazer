import { getDb } from '../database';
import type { CastBean, NGUserEntry } from '@/common/types/entities';

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

async function fetchCastFull(castId: number): Promise<{ urls: string[]; ng_entries: NGUserEntry[] }> {
  const db = await getDb();
  const urls = await db.select<UrlRow[]>('SELECT url FROM cast_urls WHERE cast_id = ?', [castId]);
  const ngs  = await db.select<NgRow[]>('SELECT username, userid FROM cast_ng_entries WHERE cast_id = ?', [castId]);
  return {
    urls: urls.map((u) => u.url),
    ng_entries: ngs
      .map((n): NGUserEntry => ({ username: n.username ?? undefined, accountId: n.userid ?? undefined }))
      .filter((e) => e.username || e.accountId),
  };
}

export async function getAllCasts(): Promise<CastBean[]> {
  const db = await getDb();
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

export async function updateCastAttend(name: string, isPresent: boolean): Promise<void> {
  const db = await getDb();
  const rows = await db.select<[{ id: number }]>('SELECT id FROM casts WHERE name = ?', [name]);
  const castId = rows[0]?.id;
  if (castId === undefined) return;
  await db.execute(
    'INSERT OR REPLACE INTO event_cast_present (cast_id, is_present) VALUES (?, ?)',
    [castId, isPresent ? 1 : 0],
  );
}

export async function getCastCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<[{ n: number }]>('SELECT COUNT(*) AS n FROM casts');
  return rows[0]?.n ?? 0;
}

export async function persistAllCasts(casts: CastBean[]): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM casts');
  for (const cast of casts) {
    const r = await db.execute(
      'INSERT INTO casts (name, group_name, is_attend, photo_data_url, memo) VALUES (?, ?, ?, ?, ?)',
      [cast.name, cast.group_name ?? null, cast.is_present ? 1 : 0,
       cast.photo_data_url ?? null, cast.memo ?? null],
    );
    const castId = r.lastInsertId as number;
    for (const url of cast.contact_urls ?? []) {
      await db.execute('INSERT INTO cast_urls (cast_id, url) VALUES (?, ?)', [castId, url]);
    }
    for (const ng of cast.ng_entries ?? []) {
      await db.execute(
        'INSERT INTO cast_ng_entries (cast_id, username, userid) VALUES (?, ?, ?)',
        [castId, ng.username ?? null, ng.accountId ?? null],
      );
    }
  }
}

export async function insertCast(cast: CastBean): Promise<void> {
  const db = await getDb();
  const r = await db.execute(
    'INSERT INTO casts (name, group_name, is_attend, photo_data_url, memo) VALUES (?, ?, ?, ?, ?)',
    [cast.name, cast.group_name ?? null, cast.is_present ? 1 : 0,
     cast.photo_data_url ?? null, cast.memo ?? null],
  );
  const castId = r.lastInsertId as number;
  for (const url of cast.contact_urls ?? []) {
    await db.execute('INSERT INTO cast_urls (cast_id, url) VALUES (?, ?)', [castId, url]);
  }
  for (const ng of cast.ng_entries ?? []) {
    await db.execute(
      'INSERT INTO cast_ng_entries (cast_id, username, userid) VALUES (?, ?, ?)',
      [castId, ng.username ?? null, ng.accountId ?? null],
    );
  }
}

export async function updateCastFields(name: string, patch: Partial<Omit<CastBean, 'name'>>): Promise<void> {
  const db = await getDb();
  const colUpdates: string[] = [];
  const colValues: unknown[] = [];

  if ('is_present' in patch)      { colUpdates.push('is_attend = ?');      colValues.push(patch.is_present ? 1 : 0); }
  if ('group_name' in patch)      { colUpdates.push('group_name = ?');     colValues.push(patch.group_name ?? null); }
  if ('photo_data_url' in patch)  { colUpdates.push('photo_data_url = ?'); colValues.push(patch.photo_data_url ?? null); }
  if ('memo' in patch)            { colUpdates.push('memo = ?');           colValues.push(patch.memo ?? null); }

  if (colUpdates.length > 0) {
    await db.execute(`UPDATE casts SET ${colUpdates.join(', ')} WHERE name = ?`, [...colValues, name]);
  }

  const needsCastId = 'contact_urls' in patch || 'ng_entries' in patch;
  if (needsCastId) {
    const rows = await db.select<[{ id: number }]>('SELECT id FROM casts WHERE name = ?', [name]);
    const castId = rows[0]?.id;
    if (castId !== undefined) {
      if ('contact_urls' in patch) {
        await db.execute('DELETE FROM cast_urls WHERE cast_id = ?', [castId]);
        for (const url of patch.contact_urls ?? []) {
          await db.execute('INSERT INTO cast_urls (cast_id, url) VALUES (?, ?)', [castId, url]);
        }
      }
      if ('ng_entries' in patch) {
        await db.execute('DELETE FROM cast_ng_entries WHERE cast_id = ?', [castId]);
        for (const ng of patch.ng_entries ?? []) {
          await db.execute(
            'INSERT INTO cast_ng_entries (cast_id, username, userid) VALUES (?, ?, ?)',
            [castId, ng.username ?? null, ng.accountId ?? null],
          );
        }
      }
    }
  }
}

export async function renameCast(oldName: string, newName: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE casts SET name = ? WHERE name = ?', [newName, oldName]);
}

export async function deleteCast(name: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<[{ id: number }]>('SELECT id FROM casts WHERE name = ?', [name]);
  const castId = rows[0]?.id;
  if (castId !== undefined) {
    await db.execute('DELETE FROM cast_urls WHERE cast_id = ?', [castId]);
    await db.execute('DELETE FROM cast_ng_entries WHERE cast_id = ?', [castId]);
  }
  await db.execute('DELETE FROM casts WHERE name = ?', [name]);
}
