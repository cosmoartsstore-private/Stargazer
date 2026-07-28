import { useEffect, useMemo, useRef, useState } from 'react';
import type { CastBean } from '@/common/types/entities';
import {
  deleteCautionUserByAccountId,
  upsertCautionUser,
} from '@/db';
import {
  getOpenEventContext,
  isCurrentEventContext,
} from '@/db/repositories/commandContext';
import {
  computeCautionCandidates,
  type CautionCandidate,
} from '@/features/matching/logics/caution-user';
import {
  persistEventCautionThreshold,
  type MatchingSettingsState,
} from '@/features/matching/stores/matching-settings-store';
import { getMsg } from '@/messages/getMsg';
import {
  EMPTY_CAUTION_FORM,
  createCandidateCautionUser,
  createManualCautionUser,
  resolveDisplayedThreshold,
  type CautionFormValues,
} from '../ngUserManagementModel';

interface UseCautionUserManagementParams {
  casts: CastBean[];
  matchingSettings: MatchingSettingsState;
  setMatchingSettings: (
    state: MatchingSettingsState | ((current: MatchingSettingsState) => MatchingSettingsState),
  ) => void;
  currentEventName: string | null;
  showAlert: (message: string) => void;
}

/** 要注意人物の候補表示、固定登録、イベント単位の閾値保存を調停する。 */
export function useCautionUserManagement({
  casts,
  matchingSettings,
  setMatchingSettings,
  currentEventName,
  showAlert,
}: UseCautionUserManagementParams) {
  // 手動登録フォームと、候補表示へ即時反映する閾値の下書き。
  const [form, setForm] = useState<CautionFormValues>(EMPTY_CAUTION_FORM);
  const [thresholdDraft, setThresholdDraft] = useState(
    () => String(matchingSettings.caution.candidateThreshold),
  );

  // 削除確認の対象と、独立して進行できる二系統の保存状態。
  const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);

  // state反映前の連打を防ぎつつ、閾値保存と人物更新は互いに妨げない。
  const mutationInFlightRef = useRef(false);
  const thresholdMutationInFlightRef = useRef(false);

  // Contextの保存値と下書きから、候補一覧が直接使う表示値を導出する。
  const cautionUsers = matchingSettings.caution.cautionUsers;
  const savedThreshold = matchingSettings.caution.candidateThreshold;
  const displayedThreshold = resolveDisplayedThreshold(thresholdDraft, savedThreshold);
  const candidates = useMemo(
    () => computeCautionCandidates(
      casts,
      displayedThreshold,
      cautionUsers.map((user) => user.accountId),
    ),
    [casts, cautionUsers, displayedThreshold],
  );

  useEffect(() => {
    setThresholdDraft(String(savedThreshold));
  }, [currentEventName, savedThreshold]);

  /** 手動登録フォームの指定項目だけを更新する。 */
  function updateForm(patch: Partial<CautionFormValues>): void {
    setForm((current) => ({ ...current, ...patch }));
  }

  function beginMutation(): boolean {
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    setIsSaving(true);
    return true;
  }

  function endMutation(): void {
    mutationInFlightRef.current = false;
    setIsSaving(false);
  }

  /** 有効な閾値だけをイベント設定へ保存し、失敗時は保存済み値へ戻す。 */
  async function commitThreshold(): Promise<void> {
    if (thresholdMutationInFlightRef.current) return;
    const nextThreshold = Number(thresholdDraft);
    if (!Number.isInteger(nextThreshold) || nextThreshold < 1) {
      setThresholdDraft(String(savedThreshold));
      return;
    }
    if (nextThreshold === savedThreshold) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      showAlert(getMsg('NGUserManagementPage.thresholdNeedsEvent'));
      return;
    }

    thresholdMutationInFlightRef.current = true;
    setIsSavingThreshold(true);
    try {
      await persistEventCautionThreshold(nextThreshold);
      if (!isCurrentEventContext(context)) return;
      setMatchingSettings((current) => ({
        ...current,
        caution: { ...current.caution, candidateThreshold: nextThreshold },
      }));
    } catch {
      if (isCurrentEventContext(context)) {
        setThresholdDraft(String(savedThreshold));
        showAlert(getMsg('NGUserManagementPage.thresholdSaveFailed'));
      }
    } finally {
      thresholdMutationInFlightRef.current = false;
      setIsSavingThreshold(false);
    }
  }

  /** 手動入力を固定要注意人物へ変換し、保存後に同じイベントの一覧へ追加する。 */
  async function addManual(): Promise<void> {
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      showAlert(getMsg('NGUserManagementPage.addCautionNeedsEvent'));
      return;
    }
    const newEntry = createManualCautionUser(form, new Date().toISOString());
    if (newEntry === null) {
      showAlert(getMsg('NGUserManagementPage.invalidXId'));
      return;
    }
    if (cautionUsers.some((user) => user.accountId === newEntry.accountId)) {
      showAlert(getMsg('NGUserManagementPage.duplicateCaution'));
      return;
    }
    if (!beginMutation()) return;

    const submittedForm = form;
    try {
      await upsertCautionUser(newEntry);
      if (!isCurrentEventContext(context)) return;
      setMatchingSettings((current) => ({
        ...current,
        caution: {
          ...current.caution,
          cautionUsers: [...current.caution.cautionUsers, newEntry],
        },
      }));
      // 保存中に追加入力された項目は残し、送信時から変わっていない値だけを消す。
      setForm((current) => ({
        username: current.username === submittedForm.username ? '' : current.username,
        accountId: current.accountId === submittedForm.accountId ? '' : current.accountId,
        reason: current.reason === submittedForm.reason ? '' : current.reason,
        notes: current.notes === submittedForm.notes ? '' : current.notes,
      }));
    } catch {
      if (isCurrentEventContext(context)) {
        showAlert(getMsg('NGUserManagementPage.addCautionFailed'));
      }
    } finally {
      endMutation();
    }
  }

  /** 自動候補の集計情報を固定登録へ写し、候補一覧から除外する。 */
  async function addCandidate(candidate: CautionCandidate): Promise<void> {
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      showAlert(getMsg('NGUserManagementPage.addCandidateNeedsEvent'));
      return;
    }
    const reason = getMsg('NGUserManagementPage.candidateRegistrationReason', {
      count: candidate.castCount,
    });
    const newEntry = createCandidateCautionUser(
      candidate,
      new Date().toISOString(),
      reason,
    );
    if (newEntry === null) {
      showAlert(getMsg('NGUserManagementPage.candidateInvalidXId'));
      return;
    }
    if (cautionUsers.some((user) => user.accountId === newEntry.accountId)) return;
    if (!beginMutation()) return;

    try {
      await upsertCautionUser(newEntry);
      if (!isCurrentEventContext(context)) return;
      setMatchingSettings((current) => ({
        ...current,
        caution: {
          ...current.caution,
          cautionUsers: [...current.caution.cautionUsers, newEntry],
        },
      }));
    } catch {
      if (isCurrentEventContext(context)) {
        showAlert(getMsg('NGUserManagementPage.addCandidateFailed'));
      }
    } finally {
      endMutation();
    }
  }

  function requestDelete(accountId: string): void {
    setPendingDeleteAccountId(accountId);
  }

  /** 確認済みのX IDだけを削除し、完全一致する固定登録を一覧から除く。 */
  async function confirmDelete(): Promise<void> {
    if (!pendingDeleteAccountId || mutationInFlightRef.current) return;
    const accountId = pendingDeleteAccountId;
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      setPendingDeleteAccountId(null);
      showAlert(getMsg('NGUserManagementPage.unregisterCautionNeedsEvent'));
      return;
    }
    if (!beginMutation()) return;

    try {
      await deleteCautionUserByAccountId(accountId);
      if (!isCurrentEventContext(context)) return;
      setMatchingSettings((current) => ({
        ...current,
        caution: {
          ...current.caution,
          cautionUsers: current.caution.cautionUsers.filter(
            (user) => user.accountId !== accountId,
          ),
        },
      }));
    } catch {
      if (isCurrentEventContext(context)) {
        showAlert(getMsg('NGUserManagementPage.unregisterCautionFailed'));
      }
    } finally {
      if (isCurrentEventContext(context)) setPendingDeleteAccountId(null);
      endMutation();
    }
  }

  function cancelDelete(): void {
    if (!mutationInFlightRef.current) setPendingDeleteAccountId(null);
  }

  /** 理由とメモの明示的な空文字もrepositoryへ渡し、既存値を削除できるようにする。 */
  async function updateDetails(
    accountId: string,
    reason: string,
    notes: string,
  ): Promise<void> {
    if (mutationInFlightRef.current) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      showAlert(getMsg('NGUserManagementPage.saveDetailsNeedsEvent'));
      return;
    }
    const target = cautionUsers.find((user) => user.accountId === accountId);
    if (!target) {
      showAlert(getMsg('NGUserManagementPage.cautionEntryMissing'));
      return;
    }
    if (!beginMutation()) return;

    try {
      await upsertCautionUser({ ...target, reason, notes });
      if (!isCurrentEventContext(context)) return;
      setMatchingSettings((current) => ({
        ...current,
        caution: {
          ...current.caution,
          cautionUsers: current.caution.cautionUsers.map((user) => (
            user.accountId === accountId
              ? { ...user, reason: reason || undefined, notes: notes || undefined }
              : user
          )),
        },
      }));
    } catch {
      if (isCurrentEventContext(context)) {
        showAlert(getMsg('NGUserManagementPage.detailsSaveFailed'));
      }
    } finally {
      endMutation();
    }
  }

  return {
    state: {
      cautionUsers,
      candidates,
      displayedThreshold,
      thresholdDraft,
      form,
      isSaving,
      isSavingThreshold,
    },
    actions: {
      setThresholdDraft,
      commitThreshold,
      updateForm,
      addManual,
      addCandidate,
      requestDelete,
      updateDetails,
    },
    pendingDeleteAccountId,
    confirmDelete,
    cancelDelete,
  };
}
