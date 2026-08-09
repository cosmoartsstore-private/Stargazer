// 現行の抽選結果は取込セッション内で扱い、明示保存した結果はイベント共有DBへ固定する。
import { invoke } from '@tauri-apps/api/core';
import { getSessionDb } from '../database';
import type { MatchingTypeCode } from '@/common/types/sessionWorkflow';
import { parseXUsername } from '@/common/xIdUtils';
import {
  enqueueSessionWrite,
  type SessionCommandContext,
} from './commandContext';

export interface LotteryResultRow {
  is_guaranteed: number;
  x_id: string;
}

/** イベント共有DBに保存された抽選結果を一意に参照する。 */
export interface SavedLotteryResultTarget {
  savedResultId: number;
}

export interface EventSavedLotteryResultSummary extends SavedLotteryResultTarget {
  label: string;
  matchingTypeCode: MatchingTypeCode;
  lotteryCount: number;
  guaranteedCount: number;
  winnerCount: number;
  createdAt: string;
}

/** 現在セッションの抽選結果を保存順で取得する。 */
export async function getLotteryResults(): Promise<LotteryResultRow[]> {
  const db = getSessionDb();
  const rows = await db.select<LotteryResultRow[]>(
    `SELECT lr.is_guaranteed, a.x_id
     FROM lottery_results lr
     INNER JOIN applicants a ON a.id = lr.applicant_id
     ORDER BY lr.id`,
  );
  return rows.map((row) => ({
    ...row,
    x_id: parseXUsername(row.x_id) ?? row.x_id.trim(),
  }));
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

/** 現在のイベントに明示保存された抽選結果の見出しを取得する。 */
export async function listEventSavedLotteryResults(
  eventName: string,
): Promise<EventSavedLotteryResultSummary[]> {
  return invoke<EventSavedLotteryResultSummary[]>('list_event_saved_lottery_results', { eventName });
}

/** 保存済み抽選結果から読取専用セッションを作成し、そのtimestampを返す。 */
export async function createSessionFromSavedLotteryForLifecycle(
  eventName: string,
  target: SavedLotteryResultTarget,
): Promise<string> {
  return invoke<string>('create_session_from_saved_lottery_atomic', {
    eventName,
    savedResultId: target.savedResultId,
  });
}

/** DB上の現行抽選結果を、イベント共有DBへ自己完結したスナップショットとして保存する。 */
export async function saveLotteryResult(
  label: string,
  context: SessionCommandContext,
): Promise<number> {
  return enqueueSessionWrite(context, () => invoke<number>('save_lottery_result_atomic', {
    eventName: context.eventName,
    timestamp: context.timestamp,
    label,
  }));
}
