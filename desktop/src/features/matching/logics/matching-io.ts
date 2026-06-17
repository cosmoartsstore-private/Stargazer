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
} from '@/features/matching/types/matching-system-types';
import { runRandomMatching } from './matching-m001';
import { runRotationMatching } from './matching-m002';
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
  tableIndex?: number; // M003用: 1-based テーブル番号
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
  unpreferredCount: number;
  ngWarningCount: number;
  matchCount: number;
  isConfirmable: boolean;
  blockingReasons: string[];
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
    searchMode?: 'efficiency' | 'quality';
}

export class MatchingService {
    static runMatching(
        winners: UserBean[],
        allCasts: CastBean[],
        matchingTypeCode: MatchingTypeCode,
        options: MatchingRunOptions,
        ngJudgmentType: NGJudgmentType = FIXED_NG_JUDGMENT_TYPE,
        ngMatchingBehavior: NGMatchingBehavior = 'exclude',
    ): MatchingResult {
        const activeCasts = allCasts.filter((c) => c.is_present);
        const userMap = new Map<string, MatchedCast[]>();
        if (winners.length === 0 || activeCasts.length === 0) {
            return finalizeResult(
                { userMap },
                winners,
                ngJudgmentType,
                ngMatchingBehavior,
            );
        }

        const ROUNDS = Math.max(1, options.rotationCount || 1);
        let result: MatchingResult;

        const totalTables = options.totalTables ?? winners.length;

        switch (matchingTypeCode) {
            case 'M001':
                result = runRandomMatching(
                    winners,
                    allCasts,
                    totalTables,
                    ROUNDS,
                    ngJudgmentType,
                    ngMatchingBehavior,
                );
                break;
            case 'M002':
                result = runRotationMatching(
                    winners,
                    allCasts,
                    totalTables,
                    ROUNDS,
                    ngJudgmentType,
                    ngMatchingBehavior,
                );
                break;
            case 'M003':
                result = runMultipleMatching(
                    winners,
                    allCasts,
                    {
                        usersPerTable: options.usersPerTable ?? 1,
                        castsPerRotation: options.castsPerRotation ?? 1,
                        rotationCount: ROUNDS,
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
}

function finalizeResult(
    res: MatchingResult,
    winners: UserBean[],
    ngJudgmentType: NGJudgmentType,
    ngMatchingBehavior: NGMatchingBehavior,
): MatchingResult {
    const resultWithWarnings = attachWarnings(res, winners, ngJudgmentType, ngMatchingBehavior);
    if (!resultWithWarnings.ngConflict) {
        resultWithWarnings.scoreSummary = evaluateMatchingResult(resultWithWarnings, winners);
    }
    return resultWithWarnings;
}

function attachWarnings(
    res: MatchingResult,
    winners: UserBean[],
    ngJudgmentType: NGJudgmentType,
    ngMatchingBehavior: NGMatchingBehavior,
): MatchingResult {
    const winnerById = new Map(winners.map((winner) => [winner.x_id, winner]));

    res.userMap.forEach((matches, xId) => {
        const user = winnerById.get(xId);
        if (!user) return;
        matches.forEach((m) => {
            m.score = getPreferenceScore(user, m.cast.name);
            if (ngMatchingBehavior === 'warn') {
                m.isNGWarning = isUserNGForCast(user, m.cast, ngJudgmentType);
                m.ngReason = m.isNGWarning ? getNGReasonForCast(m.cast.name) : undefined;
            }
        });
    });

    res.tableSlots?.forEach((slot: TableSlot) => {
        const user = slot.user;
        slot.matches.forEach((m) => {
            m.score = user ? getPreferenceScore(user, m.cast.name) : 0;
            if (ngMatchingBehavior === 'warn') {
                m.isNGWarning = user ? isUserNGForCast(user, m.cast, ngJudgmentType) : false;
                m.ngReason = m.isNGWarning ? getNGReasonForCast(m.cast.name) : undefined;
            }
        });
    });
    return res;
}

function evaluateMatchingResult(result: MatchingResult, winners: UserBean[]): MatchingScoreSummary {
    let totalScore = 0;
    let firstChoiceCount = 0;
    let secondChoiceCount = 0;
    let thirdChoiceCount = 0;
    let unpreferredCount = 0;
    let ngWarningCount = 0;
    let matchCount = 0;
    const blockingReasons: string[] = [];

    winners.forEach((winner) => {
        const matches = result.userMap.get(winner.x_id) ?? [];
        if (matches.length === 0) {
            blockingReasons.push(`${winner.name} が未割り当てです。`);
        }

        matches.forEach((match) => {
            const score = match.score ?? getPreferenceScore(winner, match.cast.name);
            totalScore += score;
            matchCount += 1;

            if (match.rank === 1) firstChoiceCount += 1;
            else if (match.rank === 2) secondChoiceCount += 1;
            else if (match.rank === 3) thirdChoiceCount += 1;
            else unpreferredCount += 1;

            if (match.isNGWarning) {
                ngWarningCount += 1;
                blockingReasons.push(`${winner.name} が ${match.cast.name} のNG対象です。`);
            }
        });
    });

    return {
        totalScore,
        averageScore: matchCount > 0 ? totalScore / matchCount : 0,
        firstChoiceCount,
        secondChoiceCount,
        thirdChoiceCount,
        unpreferredCount,
        ngWarningCount,
        matchCount,
        isConfirmable: blockingReasons.length === 0,
        blockingReasons,
    };
}
