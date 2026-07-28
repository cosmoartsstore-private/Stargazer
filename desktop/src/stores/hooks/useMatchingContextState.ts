import { useState } from 'react';
import type { MatchedCast, TableSlot } from '@/features/matching/logics/matching-io';
import { updateMatchingResultCastName } from '@/features/matching/logics/matching-result-integrity';
import {
  getInitialMatchingSettings,
  persistMatchingSearchMode,
  type MatchingSettingsState,
} from '@/features/matching/stores/matching-settings-store';

export interface MatchingResultState {
  result: Map<string, MatchedCast[]> | null;
  tableSlots: TableSlot[] | undefined;
  error: string | null;
  isLocked: boolean;
}

const EMPTY_MATCHING_RESULT_STATE: MatchingResultState = {
  result: null,
  tableSlots: undefined,
  error: null,
  isLocked: false,
};

export interface MatchingContextState {
  matchingSettings: MatchingSettingsState;
  setMatchingSettings: (
    state: MatchingSettingsState | ((previous: MatchingSettingsState) => MatchingSettingsState)
  ) => void;
  matchingResultState: MatchingResultState;
  updateMatchingResult: (patch: Partial<MatchingResultState>) => void;
  updateMatchingCastName: (castId: number, name: string) => void;
  resetMatching: () => void;
}

/** 端末設定と一時マッチング結果を管理し、キャスト改名を表示結果へ反映する。 */
export function useMatchingContextState(): MatchingContextState {
  const [matchingSettings, setMatchingSettingsState] = useState<MatchingSettingsState>(
    () => getInitialMatchingSettings(),
  );
  const [matchingResultState, setMatchingResultState] = useState<MatchingResultState>(
    EMPTY_MATCHING_RESULT_STATE,
  );

  // 端末単位の探索モードだけを永続化し、イベント由来の要注意情報は表示キャッシュに留める。
  const setMatchingSettings: MatchingContextState['setMatchingSettings'] = (stateOrUpdater) => {
    setMatchingSettingsState((previous) => {
      const next = typeof stateOrUpdater === 'function'
        ? stateOrUpdater(previous)
        : stateOrUpdater;
      if (next.searchMode !== previous.searchMode) {
        persistMatchingSearchMode(next.searchMode);
      }
      return next;
    });
  };

  const updateMatchingResult = (patch: Partial<MatchingResultState>) => {
    setMatchingResultState((current) => ({ ...current, ...patch }));
  };

  const resetMatching = () => {
    setMatchingResultState(EMPTY_MATCHING_RESULT_STATE);
  };

  const updateMatchingCastName = (castId: number, name: string) => {
    setMatchingResultState((current) => {
      const updated = updateMatchingResultCastName(
        current.result,
        current.tableSlots,
        castId,
        name,
      );
      return { ...current, result: updated.resultMap, tableSlots: updated.tableSlots };
    });
  };

  return {
    matchingSettings,
    setMatchingSettings,
    matchingResultState,
    updateMatchingResult,
    updateMatchingCastName,
    resetMatching,
  };
}
