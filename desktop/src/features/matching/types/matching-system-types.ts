import type { CautionUser } from '@/common/types/entities';

export type { CautionUser };

/** 探索モード */
export type MatchingSearchMode = 'efficiency' | 'quality';

export interface CautionUserSettings {
  candidateThreshold: number;
  cautionUsers: CautionUser[];
}
