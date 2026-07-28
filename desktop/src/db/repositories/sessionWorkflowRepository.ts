import { invoke } from '@tauri-apps/api/core';
import {
  MATCHING_TYPE_CODES,
  type MatchingTypeCode,
  DEFAULT_SESSION_WORKFLOW_STATE,
  type SessionWorkflowSnapshot,
  type SessionWorkflowState,
} from '@/common/types/sessionWorkflow';
import { getSessionDb } from '../database';
import {
  enqueueSessionWrite,
  getRequiredSessionContext,
  waitForSuccessfulSessionWrites,
  type SessionCommandContext,
} from './commandContext';

export {
  DEFAULT_SESSION_WORKFLOW_STATE,
  type SessionWorkflowSnapshot,
  type SessionWorkflowState,
} from '@/common/types/sessionWorkflow';

interface SessionWorkflowRow {
  matching_type_code: string;
  lottery_count: number;
  rotation_count: number;
  total_tables: number;
  users_per_table: number;
  casts_per_rotation: number;
  allow_m003_empty_seats: number;
  m003_same_day_slot_count: number;
  condition_revision: number;
  is_lottery_result_current: number;
}

const SELECT_SESSION_WORKFLOW_SQL = `
  SELECT
    matching_type_code,
    lottery_count,
    rotation_count,
    total_tables,
    users_per_table,
    casts_per_rotation,
    allow_m003_empty_seats,
    m003_same_day_slot_count,
    condition_revision,
    CASE
      WHEN EXISTS (SELECT 1 FROM lottery_results)
       AND lottery_result_revision = condition_revision
      THEN 1 ELSE 0
    END AS is_lottery_result_current
  FROM session_workflow_state
  WHERE id = 1
`;

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value >= 1 ? value : fallback;
}

function nonNegativeInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeMatchingTypeCode(value: string): MatchingTypeCode {
  return MATCHING_TYPE_CODES.includes(value as MatchingTypeCode)
    ? value as MatchingTypeCode
    : DEFAULT_SESSION_WORKFLOW_STATE.matchingTypeCode;
}

/** DB行を画面で利用可能なセッション条件へ正規化する。 */
function normalizeSessionWorkflowRow(
  row: SessionWorkflowRow | undefined,
): SessionWorkflowSnapshot {
  if (!row) {
    return {
      state: { ...DEFAULT_SESSION_WORKFLOW_STATE },
      isLotteryResultCurrent: false,
      conditionRevision: 0,
    };
  }
  return {
    state: {
      matchingTypeCode: normalizeMatchingTypeCode(row.matching_type_code),
      lotteryCount: positiveInteger(row.lottery_count, DEFAULT_SESSION_WORKFLOW_STATE.lotteryCount),
      rotationCount: positiveInteger(row.rotation_count, DEFAULT_SESSION_WORKFLOW_STATE.rotationCount),
      totalTables: positiveInteger(row.total_tables, DEFAULT_SESSION_WORKFLOW_STATE.totalTables),
      usersPerTable: positiveInteger(row.users_per_table, DEFAULT_SESSION_WORKFLOW_STATE.usersPerTable),
      castsPerRotation: positiveInteger(
        row.casts_per_rotation,
        DEFAULT_SESSION_WORKFLOW_STATE.castsPerRotation,
      ),
      allowM003EmptySeats: row.allow_m003_empty_seats === 1,
      m003SameDaySlotCount: nonNegativeInteger(
        row.m003_same_day_slot_count,
        DEFAULT_SESSION_WORKFLOW_STATE.m003SameDaySlotCount,
      ),
    },
    isLotteryResultCurrent: row.is_lottery_result_current === 1,
    conditionRevision: nonNegativeInteger(row.condition_revision, 0),
  };
}

/** 現在セッションの条件と、保存済み抽選結果がその条件に対応するかを読み込む。 */
export async function getSessionWorkflowSnapshot(): Promise<SessionWorkflowSnapshot> {
  const rows = await getSessionDb().select<SessionWorkflowRow[]>(SELECT_SESSION_WORKFLOW_SQL);
  return normalizeSessionWorkflowRow(rows[0]);
}

/**
 * セッション条件の書き込みを呼出順に直列化する。
 * イベント切替後も、呼出時点のイベント・セッション識別子へ保存する。
 */
export function persistSessionWorkflowState(
  state: SessionWorkflowState,
  context: SessionCommandContext = getRequiredSessionContext(),
): Promise<void> {
  // 同じDBを開き直して接続世代が変わっても、古い書込みと新しい書込みを並行させない。
  return enqueueSessionWrite(context, () => invoke<void>(
    'persist_session_workflow_state_atomic',
    {
      eventName: context.eventName,
      timestamp: context.timestamp,
      state: {
        matching_type_code: state.matchingTypeCode,
        lottery_count: state.lotteryCount,
        rotation_count: state.rotationCount,
        total_tables: state.totalTables,
        users_per_table: state.usersPerTable,
        casts_per_rotation: state.castsPerRotation,
        allow_m003_empty_seats: state.allowM003EmptySeats,
        m003_same_day_slot_count: state.m003SameDaySlotCount,
      },
    },
  ));
}

/** 先行する条件保存が完了するまで待機する。 */
export async function flushSessionWorkflowWrites(
  context: SessionCommandContext,
): Promise<void> {
  await waitForSuccessfulSessionWrites(context);
}
