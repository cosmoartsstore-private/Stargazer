/**
 * イベント単位の要注意人物リストを保存する repository。
 * リストは同一イベント内の取込セッションで共有するため、共有 DB を対象にする。
 */
import { getSharedDb } from '../database';
import type { CautionUser } from '@/common/types/entities';
import { formatXAccountId } from '@/common/xIdUtils';
import { getMsg } from '@/messages/getMsg';
import { enqueueEventWrite, getRequiredEventName } from './commandContext';

interface CautionRow {
  username: string;
  account_id: string;
  registration_type: string;
  reason: string | null;
  notes: string | null;
  ng_cast_count: number;
  registered_at: string;
}

const SELECT_CAUTION_USERS_SQL =
  `SELECT username, account_id, registration_type, reason, notes,
          ng_cast_count, registered_at
   FROM caution_users
   ORDER BY registered_at DESC`;
const SELECT_ACCOUNT_ID_SQL = 'SELECT account_id FROM caution_users WHERE account_id = ?';
const INSERT_CAUTION_USER_SQL =
  `INSERT INTO caution_users
     (username, account_id, registration_type, reason, notes, ng_cast_count, registered_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`;
const DELETE_CAUTION_USER_SQL = 'DELETE FROM caution_users WHERE account_id = ?';

/** DB 行をマッチング設定で扱う要注意人物レコードへ変換する。 */
function rowToBean(row: CautionRow): CautionUser {
  return {
    username: row.username,
    accountId: row.account_id,
    registrationType: row.registration_type === 'auto' ? 'auto' : 'manual',
    ngCastCount: row.ng_cast_count,
    registeredAt: row.registered_at,
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
  };
}

/** 共有DBへ要注意人物を保存し、同じ表記のaccountIdがあれば未指定項目を保って更新する。 */
export async function upsertCautionUser(user: CautionUser): Promise<void> {
  const db = getSharedDb();
  const eventName = getRequiredEventName();
  await enqueueEventWrite(eventName, async () => {
    const accountId = formatXAccountId(user.accountId);
    if (!accountId) {
      throw new Error(getMsg('cautionUserRepository.invalidXId'));
    }

    const matches = await db.select<Array<{ account_id: string }>>(
      SELECT_ACCOUNT_ID_SQL,
      [accountId],
    );

    if (matches.length === 1) {
      // 未指定の互換項目は既存値を維持し、簡易登録で理由や登録種別を消さない。
      const sets = ['username = ?', 'account_id = ?'];
      const values: unknown[] = [user.username, accountId];
      if (user.registrationType !== undefined) {
        sets.push('registration_type = ?');
        values.push(user.registrationType);
      }
      if (user.reason !== undefined) {
        sets.push('reason = ?');
        values.push(user.reason);
      }
      if (user.notes !== undefined) {
        sets.push('notes = ?');
        values.push(user.notes);
      }
      if (user.ngCastCount !== undefined) {
        sets.push('ng_cast_count = ?');
        values.push(user.ngCastCount);
      }
      values.push(matches[0].account_id);
      await db.execute(
        `UPDATE caution_users SET ${sets.join(', ')} WHERE account_id = ?`,
        values,
      );
      return;
    }

    await db.execute(INSERT_CAUTION_USER_SQL, [
      user.username,
      accountId,
      user.registrationType ?? 'manual',
      user.reason ?? null,
      user.notes ?? null,
      user.ngCastCount ?? 0,
      user.registeredAt ?? new Date().toISOString(),
    ]);
  });
}

/** 共有 DB に保存された要注意人物を新しい登録順で取得する。 */
export async function getAllCautionUsers(): Promise<CautionUser[]> {
  const db = getSharedDb();
  const rows = await db.select<CautionRow[]>(SELECT_CAUTION_USERS_SQL);
  return rows.map(rowToBean);
}

/** account_id が一致する要注意人物を削除する。 */
export async function deleteCautionUserByAccountId(accountId: string): Promise<void> {
  const db = getSharedDb();
  const eventName = getRequiredEventName();
  await enqueueEventWrite(
    eventName,
    () => db.execute(DELETE_CAUTION_USER_SQL, [accountId]).then(() => undefined),
  );
}
