// 抽選結果は取込セッションごとの揮発データとして扱う。
// 同じ応募者集合で再抽選した場合は結果行全体を置き換える。
import { invoke } from '@tauri-apps/api/core';
import { getSessionDb } from '../database';
import type { MatchingTypeCode } from '@/common/types/sessionWorkflow';
import {
  enqueueSessionWrite,
  type SessionCommandContext,
} from './commandContext';

export interface LotteryResultRow {
  is_guaranteed: number;
  x_id: string;
}

export interface SavedLotteryRunRow {
  id: number;
  label: string;
  matching_type_code: MatchingTypeCode;
  lottery_count: number;
  guaranteed_count: number;
  winner_count: number;
  created_at: string;
}

export interface SavedLotteryResultRow {
  is_guaranteed: number;
  x_id: string;
}

export interface RestoredLotteryRunState {
  matchingTypeCode: MatchingTypeCode;
  lotteryCount: number;
}

/** 現在セッションの抽選結果を保存順で取得する。 */
export async function getLotteryResults(): Promise<LotteryResultRow[]> {
  const db = getSessionDb();
  return db.select<LotteryResultRow[]>(
    `SELECT lr.is_guaranteed, a.x_id
     FROM lottery_results lr
     INNER JOIN applicants a ON a.id = lr.applicant_id
     ORDER BY lr.id`,
  );
}

/** 現在セッションの抽選結果を全置換する。途中失敗時は既存結果を残す。 */
export async function replaceLotteryResults(
  rows: { x_id: string; is_guaranteed: boolean }[],
  expectedConditionRevision: number,
  context: SessionCommandContext,
): Promise<void> {
  await enqueueSessionWrite(context, () => invoke('replace_lottery_results_atomic', {
    eventName: context.eventName,
    timestamp: context.timestamp,
    rows,
    expectedConditionRevision,
  }));
}

/** 保存済みrunの条件・確定当選者・現行抽選結果を、一つのtransactionで復元する。 */
export async function restoreSavedLotteryRun(
  runId: number,
  expectedConditionRevision: number,
  context: SessionCommandContext,
): Promise<RestoredLotteryRunState> {
  return enqueueSessionWrite(context, () => invoke<RestoredLotteryRunState>('restore_lottery_run_atomic', {
    eventName: context.eventName,
    timestamp: context.timestamp,
    runId,
    expectedConditionRevision,
  }));
}

/** 保存済み抽選結果の見出し一覧を新しい順に取得する。 */
export async function listSavedLotteryRuns(): Promise<SavedLotteryRunRow[]> {
  const db = getSessionDb();
  return db.select<SavedLotteryRunRow[]>(
    `SELECT id, label, matching_type_code, lottery_count,
            guaranteed_count, winner_count, created_at
     FROM lottery_saved_runs
     ORDER BY id DESC`,
  );
}

/** 保存済み抽選結果1件の当選者行を保存順で取得する。 */
export async function getSavedLotteryResults(runId: number): Promise<SavedLotteryResultRow[]> {
  const db = getSessionDb();
  return db.select<SavedLotteryResultRow[]>(
    `SELECT lrr.is_guaranteed, a.x_id
     FROM lottery_saved_run_results lrr
     INNER JOIN applicants a ON a.id = lrr.applicant_id
     WHERE lrr.run_id = ?
     ORDER BY lrr.result_order`,
    [runId],
  );
}

/** DB上の現行抽選結果を、見出し行と当選者行を含むスナップショットとして保存する。 */
export async function saveLotteryRun(
  label: string,
  context: SessionCommandContext,
): Promise<number> {
  return enqueueSessionWrite(context, () => invoke<number>('save_lottery_run_atomic', {
    eventName: context.eventName,
    timestamp: context.timestamp,
    label,
  }));
}
