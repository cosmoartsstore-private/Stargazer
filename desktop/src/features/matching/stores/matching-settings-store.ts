/**
 * マッチング関連設定の永続化（localStorage）。
 * NG判定は X ID 固定。探索モード・要注意人物・NG例外を保持する。
 */

import { STORAGE_KEYS } from '@/common/config';
import {
  FIXED_NG_JUDGMENT_TYPE,
  type NGJudgmentType,
  type NGMatchingBehavior,
  type MatchingSearchMode,
  type CautionUser,
  type CautionUserSettings,
  type NGException,
  type NGExceptionSettings,
} from '@/features/matching/types/matching-system-types';

const DEFAULT_JUDGMENT: NGJudgmentType = FIXED_NG_JUDGMENT_TYPE;
const DEFAULT_BEHAVIOR: NGMatchingBehavior = 'exclude';
const DEFAULT_CAUTION_THRESHOLD = 2;
const DEFAULT_SEARCH_MODE: MatchingSearchMode = 'efficiency';

export interface MatchingSettingsState {
  ngJudgmentType: NGJudgmentType;
  ngMatchingBehavior: NGMatchingBehavior;
  searchMode: MatchingSearchMode;
  caution: CautionUserSettings;
  ngExceptions: NGExceptionSettings;
}

function loadFromStorage(): MatchingSettingsState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MATCHING_SETTINGS);
    if (!raw) return null;
    const d = JSON.parse(raw) as unknown;
    if (!d || typeof d !== 'object') return null;
    const o = d as Record<string, unknown>;
    const behavior = o.ngMatchingBehavior;
    const searchMode = o.searchMode;
    const caution = o.caution as CautionUserSettings | undefined;
    const ngExceptions = o.ngExceptions as NGExceptionSettings | undefined;
    return {
      ngJudgmentType: DEFAULT_JUDGMENT,
      ngMatchingBehavior: behavior === 'warn' || behavior === 'exclude' ? behavior : DEFAULT_BEHAVIOR,
      searchMode: searchMode === 'quality' || searchMode === 'efficiency' ? searchMode : DEFAULT_SEARCH_MODE,
      caution: normalizeCautionSettings(caution),
      ngExceptions: normalizeNGExceptionSettings(ngExceptions),
    };
  } catch {
    return null;
  }
}

function normalizeCautionSettings(caution: CautionUserSettings | undefined): CautionUserSettings {
  if (!caution || !Array.isArray(caution.cautionUsers)) {
    return {
      autoRegisterThreshold: DEFAULT_CAUTION_THRESHOLD,
      cautionUsers: [],
    };
  }
  const threshold =
    typeof caution.autoRegisterThreshold === 'number' && caution.autoRegisterThreshold >= 1
      ? caution.autoRegisterThreshold
      : DEFAULT_CAUTION_THRESHOLD;
  const users = caution.cautionUsers.filter(
    (u): u is CautionUser =>
      typeof u === 'object' &&
      u !== null &&
      typeof u.username === 'string' &&
      typeof u.accountId === 'string' &&
      (u.registrationType === 'auto' || u.registrationType === 'manual'),
  );
  return { autoRegisterThreshold: threshold, cautionUsers: users };
}

function normalizeNGExceptionSettings(
  ngExceptions: NGExceptionSettings | undefined,
): NGExceptionSettings {
  if (!ngExceptions || !Array.isArray(ngExceptions.exceptions)) {
    return { exceptions: [] };
  }
  const exceptions = ngExceptions.exceptions.filter(
    (e): e is NGException =>
      typeof e === 'object' &&
      e !== null &&
      typeof e.username === 'string' &&
      typeof e.accountId === 'string',
  );
  return { exceptions };
}

export function getInitialMatchingSettings(): MatchingSettingsState {
  const loaded = loadFromStorage();
  if (loaded) return normalizeMatchingSettingsState(loaded);
  return normalizeMatchingSettingsState({
    ngJudgmentType: DEFAULT_JUDGMENT,
    ngMatchingBehavior: DEFAULT_BEHAVIOR,
    searchMode: DEFAULT_SEARCH_MODE,
    caution: { autoRegisterThreshold: DEFAULT_CAUTION_THRESHOLD, cautionUsers: [] },
    ngExceptions: { exceptions: [] },
  });
}

export function normalizeMatchingSettingsState(state: MatchingSettingsState): MatchingSettingsState {
  return {
    ...state,
    ngJudgmentType: DEFAULT_JUDGMENT,
  };
}

export function persistMatchingSettings(state: MatchingSettingsState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.MATCHING_SETTINGS, JSON.stringify(normalizeMatchingSettingsState(state)));
  } catch (e) {
    console.warn('マッチング設定の保存に失敗しました', e);
  }
}
