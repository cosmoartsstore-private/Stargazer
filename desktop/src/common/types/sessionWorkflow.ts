// 抽選・マッチング・永続化境界で共有するセッション条件の契約。

export const MATCHING_TYPE_CODES = ['M000', 'M001', 'M002', 'M003'] as const;
export const SAME_DAY_SLOT_UNITS = ['person', 'table'] as const;

export type MatchingTypeCode = (typeof MATCHING_TYPE_CODES)[number];
export type SameDaySlotUnit = (typeof SAME_DAY_SLOT_UNITS)[number];

export interface SessionWorkflowState {
  matchingTypeCode: MatchingTypeCode;
  lotteryCount: number;
  rotationCount: number;
  totalTables: number;
  usersPerTable: number;
  castsPerRotation: number;
  reserveSameDaySlots: boolean;
  sameDaySlotCount: number;
  sameDaySlotUnit: SameDaySlotUnit;
}

export interface SessionWorkflowSnapshot {
  state: SessionWorkflowState;
  isLotteryResultCurrent: boolean;
  conditionRevision: number;
}

export const DEFAULT_SESSION_WORKFLOW_STATE: Readonly<SessionWorkflowState> = {
  matchingTypeCode: 'M001',
  lotteryCount: 1,
  rotationCount: 2,
  totalTables: 15,
  usersPerTable: 1,
  castsPerRotation: 1,
  reserveSameDaySlots: false,
  sameDaySlotCount: 0,
  sameDaySlotUnit: 'table',
};
