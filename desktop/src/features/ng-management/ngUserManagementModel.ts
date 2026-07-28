import type {
  CastBean,
  CautionUser,
  NGUserEntry,
} from '@/common/types/entities';
import { formatXAccountId } from '@/common/xIdUtils';
import type { CautionCandidate } from '@/features/matching/logics/caution-user';

export type {
  CastBean,
  CautionCandidate,
  CautionUser,
  NGUserEntry,
};

export interface CastNgFormValues {
  username: string;
  accountId: string;
  notes: string;
}

export interface CautionFormValues {
  username: string;
  accountId: string;
  reason: string;
  notes: string;
}

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
  reason: '',
  notes: '',
};

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

/** NG管理で受け付けるX ID表現を、確認後に開くプロフィールURLへ変換する。 */
export function buildXProfileUrl(accountId: string | undefined): string | null {
  if (!accountId) return null;
  const username = formatXAccountId(accountId)?.replace(/^@+/, '');
  if (!username) return null;
  return `https://x.com/${username}`;
}

/** 現行画面と同じく、空白だけの検索は全件、それ以外は大小文字を無視して絞り込む。 */
export function filterCastsByName(casts: CastBean[], search: string): CastBean[] {
  return search.trim()
    ? casts.filter((cast) => cast.name.toLowerCase().includes(search.toLowerCase()))
    : casts;
}

/** 追加フォームを保存用NG登録へ整え、X IDを解釈できない場合は拒否する。 */
export function createCastNgEntry(form: CastNgFormValues): NGUserEntry | null {
  const accountId = formatXAccountId(form.accountId);
  if (!accountId) return null;

  return {
    username: form.username.trim() || undefined,
    accountId,
    notes: form.notes.trim() || undefined,
  };
}

/** 保存表記を変えず、usernameとaccountIdがともに一致する登録だけを重複とする。 */
export function isDuplicateCastNgEntry(
  entries: NGUserEntry[] | undefined,
  candidate: NGUserEntry,
): boolean {
  return (entries ?? []).some((entry) => (
    entry.username === candidate.username
    && entry.accountId === candidate.accountId
  ));
}

/** usernameとaccountIdがともに一致する既存行を、従来どおりすべて除く。 */
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

/** 手動登録フォームを、入力時刻を保持した固定要注意人物へ変換する。 */
export function createManualCautionUser(
  form: CautionFormValues,
  registeredAt: string,
): CautionUser | null {
  const accountId = formatXAccountId(form.accountId);
  if (!accountId) return null;

  return {
    username: form.username.trim() || accountId,
    accountId,
    registrationType: 'manual',
    registeredAt,
    reason: form.reason.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

/** 自動候補の名称・NG人数・理由を失わず固定要注意人物へ変換する。 */
export function createCandidateCautionUser(
  candidate: CautionCandidate,
  registeredAt: string,
  reason: string,
): CautionUser | null {
  const accountId = formatXAccountId(candidate.accountId);
  if (!accountId) return null;

  return {
    username: candidate.usernames.length > 0
      ? candidate.usernames.join(' / ')
      : accountId,
    accountId,
    registrationType: 'auto',
    ngCastCount: candidate.castCount,
    registeredAt,
    reason,
  };
}
