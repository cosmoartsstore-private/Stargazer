import { useCallback, useState } from 'react';
import type {
  MatchedCast,
  MatchingScoreSummary,
  TableSlot,
} from '@/features/matching/logics/matching-io';
import { updateMatchingResultCastName } from '@/features/matching/logics/matching-result-integrity';
import {
  getInitialMatchingSettings,
  type MatchingSettingsState,
} from '@/features/matching/stores/matching-settings-store';

export interface MatchingResultState {
  result: Map<string, MatchedCast[]> | null;
  tableSlots: TableSlot[] | undefined;
  error: string | null;
  isLocked: boolean;
  scoreSummary: MatchingScoreSummary | null;
  isSaved: boolean;
}

const EMPTY_MATCHING_RESULT_STATE: MatchingResultState = {
  result: null,
  tableSlots: undefined,
  error: null,
  isLocked: false,
  scoreSummary: null,
  isSaved: false,
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

  const setMatchingSettings: MatchingContextState['setMatchingSettings'] = setMatchingSettingsState;

  const updateMatchingResult = useCallback((patch: Partial<MatchingResultState>) => {
    setMatchingResultState((current) => ({ ...current, ...patch }));
  }, []);

  const resetMatching = useCallback(() => {
    setMatchingResultState(EMPTY_MATCHING_RESULT_STATE);
  }, []);

  const updateMatchingCastName = useCallback((castId: number, name: string) => {
    setMatchingResultState((current) => {
      const updated = updateMatchingResultCastName(
        current.result,
        current.tableSlots,
        castId,
        name,
      );
      return { ...current, result: updated.resultMap, tableSlots: updated.tableSlots };
    });
  }, []);

  return {
    matchingSettings,
    setMatchingSettings,
    matchingResultState,
    updateMatchingResult,
    updateMatchingCastName,
    resetMatching,
  };
}
