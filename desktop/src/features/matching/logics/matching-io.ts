/**
 * マッチング実行の入出力エントリポイント。
 * 取込データの初期化、各種アルゴリズムへのプロキシ、警告判定付与を集約する。
 */

import type { UserBean, CastBean } from '@/common/types/entities';
import type { MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
import { isUserNGForCast, getNGReasonForCast } from './ng-judgment';
import {
  FIXED_NG_JUDGMENT_TYPE,
  type NGJudgmentType,
  type NGMatchingBehavior,
  type MatchingSearchMode,
} from '@/features/matching/types/matching-system-types';
import { runSingleCastMatching } from './matching-table-engine';
import { runMultipleMatching } from './matching-m003';
import { getPreferenceScore } from './matching-hungarian-engine';

export interface MatchedCast {
  cast: CastBean;
  rank: number;
  /** 0-based ローテーション番号。画面では 1-based で表示する。 */
  rotationIndex?: number;
  score?: number;
  isNGWarning?: boolean;
  ngReason?: string;
}

export interface TableSlot {
  user: UserBean | null;
  matches: MatchedCast[];
  /** 1-based テーブル番号。未指定時は表示側で配列順から補完する。 */
  tableIndex?: number;
}

export type MatchingFailureReason =
  | 'ng-conflict'
  | 'time-limit'
  | 'invalid-settings'
  | 'insufficient-capacity';

export interface MatchingScoreSummary {
  totalScore: number;
  averageScore: number;
  firstChoiceCount: number;
  secondChoiceCount: number;
  thirdChoiceCount: number;
  flatPreferenceCount: number;
  unpreferredCount: number;
  ngWarningCount: number;
}

export type MatchingResult = {
  userMap: Map<string, MatchedCast[]>;
  tableSlots?: TableSlot[];
  /** NG排除が不可能な組み合わせが検出された場合 true（UIで警告表示用） */
  ngConflict?: boolean;
  failureReason?: MatchingFailureReason;
  scoreSummary?: MatchingScoreSummary;
};

export interface MatchingRunOptions {
  rotationCount: number;
  totalTables?: number;
  usersPerTable?: number;
  castsPerRotation?: number;
  searchTimeLimitMs?: number;
  relaxedAfterMs?: number;
  searchMode?: MatchingSearchMode;
}

/** 指定された方式コードに応じてマッチングを実行し、警告・スコア集計を付与する。 */
export function runMatching(
  winners: UserBean[],
  allCasts: CastBean[],
  matchingTypeCode: MatchingTypeCode,
  options: MatchingRunOptions,
  ngJudgmentType: NGJudgmentType = FIXED_NG_JUDGMENT_TYPE,
  ngMatchingBehavior: NGMatchingBehavior = 'exclude',
): MatchingResult {
  const activeCasts = allCasts.filter((cast) => cast.is_present);
  const userMap = new Map<string, MatchedCast[]>();
  if (winners.length === 0 || activeCasts.length === 0) {
    return finalizeResult(
      { userMap },
      winners,
      ngJudgmentType,
      ngMatchingBehavior,
    );
  }

  const rotationCount = Math.max(1, options.rotationCount || 1);
  let result: MatchingResult;
  const totalTables = options.totalTables ?? winners.length;

  switch (matchingTypeCode) {
    case 'M001':
    case 'M002':
      result = runSingleCastMatching(
        winners,
        allCasts,
        totalTables,
        rotationCount,
        ngJudgmentType,
        ngMatchingBehavior,
        matchingTypeCode === 'M001',
      );
      break;
    case 'M003':
      result = runMultipleMatching(
        winners,
        allCasts,
        {
          usersPerTable: options.usersPerTable ?? 1,
          castsPerRotation: options.castsPerRotation ?? 1,
          rotationCount,
          totalTables: options.totalTables,
          searchTimeLimitMs: options.searchTimeLimitMs,
          relaxedAfterMs: options.relaxedAfterMs,
          searchMode: options.searchMode,
        },
        ngJudgmentType,
        ngMatchingBehavior,
      );
      break;
    default:
      result = { userMap };
  }

  return finalizeResult(result, winners, ngJudgmentType, ngMatchingBehavior);
}

/** アルゴリズム結果に NG 警告と確認可否の集計を付け、画面で扱う最終結果にする。 */
function finalizeResult(
  result: MatchingResult,
  winners: UserBean[],
  ngJudgmentType: NGJudgmentType,
  ngMatchingBehavior: NGMatchingBehavior,
): MatchingResult {
  const resultWithWarnings = attachWarnings(result, winners, ngJudgmentType, ngMatchingBehavior);
  if (!resultWithWarnings.ngConflict) {
    resultWithWarnings.scoreSummary = evaluateMatchingResult(resultWithWarnings, winners);
  }
  return resultWithWarnings;
}

/** warn モードで許容された NG 組み合わせに、表示用の警告情報を付与する。 */
function attachWarnings(
  result: MatchingResult,
  winners: UserBean[],
  ngJudgmentType: NGJudgmentType,
  ngMatchingBehavior: NGMatchingBehavior,
): MatchingResult {
  const winnerById = new Map(winners.map((winner) => [winner.x_id, winner]));

  result.userMap.forEach((matches, xId) => {
    const user = winnerById.get(xId);
    if (!user) return;
    matches.forEach((match) => {
      match.score = getPreferenceScore(user, match.cast);
      if (ngMatchingBehavior === 'warn') {
        match.isNGWarning = isUserNGForCast(user, match.cast, ngJudgmentType);
        match.ngReason = match.isNGWarning ? getNGReasonForCast(match.cast.name) : undefined;
      }
    });
  });

  result.tableSlots?.forEach((slot: TableSlot) => {
    const user = slot.user;
    slot.matches.forEach((match) => {
      match.score = user ? getPreferenceScore(user, match.cast) : 0;
      if (ngMatchingBehavior === 'warn') {
        match.isNGWarning = user ? isUserNGForCast(user, match.cast, ngJudgmentType) : false;
        match.ngReason = match.isNGWarning ? getNGReasonForCast(match.cast.name) : undefined;
      }
    });
  });
  return result;
}

/** マッチ結果全体の希望順位、NG 警告、未割り当てを集計して確定可能か判定する。 */
function evaluateMatchingResult(result: MatchingResult, winners: UserBean[]): MatchingScoreSummary {
  let totalScore = 0;
  let firstChoiceCount = 0;
  let secondChoiceCount = 0;
  let thirdChoiceCount = 0;
  let flatPreferenceCount = 0;
  let unpreferredCount = 0;
  let ngWarningCount = 0;
  let matchCount = 0;

  winners.forEach((winner) => {
    const matches = result.userMap.get(winner.x_id) ?? [];
    matches.forEach((match) => {
      const score = match.score ?? getPreferenceScore(winner, match.cast);
      totalScore += score;
      matchCount += 1;

      if (match.rank === 1) firstChoiceCount += 1;
      else if (match.rank === 2) secondChoiceCount += 1;
      else if (match.rank === 3) thirdChoiceCount += 1;
      else if (score > 0) flatPreferenceCount += 1;
      else unpreferredCount += 1;

      if (match.isNGWarning) {
        ngWarningCount += 1;
      }
    });
  });

  return {
    totalScore,
    averageScore: matchCount > 0 ? totalScore / matchCount : 0,
    firstChoiceCount,
    secondChoiceCount,
    thirdChoiceCount,
    flatPreferenceCount,
    unpreferredCount,
    ngWarningCount,
  };
}
