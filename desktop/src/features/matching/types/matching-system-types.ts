import type { CautionUser } from '@/common/types/entities';

export type { CautionUser };

/** NG判定基準 */
export type NGJudgmentType = 'username' | 'accountId' | 'either';
export const FIXED_NG_JUDGMENT_TYPE: NGJudgmentType = 'accountId';

/** マッチング時の挙動 */
export type NGMatchingBehavior = 'warn' | 'exclude';

/** 探索モード */
export type MatchingSearchMode = 'efficiency' | 'quality';

export interface CautionUserSettings {
  candidateThreshold: number;
  cautionUsers: CautionUser[];
}
