import { getDb } from '../database';
import type { CautionUser } from '@/features/matching/types/matching-system-types';

interface CautionRow {
  id: number;
  username: string;
  account_id: string;
  registration_type: string;
  reason: string | null;
  notes: string | null;
  ng_cast_count: number;
  registered_at: string;
}

function rowToBean(row: CautionRow): CautionUser {
  return {
    username: row.username,
    accountId: row.account_id,
    registrationType: row.registration_type as 'manual' | 'auto',
    ngCastCount: row.ng_cast_count,
    registeredAt: row.registered_at,
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export async function getAllCautionUsers(): Promise<CautionUser[]> {
  const db = await getDb();
  const rows = await db.select<CautionRow[]>(
    'SELECT * FROM caution_users ORDER BY registered_at DESC',
  );
  return rows.map(rowToBean);
}

export async function upsertCautionUser(user: CautionUser): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO caution_users (username, account_id, registration_type, reason, notes, ng_cast_count, registered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       username = excluded.username,
       registration_type = excluded.registration_type,
       reason = excluded.reason,
       notes = excluded.notes,
       ng_cast_count = excluded.ng_cast_count`,
    [
      user.username,
      user.accountId,
      user.registrationType,
      user.reason ?? null,
      user.notes ?? null,
      user.ngCastCount ?? 0,
      user.registeredAt ?? new Date().toISOString(),
    ],
  );
}

export async function deleteCautionUserByAccountId(accountId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM caution_users WHERE account_id = ?', [accountId]);
}

export async function persistAllCautionUsers(users: CautionUser[]): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM caution_users');
  for (const u of users) {
    await upsertCautionUser(u);
  }
}
