/**
 * イベント単位の要注意人物リストを保存する repository。
 * リストは同一イベント内の取込セッションで共有するため、共有 DB を対象にする。
 */
import { getSharedDb } from '../database';
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

interface CautionDb {
  execute: (query: string, values?: unknown[]) => Promise<unknown>;
  select: <T>(query: string, values?: unknown[]) => Promise<T>;
}

const SELECT_CAUTION_USERS_SQL = 'SELECT * FROM caution_users ORDER BY registered_at DESC';
// ON CONFLICT では registered_at を更新せず、初回登録日時を保持する。
const UPSERT_CAUTION_USER_SQL = `INSERT INTO caution_users (username, account_id, registration_type, reason, notes, ng_cast_count, registered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       username = excluded.username,
       registration_type = excluded.registration_type,
       reason = excluded.reason,
       notes = excluded.notes,
       ng_cast_count = excluded.ng_cast_count`;
const DELETE_CAUTION_USER_SQL = 'DELETE FROM caution_users WHERE account_id = ?';
const DELETE_ALL_CAUTION_USERS_SQL = 'DELETE FROM caution_users';

/** DB 行をマッチング設定で扱う要注意人物レコードへ変換する。 */
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

/** 指定 DB に要注意人物を保存し、同じ account_id があれば表示情報を更新する。 */
async function upsertCautionUserWithDb(db: CautionDb, user: CautionUser): Promise<void> {
  await db.execute(
    UPSERT_CAUTION_USER_SQL,
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

/** 共有 DB に保存された要注意人物を新しい登録順で取得する。 */
export async function getAllCautionUsers(): Promise<CautionUser[]> {
  const db = getSharedDb();
  const rows = await db.select<CautionRow[]>(SELECT_CAUTION_USERS_SQL);
  return rows.map(rowToBean);
}

/** 要注意人物を account_id をキーに保存し、既存行があれば更新する。 */
export async function upsertCautionUser(user: CautionUser): Promise<void> {
  const db = getSharedDb();
  await upsertCautionUserWithDb(db, user);
}

/** account_id が一致する要注意人物を削除する。 */
export async function deleteCautionUserByAccountId(accountId: string): Promise<void> {
  const db = getSharedDb();
  await db.execute(DELETE_CAUTION_USER_SQL, [accountId]);
}

/** 要注意人物リストを全置換する。空配列の場合は既存行の削除だけ行う。 */
export async function persistAllCautionUsers(users: CautionUser[]): Promise<void> {
  const db = getSharedDb();
  await db.execute(DELETE_ALL_CAUTION_USERS_SQL);
  for (const u of users) {
    await upsertCautionUserWithDb(db, u);
  }
}
