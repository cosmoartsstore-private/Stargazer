/**
 * マッチング設定の保存境界。
 *
 * 探索モードは端末単位の操作設定として localStorage に保存する。
 * 要注意人物と候補閾値はイベント共有データなので、共有DBを正とする。
 */

import { STORAGE_KEYS } from '@/common/config';
import { getBrowserStorage } from '@/common/browserStorage';
import { getSetting, setSetting } from '@/db/repositories/settingsRepository';
import type {
  CautionUserSettings,
  MatchingSearchMode,
} from '@/features/matching/types/matching-system-types';

const DEFAULT_SEARCH_MODE: MatchingSearchMode = 'efficiency';
export const DEFAULT_CAUTION_THRESHOLD = 2;
const CAUTION_CANDIDATE_THRESHOLD_SETTING_KEY = 'caution_auto_register_threshold';

export interface MatchingSettingsState {
  searchMode: MatchingSearchMode;
  caution: CautionUserSettings;
}

function isSearchMode(value: unknown): value is MatchingSearchMode {
  return value === 'quality' || value === 'efficiency';
}

/** 端末に保存された探索モードを読み込む。 */
function readInitialSearchMode(): MatchingSearchMode {
  const storage = getBrowserStorage();
  if (!storage) return DEFAULT_SEARCH_MODE;
  try {
    const stored = storage.getItem(STORAGE_KEYS.MATCHING_SEARCH_MODE);
    return isSearchMode(stored) ? stored : DEFAULT_SEARCH_MODE;
  } catch {
    return DEFAULT_SEARCH_MODE;
  }
}

/** 起動時の端末設定と、DB読込前の空のイベント設定を返す。 */
export function getInitialMatchingSettings(): MatchingSettingsState {
  return {
    searchMode: readInitialSearchMode(),
    caution: {
      candidateThreshold: DEFAULT_CAUTION_THRESHOLD,
      cautionUsers: [],
    },
  };
}

/** 探索モードだけを端末設定として保存する。 */
export function persistMatchingSearchMode(searchMode: MatchingSearchMode): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEYS.MATCHING_SEARCH_MODE, searchMode);
  } catch {
    // 端末設定の保存失敗は、現在の操作を妨げない。
  }
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
