// 応募者と行単位データ（希望キャスト、追加列）は取込セッションごとの揮発状態として扱う。
// CSV を再取込した場合は新しいセッション DB を作成し、この repository はセッション DB のみを対象にする。
import { invoke } from '@tauri-apps/api/core';
import { getSessionDb } from '../database';
import type { UserBean } from '@/common/types/entities';
import { getRequiredSessionContext } from './commandContext';

interface ApplicantRow {
  id: number;
  x_id: string;
  name: string | null;
  vrc_url: string | null;
  is_guaranteed: number;
}

interface CastPrefRow {
  preference_order: number;
  cast_name: string;
}

interface ExtraRow {
  field_key: string;
  field_value: string | null;
}

interface RawExtraPayload {
  key: string;
  value: string | null;
}

/** 追加列として保存できる key/value 形式かを判定する。 */
function isRawExtraRecord(value: unknown): value is { key: unknown; value?: unknown } {
  return typeof value === 'object' && value !== null && 'key' in value;
}

/** 追加列は任意入力由来のため、DB command に渡す直前で保存可能な形へ正規化する。 */
function normalizeRawExtra(rawExtra: unknown[]): RawExtraPayload[] {
  return rawExtra
    .filter(isRawExtraRecord)
    .filter((entry) => typeof entry.key === 'string' && entry.key.length > 0)
    .map((entry) => ({
      key: entry.key as string,
      value: entry.value == null ? null : String(entry.value),
    }));
}

/** 現在の取込セッション DB から応募者と希望キャスト・追加列を読み込む。 */
export async function loadApplicants(): Promise<UserBean[]> {
  const db = getSessionDb();
  const rows = await db.select<ApplicantRow[]>(
    'SELECT * FROM applicants ORDER BY id',
  );
  const users: UserBean[] = [];
  for (const row of rows) {
    const castPrefs = await db.select<CastPrefRow[]>(
      'SELECT preference_order, cast_name FROM applicant_casts WHERE applicant_id = ? ORDER BY preference_order',
      [row.id],
    );
    const extras = await db.select<ExtraRow[]>(
      'SELECT field_key, field_value FROM applicant_extra WHERE applicant_id = ?',
      [row.id],
    );
    const casts: string[] = [];
    for (const p of castPrefs) {
      casts[p.preference_order] = p.cast_name;
    }
    const preferenceMode = extras.find((e) => e.field_key === '__preference_mode')?.field_value;
    const normalizedPreferenceMode = preferenceMode === 'flat' ? 'flat' : 'ranked';
    const rankedCasts = Array.from({ length: casts.length }, (_, index) => casts[index] ?? '');
    users.push({
      name: row.name ?? '',
      x_id: row.x_id,
      vrc_url: row.vrc_url ?? undefined,
      is_guaranteed: row.is_guaranteed === 1,
      casts: normalizedPreferenceMode === 'flat' ? casts.filter(Boolean) : rankedCasts,
      preference_mode: normalizedPreferenceMode,
      raw_extra: extras
        .filter((e) => e.field_key !== '__preference_mode')
        .map((e) => ({ key: e.field_key, value: e.field_value ?? '' })),
    });
  }
  return users;
}

/** 応募者一覧をセッション DB に全置換する。途中失敗時は既存応募者を残す。 */
export async function persistApplicants(users: UserBean[]): Promise<void> {
  const { eventName, timestamp } = getRequiredSessionContext();
  await invoke('persist_applicants_atomic', {
    eventName,
    timestamp,
    users: users.map((user) => ({
      name: user.name || null,
      x_id: user.x_id,
      vrc_url: user.vrc_url ?? null,
      casts: user.casts,
      preference_mode: user.preference_mode ?? 'ranked',
      is_guaranteed: user.is_guaranteed === true,
      raw_extra: normalizeRawExtra(user.raw_extra),
    })),
  });
}
