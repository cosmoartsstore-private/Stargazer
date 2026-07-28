import type { CastBean } from '@/common/types/entities';
import type { MatchedCast, TableSlot } from './matching-io';
import { getNGReasonForCast } from './ng-judgment';

/**
 * 最終マッチング結果が参照しているものの、現在の名簿には存在しないキャストを返す。
 * テーブルの空席に割り当てられたキャストも結果の一部なので、userMap と tableSlots の両方を確認する。
 */
export function findUnavailableMatchingResultCasts(
  resultMap: Map<string, MatchedCast[]> | null,
  tableSlots: TableSlot[] | undefined,
  currentCasts: CastBean[],
): CastBean[] {
  const currentIds = new Set(currentCasts.map((cast) => cast.id));
  const unavailableById = new Map<number, CastBean>();
  const inspectMatches = (matches: MatchedCast[]) => {
    for (const match of matches) {
      if (!currentIds.has(match.cast.id)) unavailableById.set(match.cast.id, match.cast);
    }
  };

  resultMap?.forEach(inspectMatches);
  tableSlots?.forEach((slot) => inspectMatches(slot.matches));
  return [...unavailableById.values()];
}

/** 安定IDを維持した改名だけを、完了済みマッチング結果の表示用スナップショットへ反映する。 */
export function updateMatchingResultCastName(
  resultMap: Map<string, MatchedCast[]> | null,
  tableSlots: TableSlot[] | undefined,
  castId: number,
  name: string,
): { resultMap: Map<string, MatchedCast[]> | null; tableSlots: TableSlot[] | undefined } {
  const updateMatches = (matches: MatchedCast[]): MatchedCast[] => matches.map((match) => (
    match.cast.id === castId
      ? {
        ...match,
        cast: { ...match.cast, name },
        ngReason: match.isNGWarning ? getNGReasonForCast(name) : match.ngReason,
      }
      : match
  ));
  return {
    resultMap: resultMap === null
      ? null
      : new Map([...resultMap].map(([xId, matches]) => [xId, updateMatches(matches)])),
    tableSlots: tableSlots?.map((slot) => ({ ...slot, matches: updateMatches(slot.matches) })),
  };
}
