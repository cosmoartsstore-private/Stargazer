import { useMemo, useState } from 'react';
import type { CastBean, CautionUser } from '@/common/types/entities';
import {
  deleteCautionUserByAccountId,
  upsertCautionUser,
} from '@/db';
import {
  getOpenEventContext,
  isCurrentEventContext,
  type EventCommandContext,
} from '@/db/repositories/commandContext';
import {
  computeCautionCandidates,
  type CautionCandidate,
} from '@/features/matching/logics/caution-user';
import type { MatchingSettingsState } from '@/features/matching/stores/matching-settings-store';
import { getMsg } from '@/messages/getMsg';
import {
  EMPTY_CAUTION_FORM,
  clearSubmittedNgFormValues,
  createCandidateCautionUser,
  createManualCautionUser,
  hasCautionUserAccountId,
  mergeCautionUser,
  type CautionFormValues,
} from '../ngUserManagementModel';
import { useCautionThreshold } from './useCautionThreshold';
import { useExclusiveMutation } from './useExclusiveMutation';

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
  // 手動登録フォーム。
  const [form, setForm] = useState<CautionFormValues>(EMPTY_CAUTION_FORM);

  // 削除確認の対象と、人物更新の保存状態。
  const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);

  // state反映前の連打を防ぎつつ、人物更新を単一操作へ制限する。
  const {
    isActive: isSaving,
    run: runMutation,
    getIsActive: isMutationInFlight,
  } = useExclusiveMutation();

  // 閾値保存は人物更新から独立して進行し、候補一覧へ表示値を提供する。
  const cautionUsers = matchingSettings.caution.cautionUsers;
  const savedThreshold = matchingSettings.caution.candidateThreshold;
  const {
    thresholdDraft,
    displayedThreshold,
    isSavingThreshold,
    setThresholdDraft,
    commitThreshold,
  } = useCautionThreshold({
    currentEventName,
    savedThreshold,
    setMatchingSettings,
    showAlert,
  });
  const candidates = useMemo(
    () => computeCautionCandidates(
      casts,
      displayedThreshold,
      cautionUsers.map((user) => user.accountId),
    ),
    [casts, cautionUsers, displayedThreshold],
  );

  /** 手動登録フォームの指定項目だけを更新する。 */
  function updateForm(patch: Partial<CautionFormValues>): void {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function persistNewCautionUser(
    context: EventCommandContext,
    entry: CautionUser,
    failureMessage: string,
    afterSave?: () => void,
  ): Promise<void> {
    await runMutation(async () => {
      try {
        await upsertCautionUser(entry);
        if (!isCurrentEventContext(context)) return;
        setMatchingSettings((current) => ({
          ...current,
          caution: {
            ...current.caution,
            cautionUsers: mergeCautionUser(current.caution.cautionUsers, entry),
          },
        }));
        afterSave?.();
      } catch {
        if (isCurrentEventContext(context)) showAlert(failureMessage);
      }
    });
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
    if (hasCautionUserAccountId(cautionUsers, newEntry.accountId)) {
      showAlert(getMsg('NGUserManagementPage.duplicateCaution'));
      return;
    }
    const submittedForm = form;
    await persistNewCautionUser(
      context,
      newEntry,
      getMsg('NGUserManagementPage.addCautionFailed'),
      () => {
        // 保存中に追加入力された項目は残し、送信時から変わっていない値だけを消す。
        setForm((current) => clearSubmittedNgFormValues(current, submittedForm));
      },
    );
  }

  /** 自動候補の集計情報を固定登録へ写し、候補一覧から除外する。 */
  async function addCandidate(candidate: CautionCandidate): Promise<void> {
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      showAlert(getMsg('NGUserManagementPage.addCandidateNeedsEvent'));
      return;
    }
    const candidateNames = candidate.usernames.map((name) => name.trim()).filter(Boolean).join(' / ');
    const notes = candidateNames
      ? getMsg('NGUserManagementPage.candidateRegistrationReasonWithNames', {
          count: candidate.castCount,
          names: candidateNames,
        })
      : getMsg('NGUserManagementPage.candidateRegistrationReason', {
          count: candidate.castCount,
        });
    const newEntry = createCandidateCautionUser(
      candidate,
      new Date().toISOString(),
      notes,
    );
    if (newEntry === null) {
      showAlert(getMsg('NGUserManagementPage.candidateInvalidXId'));
      return;
    }
    if (hasCautionUserAccountId(cautionUsers, newEntry.accountId)) return;
    await persistNewCautionUser(
      context,
      newEntry,
      getMsg('NGUserManagementPage.addCandidateFailed'),
    );
  }

  function requestDelete(accountId: string): void {
    setPendingDeleteAccountId(accountId);
  }

  /** 確認済みのX IDだけを削除し、完全一致する固定登録を一覧から除く。 */
  async function confirmDelete(): Promise<void> {
    if (!pendingDeleteAccountId || isMutationInFlight()) return;
    const accountId = pendingDeleteAccountId;
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      setPendingDeleteAccountId(null);
      showAlert(getMsg('NGUserManagementPage.unregisterCautionNeedsEvent'));
      return;
    }
    await runMutation(async () => {
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
      }
    });
  }

  function cancelDelete(): void {
    if (!isMutationInFlight()) setPendingDeleteAccountId(null);
  }

  /** 理由・メモの明示的な空文字もrepositoryへ渡し、既存値を削除できるようにする。 */
  async function updateDetails(accountId: string, notes: string): Promise<void> {
    if (isMutationInFlight()) return;
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
    await runMutation(async () => {
      try {
        await upsertCautionUser({ ...target, notes });
        if (!isCurrentEventContext(context)) return;
        setMatchingSettings((current) => ({
          ...current,
          caution: {
            ...current.caution,
            cautionUsers: current.caution.cautionUsers.map((user) => (
              user.accountId === accountId
                ? { ...user, notes: notes || undefined }
                : user
            )),
          },
        }));
      } catch {
        if (isCurrentEventContext(context)) {
          showAlert(getMsg('NGUserManagementPage.detailsSaveFailed'));
        }
      }
    });
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
