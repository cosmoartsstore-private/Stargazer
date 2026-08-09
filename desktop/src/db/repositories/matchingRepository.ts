// マッチング結果の明示保存と、イベント単位の固定履歴を扱う。

import { invoke } from '@tauri-apps/api/core';
import type { MatchingTypeCode } from '@/common/types/sessionWorkflow';
import type { CastBean, UserBean } from '@/common/types/entities';
import type {
  MatchedCast,
  MatchingScoreSummary,
  TableSlot,
} from '@/features/matching/logics/matching-io';
import {
  enqueueSessionWrite,
  type SessionCommandContext,
} from './commandContext';

export interface SavedMatchingResultTarget {
  savedResultId: number;
}

export interface EventSavedMatchingResultSummary extends SavedMatchingResultTarget {
  label: string;
  matchingTypeCode: MatchingTypeCode;
  winnerCount: number;
  createdAt: string;
}

interface MatchingSnapshotCast {
  id: number;
  name: string;
  isPresent: boolean;
  ngEntries: Array<{
    username: string | null;
    accountId: string | null;
  }>;
}

interface MatchingSnapshotUser {
  name: string;
  xId: string;
}

interface MatchingSnapshotAssignment {
  castId: number;
  rank: number;
  rotationIndex: number;
  score: number;
  isNgWarning: boolean;
  ngReason: string | null;
}

interface MatchingSnapshotApplicant {
  user: MatchingSnapshotUser;
  matches: MatchingSnapshotAssignment[];
}

interface MatchingSnapshotTableSlot {
  tableIndex: number;
  user: MatchingSnapshotUser | null;
  matches: MatchingSnapshotAssignment[];
}

export interface MatchingResultSnapshot {
  casts: MatchingSnapshotCast[];
  applicants: MatchingSnapshotApplicant[];
  tableSlots: MatchingSnapshotTableSlot[];
  scoreSummary: MatchingScoreSummary;
}

export interface EventSavedMatchingResultDetail extends EventSavedMatchingResultSummary {
  snapshot: MatchingResultSnapshot;
}

export interface RestoredMatchingSnapshot {
  winners: UserBean[];
  casts: CastBean[];
  result: Map<string, MatchedCast[]>;
  tableSlots: TableSlot[];
  scoreSummary: MatchingScoreSummary;
}

function snapshotUser(user: UserBean): MatchingSnapshotUser {
  return { name: user.name, xId: user.x_id };
}

function snapshotAssignment(match: MatchedCast): MatchingSnapshotAssignment {
  return {
    castId: match.cast.id,
    rank: match.rank,
    rotationIndex: match.rotationIndex,
    score: match.score,
    isNgWarning: match.isNGWarning,
    ngReason: match.ngReason,
  };
}

function getApplicantMatches(result: Map<string, MatchedCast[]>, xId: string): MatchedCast[] {
  const matches = result.get(xId);
  if (!matches || matches.length === 0) {
    throw new Error('保存するマッチング結果に割り当てがない応募者が含まれています。');
  }
  return matches;
}

/** 現在の表示結果から、名簿変更の影響を受けない保存用データを作る。 */
export function buildMatchingResultSnapshot(
  winners: UserBean[],
  casts: CastBean[],
  result: Map<string, MatchedCast[]>,
  tableSlots: TableSlot[],
  scoreSummary: MatchingScoreSummary,
): MatchingResultSnapshot {
  const referencedCasts = new Map<number, CastBean>();
  casts
    .filter((cast) => cast.is_present)
    .forEach((cast) => referencedCasts.set(cast.id, cast));
  result.forEach((matches) => matches.forEach((match) => referencedCasts.set(match.cast.id, match.cast)));
  tableSlots.forEach((slot) => slot.matches.forEach((match) => referencedCasts.set(match.cast.id, match.cast)));

  return {
    casts: [...referencedCasts.values()].map((cast) => ({
      id: cast.id,
      name: cast.name,
      isPresent: cast.is_present,
      ngEntries: (cast.ng_entries ?? []).map((entry) => ({
        username: entry.username ?? null,
        accountId: entry.accountId ?? null,
      })),
    })),
    applicants: winners.map((winner) => ({
      user: snapshotUser(winner),
      matches: getApplicantMatches(result, winner.x_id).map(snapshotAssignment),
    })),
    tableSlots: tableSlots.map((slot) => ({
      tableIndex: slot.tableIndex,
      user: slot.user ? snapshotUser(slot.user) : null,
      matches: slot.matches.map(snapshotAssignment),
    })),
    scoreSummary,
  };
}

/** 保存データを既存の結果表示コンポーネントが扱える型へ戻す。 */
export function restoreMatchingResultSnapshot(
  snapshot: MatchingResultSnapshot,
): RestoredMatchingSnapshot {
  if (!Array.isArray(snapshot.casts) || !Array.isArray(snapshot.applicants) || !Array.isArray(snapshot.tableSlots)) {
    throw new Error('保存済みマッチング結果の表示データが不正です。');
  }
  const casts: CastBean[] = snapshot.casts.map((cast) => ({
    id: cast.id,
    name: cast.name,
    is_present: cast.isPresent,
  }));
  const castById = new Map(casts.map((cast) => [cast.id, cast]));
  const toUser = (user: MatchingSnapshotUser): UserBean => ({
    name: user.name,
    x_id: user.xId,
    casts: [],
    preference_mode: 'ranked',
    raw_extra: [],
  });
  const toMatch = (match: MatchingSnapshotAssignment): MatchedCast => {
    const cast = castById.get(match.castId);
    if (!cast) throw new Error('保存済みマッチング結果のキャスト情報が不足しています。');
    return {
      cast,
      rank: match.rank,
      rotationIndex: match.rotationIndex,
      score: match.score,
      isNGWarning: match.isNgWarning,
      ngReason: match.ngReason,
    };
  };
  const winners = snapshot.applicants.map(({ user }) => toUser(user));
  const result = new Map(snapshot.applicants.map(({ user, matches }) => [
    user.xId,
    matches.map(toMatch),
  ]));
  const tableSlots = snapshot.tableSlots.map((slot) => ({
    tableIndex: slot.tableIndex,
    user: slot.user ? toUser(slot.user) : null,
    matches: slot.matches.map(toMatch),
  }));
  return { winners, casts, result, tableSlots, scoreSummary: snapshot.scoreSummary };
}

export async function saveMatchingResult(
  label: string,
  matchingTypeCode: MatchingTypeCode,
  winnerCount: number,
  snapshot: MatchingResultSnapshot,
  context: SessionCommandContext,
): Promise<number> {
  return enqueueSessionWrite(context, () => invoke<number>('save_matching_result_atomic', {
    eventName: context.eventName,
    timestamp: context.timestamp,
    label,
    matchingTypeCode,
    winnerCount,
    snapshot,
  }));
}

export async function listEventSavedMatchingResults(
  eventName: string,
): Promise<EventSavedMatchingResultSummary[]> {
  return invoke<EventSavedMatchingResultSummary[]>('list_event_saved_matching_results', { eventName });
}

export async function getEventSavedMatchingResult(
  eventName: string,
  target: SavedMatchingResultTarget,
): Promise<EventSavedMatchingResultDetail> {
  return invoke<EventSavedMatchingResultDetail>('get_event_saved_matching_result', {
    eventName,
    savedResultId: target.savedResultId,
  });
}
