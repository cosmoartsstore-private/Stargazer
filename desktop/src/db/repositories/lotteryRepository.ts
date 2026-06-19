// 抽選結果は取込セッションごとの揮発データとして扱う。
// 同じ応募者集合で再抽選した場合は結果行全体を置き換える。
import { invoke } from '@tauri-apps/api/core';
import { getSessionDb } from '../database';
import { getRequiredSessionContext } from './commandContext';

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

/** 保存済み抽選結果を扱う追加テーブルを、旧DBにも作成する。 */
async function ensureSavedLotteryRunTables(): Promise<void> {
  const db = getSessionDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lottery_saved_runs (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      label              TEXT NOT NULL,
      matching_type_code TEXT NOT NULL,
      lottery_count      INTEGER NOT NULL,
      guaranteed_count   INTEGER NOT NULL,
      winner_count       INTEGER NOT NULL,
      created_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lottery_saved_run_results (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id        INTEGER NOT NULL REFERENCES lottery_saved_runs(id) ON DELETE CASCADE,
      applicant_id  INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
      is_guaranteed INTEGER NOT NULL DEFAULT 0,
      result_order  INTEGER NOT NULL,
      UNIQUE(run_id, applicant_id)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_lottery_saved_run_results_run_id
      ON lottery_saved_run_results(run_id, result_order)
  `);
}

/** 現在セッションの抽選結果を保存順で取得する。 */
export async function getLotteryResults(): Promise<LotteryResultRow[]> {
  const db = getSessionDb();
  return db.select<LotteryResultRow[]>(
    'SELECT applicant_id, is_guaranteed FROM lottery_results ORDER BY id',
  );
}

/** 現在セッションの抽選結果を全置換する。途中失敗時は既存結果を残す。 */
export async function replaceLotteryResults(
  rows: { applicant_id: number; is_guaranteed: boolean }[],
): Promise<void> {
  const { eventName, timestamp } = getRequiredSessionContext();
  await invoke('replace_lottery_results_atomic', {
    eventName,
    timestamp,
    rows,
  });
}

/** 現在セッションの抽選結果を削除する。 */
export async function clearLotteryResults(): Promise<void> {
  const { eventName, timestamp } = getRequiredSessionContext();
  await invoke('clear_lottery_results_atomic', { eventName, timestamp });
}

/** 保存済み抽選結果の見出し一覧を新しい順に取得する。 */
export async function listSavedLotteryRuns(): Promise<SavedLotteryRunRow[]> {
  await ensureSavedLotteryRunTables();
  const db = getSessionDb();
  return db.select<SavedLotteryRunRow[]>(
    `SELECT id, label, matching_type_code, lottery_count, guaranteed_count, winner_count, created_at
     FROM lottery_saved_runs
     ORDER BY id DESC`,
  );
}

/** 保存済み抽選結果1件の当選者行を保存順で取得する。 */
export async function getSavedLotteryResults(runId: number): Promise<SavedLotteryResultRow[]> {
  await ensureSavedLotteryRunTables();
  const db = getSessionDb();
  return db.select<SavedLotteryResultRow[]>(
    `SELECT applicant_id, is_guaranteed, result_order
     FROM lottery_saved_run_results
     WHERE run_id = ?
     ORDER BY result_order`,
    [runId],
  );
}

/** 抽選結果スナップショットを、見出し行と当選者行を同じ transaction で保存する。 */
export async function saveLotteryRun(params: {
  label: string;
  matchingTypeCode: string;
  lotteryCount: number;
  guaranteedCount: number;
  rows: { applicant_id: number; is_guaranteed: boolean }[];
}): Promise<number> {
  const { eventName, timestamp } = getRequiredSessionContext();
  return invoke<number>('save_lottery_run_atomic', {
    eventName,
    timestamp,
    label: params.label,
    matchingTypeCode: params.matchingTypeCode,
    lotteryCount: params.lotteryCount,
    guaranteedCount: params.guaranteedCount,
    rows: params.rows,
  });
}
