// Lottery results are per-import-session: re-running the lottery on the same
// applicant set replaces the whole row set, so this repository targets the
// session DB and exposes a TRUNCATE+INSERT replace operation.
import { getSessionDb } from '../database';

export interface LotteryResultRow {
  applicant_id: number;
  is_guaranteed: number;
}

export async function getLotteryResults(): Promise<LotteryResultRow[]> {
  const db = getSessionDb();
  return db.select<LotteryResultRow[]>(
    'SELECT applicant_id, is_guaranteed FROM lottery_results ORDER BY id',
  );
}

export async function replaceLotteryResults(
  rows: { applicant_id: number; is_guaranteed: boolean }[],
): Promise<void> {
  const db = getSessionDb();
  // tauri-plugin-sql does not expose a transaction handle, so we open/commit
  // BEGIN/COMMIT manually to keep the replace atomic.
  await db.execute('BEGIN');
  try {
    await db.execute('DELETE FROM lottery_results');
    for (const row of rows) {
      await db.execute(
        'INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?, ?)',
        [row.applicant_id, row.is_guaranteed ? 1 : 0],
      );
    }
    await db.execute('COMMIT');
  } catch (err) {
    await db.execute('ROLLBACK');
    throw err;
  }
}

export async function clearLotteryResults(): Promise<void> {
  const db = getSessionDb();
  await db.execute('DELETE FROM lottery_results');
}
