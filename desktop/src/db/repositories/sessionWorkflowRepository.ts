import { invoke } from '@tauri-apps/api/core';
import {
  MATCHING_TYPE_CODES,
  SAME_DAY_SLOT_UNITS,
  type MatchingTypeCode,
  type SameDaySlotUnit,
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
  reserve_same_day_slots: number;
  same_day_slot_count: number;
  same_day_slot_unit: string;
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
    reserve_same_day_slots,
    same_day_slot_count,
    same_day_slot_unit,
    condition_revision,
    CASE
      WHEN EXISTS (SELECT 1 FROM lottery_results)
       AND lottery_result_revision = condition_revision
      THEN 1 ELSE 0
    END AS is_lottery_result_current
  FROM session_workflow_state
  WHERE id = 1
`;

function requirePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`セッション条件「${fieldName}」が不正です。`);
  }
  return value;
}

function requireNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`セッション条件「${fieldName}」が不正です。`);
  }
  return value;
}

function requireMatchingTypeCode(value: string): MatchingTypeCode {
  if (!MATCHING_TYPE_CODES.includes(value as MatchingTypeCode)) {
    throw new Error('セッション条件「マッチング方式」が不正です。');
  }
  return value as MatchingTypeCode;
}

function requireSameDaySlotUnit(value: string): SameDaySlotUnit {
  if (!SAME_DAY_SLOT_UNITS.includes(value as SameDaySlotUnit)) {
    throw new Error('セッション条件「当日枠の計数単位」が不正です。');
  }
  return value as SameDaySlotUnit;
}

/** 現行schemaのDB行を検証し、画面で利用するセッション条件へ変換する。 */
function readSessionWorkflowRow(
  row: SessionWorkflowRow | undefined,
): SessionWorkflowSnapshot {
  if (!row) {
    throw new Error('セッション条件が保存されていません。');
  }
  if (row.reserve_same_day_slots !== 0 && row.reserve_same_day_slots !== 1) {
    throw new Error('セッション条件「当日枠の確保」が不正です。');
  }
  if (row.is_lottery_result_current !== 0 && row.is_lottery_result_current !== 1) {
    throw new Error('抽選結果の状態が不正です。');
  }
  return {
    state: {
      matchingTypeCode: requireMatchingTypeCode(row.matching_type_code),
      lotteryCount: requirePositiveInteger(row.lottery_count, '抽選人数'),
      rotationCount: requirePositiveInteger(row.rotation_count, 'ラウンド数'),
      totalTables: requirePositiveInteger(row.total_tables, '総テーブル数'),
      usersPerTable: requirePositiveInteger(row.users_per_table, '1テーブルの応募者数'),
      castsPerRotation: requirePositiveInteger(row.casts_per_rotation, '1ラウンドのキャスト数'),
      reserveSameDaySlots: row.reserve_same_day_slots === 1,
      sameDaySlotCount: requireNonNegativeInteger(row.same_day_slot_count, '当日枠'),
      sameDaySlotUnit: requireSameDaySlotUnit(row.same_day_slot_unit),
    },
    isLotteryResultCurrent: row.is_lottery_result_current === 1,
    conditionRevision: requireNonNegativeInteger(row.condition_revision, '条件revision'),
  };
}

/** 現在セッションの条件と、保存済み抽選結果がその条件に対応するかを読み込む。 */
export async function getSessionWorkflowSnapshot(): Promise<SessionWorkflowSnapshot> {
  const rows = await getSessionDb().select<SessionWorkflowRow[]>(SELECT_SESSION_WORKFLOW_SQL);
  return readSessionWorkflowRow(rows[0]);
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
        reserve_same_day_slots: state.reserveSameDaySlots,
        same_day_slot_count: state.sameDaySlotCount,
        same_day_slot_unit: state.sameDaySlotUnit,
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
