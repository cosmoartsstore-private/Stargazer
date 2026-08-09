/**
 * マッチング設定の保存境界。
 *
 * 要注意人物と候補閾値はイベント共有データなので、共有DBを正とする。
 */

import { getSetting, setSetting } from '@/db/repositories/settingsRepository';
import type { CautionUserSettings } from '@/features/matching/types/matching-system-types';

export const DEFAULT_CAUTION_THRESHOLD = 2;
const CAUTION_CANDIDATE_THRESHOLD_SETTING_KEY = 'caution_auto_register_threshold';

export interface MatchingSettingsState {
  caution: CautionUserSettings;
}

/** DB読込前の空のイベント設定を返す。 */
export function getInitialMatchingSettings(): MatchingSettingsState {
  return {
    caution: {
      candidateThreshold: DEFAULT_CAUTION_THRESHOLD,
      cautionUsers: [],
    },
  };
}

/** 現在のイベント共有DBから要注意候補の閾値を取得する。 */
export async function getEventCautionThreshold(): Promise<number> {
  const stored = await getSetting(CAUTION_CANDIDATE_THRESHOLD_SETTING_KEY);
  if (stored === null) return DEFAULT_CAUTION_THRESHOLD;
  const parsed = Number(stored);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_CAUTION_THRESHOLD;
}

/** 要注意候補の閾値を現在のイベント共有DBへ保存する。 */
export async function persistEventCautionThreshold(threshold: number): Promise<void> {
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error('要注意候補の閾値は1以上の整数で指定してください。');
  }
  await setSetting(CAUTION_CANDIDATE_THRESHOLD_SETTING_KEY, String(threshold));
}
