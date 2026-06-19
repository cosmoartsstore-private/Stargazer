/**
 * マッチング関連設定の永続化（localStorage）。
 * NG判定は X ID 固定。探索モード・要注意人物・NG例外を保持する。
 */

import { STORAGE_KEYS } from '@/common/config';
import { getBrowserStorage } from '@/common/browserStorage';
import { parseXUsername } from '@/common/xIdUtils';
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
/** 旧保存データの登録日時欠落を、実行時刻に依存せず移行するための固定日時。 */
const LEGACY_REGISTERED_AT = '1970-01-01T00:00:00.000Z';

export interface MatchingSettingsState {
  ngJudgmentType: NGJudgmentType;
  ngMatchingBehavior: NGMatchingBehavior;
  searchMode: MatchingSearchMode;
  caution: CautionUserSettings;
  ngExceptions: NGExceptionSettings;
}

/** 保存済み JSON を読み込み、壊れた値は既定値へ戻せるよう null として扱う。 */
function loadFromStorage(): MatchingSettingsState | null {
  const storage = getBrowserStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEYS.MATCHING_SETTINGS);
    if (!raw) return null;
    const d = JSON.parse(raw) as unknown;
    if (!d || typeof d !== 'object') return null;
    const o = d as Record<string, unknown>;
    const behavior = o.ngMatchingBehavior;
    const searchMode = o.searchMode;
    return {
      ngJudgmentType: DEFAULT_JUDGMENT,
      ngMatchingBehavior: behavior === 'warn' || behavior === 'exclude' ? behavior : DEFAULT_BEHAVIOR,
      searchMode: searchMode === 'quality' || searchMode === 'efficiency' ? searchMode : DEFAULT_SEARCH_MODE,
      caution: normalizeCautionSettings(o.caution),
      ngExceptions: normalizeNGExceptionSettings(o.ngExceptions),
    };
  } catch {
    return null;
  }
}

/** 旧 localStorage データに登録日時がない場合も、型を満たす固定値で復元する。 */
function normalizeRegisteredAt(value: unknown): string {
  if (typeof value !== 'string') return LEGACY_REGISTERED_AT;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? LEGACY_REGISTERED_AT : new Date(timestamp).toISOString();
}

/** 保存データ由来の表示名を、空白だけの値を除外した文字列へ正規化する。 */
function normalizeStoredName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name ? name : null;
}

/** 保存データ由来の X ID を検証し、UI の登録経路と同じ @id 形式へ正規化する。 */
function normalizeStoredAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const username = parseXUsername(value);
  if (!username) return null;
  return username.startsWith('@') ? username : `@${username}`;
}

/** localStorage 由来の要注意人物レコードを、利用側の必須項目を満たす形へ移行する。 */
function toCautionUserRecord(value: unknown): CautionUser | null {
  if (!value || typeof value !== 'object') return null;
  const user = value as Record<string, unknown>;
  const registrationType = user.registrationType;
  const username = normalizeStoredName(user.username);
  const accountId = normalizeStoredAccountId(user.accountId);
  if (
    username === null ||
    accountId === null ||
    (registrationType !== 'auto' && registrationType !== 'manual')
  ) {
    return null;
  }

  const restored: CautionUser = {
    username,
    accountId,
    registrationType,
    registeredAt: normalizeRegisteredAt(user.registeredAt),
  };
  if (typeof user.ngCastCount === 'number') restored.ngCastCount = user.ngCastCount;
  if (typeof user.reason === 'string') restored.reason = user.reason;
  if (typeof user.notes === 'string') restored.notes = user.notes;
  return restored;
}

/** localStorage 由来の NG 例外レコードを、利用側の必須項目を満たす形へ移行する。 */
function toNGExceptionRecord(value: unknown): NGException | null {
  if (!value || typeof value !== 'object') return null;
  const exception = value as Record<string, unknown>;
  const username = normalizeStoredName(exception.username);
  const accountId = normalizeStoredAccountId(exception.accountId);
  if (username === null || accountId === null) {
    return null;
  }

  const restored: NGException = {
    username,
    accountId,
    registeredAt: normalizeRegisteredAt(exception.registeredAt),
  };
  if (typeof exception.note === 'string') restored.note = exception.note;
  return restored;
}

/** 正規化後に同じ accountId となるレコードは、保存順で先に現れたものを採用する。 */
function uniqueByAccountId<T extends { accountId: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = record.accountId.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 要注意人物設定を、安全に利用できる閾値とレコード一覧へ正規化する。 */
function normalizeCautionSettings(caution: unknown): CautionUserSettings {
  if (!caution || typeof caution !== 'object' || !Array.isArray((caution as { cautionUsers?: unknown }).cautionUsers)) {
    return {
      autoRegisterThreshold: DEFAULT_CAUTION_THRESHOLD,
      cautionUsers: [],
    };
  }
  const source = caution as { autoRegisterThreshold?: unknown; cautionUsers: unknown[] };
  const threshold =
    typeof source.autoRegisterThreshold === 'number' && source.autoRegisterThreshold >= 1
      ? source.autoRegisterThreshold
      : DEFAULT_CAUTION_THRESHOLD;
  const users = source.cautionUsers
    .map(toCautionUserRecord)
    .filter((user): user is CautionUser => user !== null);
  return { autoRegisterThreshold: threshold, cautionUsers: uniqueByAccountId(users) };
}

/** NG 例外設定を、安全に利用できるレコード一覧へ正規化する。 */
function normalizeNGExceptionSettings(ngExceptions: unknown): NGExceptionSettings {
  if (!ngExceptions || typeof ngExceptions !== 'object' || !Array.isArray((ngExceptions as { exceptions?: unknown }).exceptions)) {
    return { exceptions: [] };
  }
  const exceptions = (ngExceptions as { exceptions: unknown[] }).exceptions
    .map(toNGExceptionRecord)
    .filter((exception): exception is NGException => exception !== null);
  return { exceptions: uniqueByAccountId(exceptions) };
}

/** localStorage から初期マッチング設定を復元し、復元できない場合は既定値を返す。 */
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

/** NG 判定基準の固定仕様を、外部から渡された設定にも適用する。 */
export function normalizeMatchingSettingsState(state: MatchingSettingsState): MatchingSettingsState {
  return {
    ...state,
    ngJudgmentType: DEFAULT_JUDGMENT,
  };
}

/** マッチング設定を localStorage に保存する。保存不可の場合は UI を止めず警告だけを出す。 */
export function persistMatchingSettings(state: MatchingSettingsState): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEYS.MATCHING_SETTINGS, JSON.stringify(normalizeMatchingSettingsState(state)));
  } catch (e) {
    console.warn('マッチング設定の保存に失敗しました', e);
  }
}
