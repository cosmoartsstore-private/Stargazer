import type { CautionUser } from '@/common/types/entities';

export type { CautionUser };

export interface CautionUserSettings {
  candidateThreshold: number;
  cautionUsers: CautionUser[];
}
