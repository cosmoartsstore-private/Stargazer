import type {
  CastBean,
  CautionUser,
  NGUserEntry,
} from '@/common/types/entities';
import {
  formatXAccountIdForDisplay,
  normalizeXAccountId,
  parseXUsername,
} from '@/common/xIdUtils';
import type { CautionCandidate } from '@/features/matching/logics/caution-user';

export interface NgRegistrationFormValues {
  username: string;
  accountId: string;
  notes: string;
}

export type CastNgFormValues = NgRegistrationFormValues;
export type CautionFormValues = NgRegistrationFormValues;

/** キャスト別NGの登録成功後に、入力フォームを初期状態へ戻すための値。 */
export const EMPTY_CAST_NG_FORM: CastNgFormValues = {
  username: '',
  accountId: '',
  notes: '',
};

/** 要注意人物の手動登録成功後に、入力フォームを初期状態へ戻すための値。 */
export const EMPTY_CAUTION_FORM: CautionFormValues = {
  username: '',
  accountId: '',
  notes: '',
};

/** 保存開始後に変更された入力は残し、送信時と同じ項目だけを空へ戻す。 */
export function clearSubmittedNgFormValues(
  current: NgRegistrationFormValues,
  submitted: NgRegistrationFormValues,
): NgRegistrationFormValues {
  return {
    username: current.username === submitted.username ? '' : current.username,
    accountId: current.accountId === submitted.accountId ? '' : current.accountId,
    notes: current.notes === submitted.notes ? '' : current.notes,
  };
}

export interface PendingCastNgDeletion {
  castId: number;
  entry: NGUserEntry;
}

/** 現在の選択が名簿に残る間は維持し、未選択・削除済みなら先頭へ移す。 */
export function resolveSelectedCastId(
  casts: Array<{ id: number }>,
  selectedCastId: number | null,
): number | null {
  return selectedCastId !== null && casts.some((cast) => cast.id === selectedCastId)
    ? selectedCastId
    : (casts[0]?.id ?? null);
}

/** 入力中の正整数を候補表示へ使い、それ以外は保存済み閾値へ戻す。 */
export function resolveDisplayedThreshold(draft: string, saved: number): number {
  const parsed = Number(draft);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : saved;
}

/** 現行画面と同じく、空白だけの検索は全件、それ以外は大小文字を無視して絞り込む。 */
export function filterCastsByName(casts: CastBean[], search: string): CastBean[] {
  return search.trim()
    ? casts.filter((cast) => cast.name.toLowerCase().includes(search.toLowerCase()))
    : casts;
}

/** 追加フォームを保存用NG登録へ整え、X IDを解釈できない場合は拒否する。 */
export function createCastNgEntry(form: CastNgFormValues): NGUserEntry | null {
  const accountId = parseXUsername(form.accountId);
  if (!accountId) return null;

  return {
    username: form.username.trim() || undefined,
    accountId,
    notes: form.notes.trim() || undefined,
  };
}

/** 先頭の@と大文字小文字を除いたX IDが一致する登録を重複とする。 */
export function isDuplicateCastNgEntry(
  entries: NGUserEntry[] | undefined,
  candidate: NGUserEntry,
): boolean {
  const candidateAccountId = normalizeXAccountId(candidate.accountId ?? '');
  return candidateAccountId !== null && (entries ?? []).some(
    (entry) => normalizeXAccountId(entry.accountId ?? '') === candidateAccountId,
  );
}

/** usernameと内部表現のaccountIdがともに一致する既存行をすべて除く。 */
export function removeCastNgEntry(
  entries: NGUserEntry[] | undefined,
  target: NGUserEntry,
): NGUserEntry[] {
  return (entries ?? []).filter((entry) => (
    entry.username !== target.username
    || entry.accountId !== target.accountId
  ));
}

/** 表示行のindexに対応するNG登録だけのメモを置き換える。 */
export function updateCastNgEntryNotes(
  entries: NGUserEntry[],
  entryIndex: number,
  notes: string,
): NGUserEntry[] {
  return entries.map((entry, index) => (
    index === entryIndex ? { ...entry, notes: notes || undefined } : entry
  ));
}

/** 先頭の@と大文字小文字を除いたX IDが一致する固定要注意人物の有無を返す。 */
export function hasCautionUserAccountId(users: CautionUser[], accountId: string): boolean {
  const accountIdKey = normalizeXAccountId(accountId);
  return accountIdKey !== null && users.some(
    (user) => normalizeXAccountId(user.accountId) === accountIdKey,
  );
}

/** 同じ正規化X IDの固定登録を一件へまとめ、最新の保存値を反映する。 */
export function mergeCautionUser(users: CautionUser[], entry: CautionUser): CautionUser[] {
  const entryKey = normalizeXAccountId(entry.accountId);
  let replaced = false;
  const merged = users.flatMap((user) => {
    if (normalizeXAccountId(user.accountId) !== entryKey) return [user];
    if (replaced) return [];
    replaced = true;
    return [entry];
  });
  return replaced ? merged : [...merged, entry];
}

/** 手動登録フォームを、入力時刻を保持した固定要注意人物へ変換する。 */
export function createManualCautionUser(
  form: CautionFormValues,
  registeredAt: string,
): CautionUser | null {
  const accountId = parseXUsername(form.accountId);
  if (!accountId) return null;

  return {
    username: form.username.trim() || formatXAccountIdForDisplay(accountId),
    accountId,
    ngCastCount: 0,
    registeredAt,
    notes: form.notes.trim() || undefined,
  };
}

/** 自動候補は名前未入力として固定し、応募時の表示名を本人照合条件へ混入させない。 */
export function createCandidateCautionUser(
  candidate: CautionCandidate,
  registeredAt: string,
  notes: string,
): CautionUser | null {
  const accountId = parseXUsername(candidate.accountId);
  if (!accountId) return null;

  return {
    username: formatXAccountIdForDisplay(accountId),
    accountId,
    ngCastCount: candidate.castCount,
    registeredAt,
    notes,
  };
}
