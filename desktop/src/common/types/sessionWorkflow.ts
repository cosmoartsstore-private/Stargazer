// 抽選・マッチング・永続化境界で共有するセッション条件の契約。

export const MATCHING_TYPE_CODES = ['M000', 'M001', 'M002', 'M003'] as const;

export type MatchingTypeCode = (typeof MATCHING_TYPE_CODES)[number];

export interface SessionWorkflowState {
  matchingTypeCode: MatchingTypeCode;
  lotteryCount: number;
  rotationCount: number;
  totalTables: number;
  usersPerTable: number;
  castsPerRotation: number;
  allowM003EmptySeats: boolean;
  m003SameDaySlotCount: number;
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
  allowM003EmptySeats: false,
  m003SameDaySlotCount: 0,
};
