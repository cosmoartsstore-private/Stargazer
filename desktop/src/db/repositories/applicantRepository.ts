import { getDb } from '../database';
import type { UserBean } from '@/common/types/entities';

interface ApplicantRow {
  id: number;
  x_id: string;
  name: string | null;
  vrc_url: string | null;
  is_guaranteed: number;
}

interface CastPrefRow {
  preference_order: number;
  cast_name: string;
}

interface ExtraRow {
  field_key: string;
  field_value: string | null;
}

export async function loadApplicants(): Promise<UserBean[]> {
  const db = await getDb();
  const rows = await db.select<ApplicantRow[]>(
    'SELECT * FROM applicants ORDER BY id',
  );
  const users: UserBean[] = [];
  for (const row of rows) {
    const castPrefs = await db.select<CastPrefRow[]>(
      'SELECT preference_order, cast_name FROM applicant_casts WHERE applicant_id = ? ORDER BY preference_order',
      [row.id],
    );
    const extras = await db.select<ExtraRow[]>(
      'SELECT field_key, field_value FROM applicant_extra WHERE applicant_id = ?',
      [row.id],
    );
    const casts: string[] = [];
    for (const p of castPrefs) {
      casts[p.preference_order] = p.cast_name;
    }
    users.push({
      name: row.name ?? '',
      x_id: row.x_id,
      vrc_url: row.vrc_url ?? undefined,
      is_guaranteed: row.is_guaranteed === 1,
      casts: casts.filter(Boolean),
      raw_extra: extras.map((e) => ({ key: e.field_key, value: e.field_value ?? '' })),
    });
  }
  return users;
}

export async function persistApplicants(users: UserBean[]): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM applicants');
  for (const user of users) {
    const r = await db.execute(
      'INSERT INTO applicants (x_id, name, vrc_url, is_guaranteed) VALUES (?, ?, ?, ?)',
      [user.x_id, user.name || null, user.vrc_url ?? null, user.is_guaranteed ? 1 : 0],
    );
    const applicantId = r.lastInsertId as number;
    for (let i = 0; i < user.casts.length; i++) {
      if (user.casts[i]) {
        await db.execute(
          'INSERT INTO applicant_casts (applicant_id, preference_order, cast_name) VALUES (?, ?, ?)',
          [applicantId, i, user.casts[i]],
        );
      }
    }
    const raw = user.raw_extra as { key: string; value: string }[];
    for (const e of raw ?? []) {
      await db.execute(
        'INSERT INTO applicant_extra (applicant_id, field_key, field_value) VALUES (?, ?, ?)',
        [applicantId, e.key, e.value ?? null],
      );
    }
  }
}
