import { useEffect, useRef, useState } from 'react';
import {
  getOpenEventContext,
  isCurrentEventContext,
} from '@/db/repositories/commandContext';
import {
  persistEventCautionThreshold,
  type MatchingSettingsState,
} from '@/features/matching/stores/matching-settings-store';
import { getMsg } from '@/messages/getMsg';
import { resolveDisplayedThreshold } from '../ngUserManagementModel';

interface UseCautionThresholdParams {
  currentEventName: string | null;
  savedThreshold: number;
  setMatchingSettings: (
    state: MatchingSettingsState | ((current: MatchingSettingsState) => MatchingSettingsState),
  ) => void;
  showAlert: (message: string) => void;
}

/** 要注意候補の閾値下書きと、イベント共有DBへの保存を調停する。 */
export function useCautionThreshold({
  currentEventName,
  savedThreshold,
  setMatchingSettings,
  showAlert,
}: UseCautionThresholdParams) {
  const [thresholdDraft, setThresholdDraft] = useState(() => String(savedThreshold));
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const mutationInFlightRef = useRef<Promise<boolean> | null>(null);
  const displayedThreshold = resolveDisplayedThreshold(thresholdDraft, savedThreshold);

  useEffect(() => {
    setThresholdDraft(String(savedThreshold));
  }, [currentEventName, savedThreshold]);

  /** 有効な閾値だけを保存し、失敗時は保存済み値へ戻す。 */
  function commitThreshold(draft: string): Promise<boolean> {
    if (mutationInFlightRef.current) return mutationInFlightRef.current;
    const nextThreshold = Number(draft);
    if (!Number.isInteger(nextThreshold) || nextThreshold < 1) {
      setThresholdDraft(String(savedThreshold));
      return Promise.resolve(true);
    }
    setThresholdDraft(String(nextThreshold));
    if (nextThreshold === savedThreshold) return Promise.resolve(true);
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      showAlert(getMsg('NGUserManagementPage.thresholdNeedsEvent'));
      return Promise.resolve(false);
    }

    setIsSavingThreshold(true);
    const commitPromise = Promise.resolve().then(async () => {
      try {
        await persistEventCautionThreshold(nextThreshold);
        if (!isCurrentEventContext(context)) return false;
        setMatchingSettings((current) => ({
          ...current,
          caution: { ...current.caution, candidateThreshold: nextThreshold },
        }));
        return true;
      } catch {
        if (isCurrentEventContext(context)) {
          setThresholdDraft(String(savedThreshold));
          showAlert(getMsg('NGUserManagementPage.thresholdSaveFailed'));
        }
        return false;
      }
    });
    mutationInFlightRef.current = commitPromise;
    const finishCommit = () => {
      if (mutationInFlightRef.current !== commitPromise) return;
      mutationInFlightRef.current = null;
      setIsSavingThreshold(false);
    };
    void commitPromise.then(finishCommit, finishCommit);
    return commitPromise;
  }

  return {
    thresholdDraft,
    displayedThreshold,
    isSavingThreshold,
    setThresholdDraft,
    commitThreshold,
  };
}
