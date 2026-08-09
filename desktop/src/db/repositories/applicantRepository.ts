// 応募者と行単位データ（希望キャスト、追加列）は取込セッションDBへ保存する。
// 希望名の表示だけは、安定IDを使ってイベント共有DBの現在名へ解決する。
import { invoke } from '@tauri-apps/api/core';
import { getSessionDb, getSharedDb } from '../database';
import type { UserBean } from '@/common/types/entities';
import {
  formatXAccountIdForDisplay,
  parseXUsername,
} from '@/common/xIdUtils';
import { getMsg } from '@/messages/getMsg';
import {
  enqueueSessionWrite,
  waitForSessionWritesToSettle,
  type SessionCommandContext,
} from './commandContext';
import { groupRowsBy } from './groupRowsBy';

/** 呼出済みの応募者更新が終わるまで待つ。後続の再取込を含む操作順確認に使用する。 */
export async function flushApplicantWrites(context: SessionCommandContext): Promise<void> {
  await waitForSessionWritesToSettle(context);
}

interface ApplicantRow {
  id: number;
  x_id: string;
  name: string | null;
  vrc_url: string | null;
  preference_mode: 'ranked' | 'flat';
  is_guaranteed: number;
}

interface CastPrefRow {
  applicant_id: number;
  preference_order: number;
  cast_name: string;
  cast_id: number | null;
}

interface SharedCastRow {
  id: number;
  name: string;
}

interface ExtraRow {
  applicant_id: number;
  field_key: string;
  field_value: string | null;
}

/** 現在の取込セッション DB から応募者と希望キャスト・追加列を読み込む。 */
export async function loadApplicants(): Promise<UserBean[]> {
  const sessionDb = getSessionDb();
  const sharedDb = getSharedDb();
  const [sharedCasts, rows, castPrefs, extras] = await Promise.all([
    sharedDb.select<SharedCastRow[]>('SELECT id, name FROM casts'),
    sessionDb.select<ApplicantRow[]>(
      'SELECT id, x_id, name, vrc_url, preference_mode, is_guaranteed FROM applicants ORDER BY id',
    ),
    sessionDb.select<CastPrefRow[]>(
      `SELECT applicant_id, preference_order, cast_name, cast_id
       FROM applicant_casts
       ORDER BY applicant_id, preference_order, id`,
    ),
    sessionDb.select<ExtraRow[]>(
      `SELECT applicant_id, field_key, field_value
       FROM applicant_extra
       ORDER BY applicant_id, id`,
    ),
  ]);
  const currentCastNameById = new Map(sharedCasts.map((cast) => [cast.id, cast.name]));

  const castPrefsByApplicantId = groupRowsBy(castPrefs, (row) => row.applicant_id);
  const extrasByApplicantId = groupRowsBy(extras, (row) => row.applicant_id);

  return rows.map((row) => {
    const applicantCastPrefs = castPrefsByApplicantId.get(row.id) ?? [];
    const applicantExtras = extrasByApplicantId.get(row.id) ?? [];
    const preferenceLength = applicantCastPrefs.reduce(
      (length, preference) => Math.max(length, preference.preference_order + 1),
      0,
    );
    const rankedCasts = Array<string>(preferenceLength).fill('');
    const rankedCastIds = Array<number | null>(preferenceLength).fill(null);
    for (const preference of applicantCastPrefs) {
      rankedCasts[preference.preference_order] =
        (preference.cast_id === null
          ? undefined
          : currentCastNameById.get(preference.cast_id)) ?? preference.cast_name;
      rankedCastIds[preference.preference_order] = preference.cast_id;
    }
    const preferenceMode = row.preference_mode;
    const activePreferenceIndexes = rankedCasts.flatMap(
      (castName, index) => castName ? [index] : [],
    );
    return {
      id: row.id,
      name: row.name ?? '',
      x_id: parseXUsername(row.x_id) ?? row.x_id.trim(),
      vrc_url: row.vrc_url ?? undefined,
      is_guaranteed: row.is_guaranteed === 1,
      casts: preferenceMode === 'flat'
        ? activePreferenceIndexes.map((index) => rankedCasts[index])
        : rankedCasts,
      cast_ids: preferenceMode === 'flat'
        ? activePreferenceIndexes.map((index) => rankedCastIds[index])
        : rankedCastIds,
      preference_mode: preferenceMode,
      raw_extra: applicantExtras.map((extra) => ({
        key: extra.field_key,
        value: extra.field_value ?? '',
      })),
    };
  });
}

/** 応募者一覧をセッション DB に全置換する。途中失敗時は既存応募者を残す。 */
export async function persistApplicants(
  users: UserBean[],
  context: SessionCommandContext,
): Promise<void> {
  const userWithoutCastIds = users.find((user) => user.cast_ids === undefined);
  if (userWithoutCastIds) {
    throw new Error(getMsg('applicantRepository.castIdUnresolved', {
      xId: formatXAccountIdForDisplay(userWithoutCastIds.x_id),
    }));
  }
  await enqueueSessionWrite(context, () => invoke('persist_applicants_atomic', {
    eventName: context.eventName,
    timestamp: context.timestamp,
    users: users.map((user) => ({
      name: user.name || null,
      x_id: user.x_id,
      vrc_url: user.vrc_url ?? null,
      casts: user.casts,
      cast_ids: user.cast_ids,
      preference_mode: user.preference_mode,
      is_guaranteed: user.is_guaranteed === true,
      raw_extra: user.raw_extra,
    })),
  }));
}

/** 応募者1件の希望キャストだけを更新し、現在および保存済みの抽選結果は維持する。 */
export async function updateApplicantCastPreferences(
  applicantId: number,
  castIds: Array<number | null>,
  context: SessionCommandContext,
): Promise<void> {
  await enqueueSessionWrite(context, () => invoke('update_applicant_cast_preferences_atomic', {
    eventName: context.eventName,
    timestamp: context.timestamp,
    applicantId,
    preferences: { cast_ids: castIds },
  }));
}

/** 応募者1件を安定IDで削除する。不正なX IDが複数残っていても1件ずつ解消できる。 */
export async function deleteApplicant(
  applicantId: number,
  context: SessionCommandContext,
): Promise<void> {
  await enqueueSessionWrite(context, () => invoke('delete_applicant_atomic', {
    eventName: context.eventName,
    timestamp: context.timestamp,
    applicantId,
  }));
}

/** 抽選前に選択した確定当選者を保存し、既存抽選結果を条件不一致として扱う。 */
export async function replaceApplicantGuarantees(
  guaranteedXIds: string[],
  context: SessionCommandContext,
): Promise<void> {
  await enqueueSessionWrite(context, () => invoke('replace_applicant_guarantees_atomic', {
    eventName: context.eventName,
    timestamp: context.timestamp,
    guaranteedXIds,
  }));
}
