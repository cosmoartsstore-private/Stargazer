import type { UserBean, CastBean } from '@/common/types/entities';
import {
  runMatching,
  type MatchingResult,
  type MatchingRunOptions,
} from './logics/matching-io';
import type { MatchingTypeCode } from './types/matching-type-codes';

export interface MatchingWorkerRequest {
  winners: UserBean[];
  casts: CastBean[];
  matchingTypeCode: MatchingTypeCode;
  options: MatchingRunOptions;
}

export type MatchingWorkerMessage =
  | { type: 'complete'; result: MatchingResult }
  | { type: 'error' };

self.onmessage = (event: MessageEvent<MatchingWorkerRequest>) => {
  const request = event.data;
  try {
    const result = runMatching(
      request.winners,
      request.casts,
      request.matchingTypeCode,
      request.options,
    );

    // structured clone は Map を保持するため、結果を転送専用DTOへ分解しない。
    self.postMessage({
      type: 'complete',
      result,
    });
  } catch {
    self.postMessage({
      type: 'error',
    });
  }
};
