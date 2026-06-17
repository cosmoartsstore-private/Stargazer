// Lottery results are per-import-session: re-running the lottery on the same
// applicant set replaces the whole row set, so this repository targets the
// session DB and exposes a TRUNCATE+INSERT replace operation.
import { getSessionDb } from '../database';

export interface LotteryResultRow {
  applicant_id: number;
  is_guaranteed: number;
}

export interface SavedLotteryRunRow {
  id: number;
  label: string;
  matching_type_code: string;
  lottery_count: number;
  guaranteed_count: number;
  winner_count: number;
  created_at: string;
}

export interface SavedLotteryResultRow {
  applicant_id: number;
  is_guaranteed: number;
  result_order: number;
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

export async function listSavedLotteryRuns(): Promise<SavedLotteryRunRow[]> {
  const db = getSessionDb();
  return db.select<SavedLotteryRunRow[]>(
    `SELECT id, label, matching_type_code, lottery_count, guaranteed_count, winner_count, created_at
     FROM lottery_saved_runs
     ORDER BY id DESC`,
  );
}

export async function getSavedLotteryResults(runId: number): Promise<SavedLotteryResultRow[]> {
  const db = getSessionDb();
  return db.select<SavedLotteryResultRow[]>(
    `SELECT applicant_id, is_guaranteed, result_order
     FROM lottery_saved_run_results
     WHERE run_id = ?
     ORDER BY result_order`,
    [runId],
  );
}

export async function saveLotteryRun(params: {
  label: string;
  matchingTypeCode: string;
  lotteryCount: number;
  guaranteedCount: number;
  rows: { applicant_id: number; is_guaranteed: boolean }[];
}): Promise<number> {
  const db = getSessionDb();
  await db.execute('BEGIN');
  try {
    await db.execute(
      `INSERT INTO lottery_saved_runs
        (label, matching_type_code, lottery_count, guaranteed_count, winner_count)
       VALUES (?, ?, ?, ?, ?)`,
      [
        params.label,
        params.matchingTypeCode,
        params.lotteryCount,
        params.guaranteedCount,
        params.rows.length,
      ],
    );
    const inserted = await db.select<Array<{ id: number }>>('SELECT last_insert_rowid() AS id');
    const runId = inserted[0]?.id;
    if (runId == null) {
      throw new Error('保存済み抽選結果IDを取得できませんでした。');
    }
    for (const [index, row] of params.rows.entries()) {
      await db.execute(
        `INSERT INTO lottery_saved_run_results
          (run_id, applicant_id, is_guaranteed, result_order)
         VALUES (?, ?, ?, ?)`,
        [runId, row.applicant_id, row.is_guaranteed ? 1 : 0, index],
      );
    }
    await db.execute('COMMIT');
    return runId;
  } catch (err) {
    await db.execute('ROLLBACK');
    throw err;
  }
}
