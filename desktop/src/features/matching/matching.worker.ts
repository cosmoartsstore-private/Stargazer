import type { UserBean, CastBean } from '@/common/types/entities';
import { MatchingService, type MatchingFailureReason, type MatchedCast, type MatchingResult, type TableSlot } from './logics/matching-io';
import type { MatchingTypeCode } from './types/matching-type-codes';
import type { NGJudgmentType, NGMatchingBehavior } from './types/matching-system-types';

interface MatchingWorkerRequest {
  id: string;
  winners: UserBean[];
  casts: CastBean[];
  matchingTypeCode: MatchingTypeCode;
  options: {
    rotationCount: number;
    totalTables?: number;
    usersPerTable?: number;
    castsPerRotation?: number;
    searchTimeLimitMs?: number;
    relaxedAfterMs?: number;
    searchMode?: 'efficiency' | 'quality';
  };
  ngJudgmentType: NGJudgmentType;
  ngMatchingBehavior: NGMatchingBehavior;
}

interface SerializableMatchingResult extends Omit<MatchingResult, 'userMap'> {
  userMapEntries: Array<[string, MatchedCast[]]>;
  tableSlots?: TableSlot[];
  failureReason?: MatchingFailureReason;
}

function serializeResult(result: MatchingResult): SerializableMatchingResult {
  return {
    ...result,
    userMapEntries: [...result.userMap.entries()],
  };
}

self.onmessage = (event: MessageEvent<MatchingWorkerRequest>) => {
  const request = event.data;
  try {
    const result = MatchingService.runMatching(
      request.winners,
      request.casts,
      request.matchingTypeCode,
      request.options,
      request.ngJudgmentType,
      request.ngMatchingBehavior,
    );

    self.postMessage({
      type: 'complete',
      id: request.id,
      result: serializeResult(result),
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'マッチング中に予期しないエラーが発生しました。',
    });
  }
};
