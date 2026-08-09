import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { UserBean } from '@/common/types/entities';
import {
  deleteApplicant,
  flushApplicantWrites,
  getLotteryResults,
  getSessionWorkflowSnapshot,
  loadApplicants,
  persistApplicants,
  updateApplicantCastPreferences,
} from '@/db';
import {
  captureSessionWriteActivity,
  getRequiredSessionContext,
  isCurrentSessionContext,
  isSessionRecoveryActive,
  isSessionWriteActivityUnchanged,
  runAsSessionRecovery,
  waitForEventWritesToSettle,
} from '@/db/repositories/commandContext';
import { restoreLotteryWinners } from '@/features/lottery/services/lottery-result-persistence';
import { getMsg } from '@/messages/getMsg';
import { useAppContext } from '@/stores/AppContext';

interface UseApplicantMutationsParams {
  selectedUser: UserBean | null;
  setSelectedUser: Dispatch<SetStateAction<UserBean | null>>;
  setShowImportForm: Dispatch<SetStateAction<boolean>>;
}

/** 応募者の更新を、依存結果の失効・失敗時再同期・処理中状態まで一体で調停する。 */
export function useApplicantMutations({
  setSelectedUser,
  setShowImportForm,
}: UseApplicantMutationsParams) {
  const {
    setApplicants,
    setCurrentWinners,
    resetMatching,
    beginSessionUiMutation,
    getSessionUiMutationGeneration,
    hydrateSessionWorkflow,
    isCurrentSessionUiMutation,
    isLotteryInputReadOnly,
    hasSavedSessionResult,
  } = useAppContext();
  const isSessionReadOnly = isLotteryInputReadOnly || hasSavedSessionResult;

  // 確認対象と、保存・復旧結果を通知するダイアログ状態。
  const [removeTarget, setRemoveTarget] = useState<UserBean | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isPreferenceSaving, setIsPreferenceSaving] = useState(false);
  const [activeMutationCount, setActiveMutationCount] = useState(0);

  // 並行した更新が残っている間は、先に完了した処理からbusyを解除しない。
  const beginApplicantMutation = () => setActiveMutationCount((count) => count + 1);
  const finishApplicantMutation = () => setActiveMutationCount((count) => Math.max(0, count - 1));

  const clearApplicantDependentResults = () => {
    setCurrentWinners([]);
    resetMatching();
  };

  // 別操作が再読込中に始まった場合は、その書込みも含む最終状態を読み直す。
  const reconcilePersistedSessionState = async (
    context: ReturnType<typeof getRequiredSessionContext>,
  ): Promise<boolean> => runAsSessionRecovery(context, async () => {
    while (isCurrentSessionContext(context)) {
      const generation = getSessionUiMutationGeneration();
      await Promise.all([
        flushApplicantWrites(context),
        waitForEventWritesToSettle(context),
      ]);
      if (!isCurrentSessionContext(context)) return false;
      if (!isCurrentSessionUiMutation(generation)) continue;
      const writeActivity = captureSessionWriteActivity(context);
      if (!isSessionWriteActivityUnchanged(context, writeActivity)) continue;
      const [reloadedApplicants, lotteryRows, workflowSnapshot] = await Promise.all([
        loadApplicants(),
        getLotteryResults(),
        getSessionWorkflowSnapshot(),
      ]);
      if (!isCurrentSessionContext(context)) return false;
      if (!isCurrentSessionUiMutation(generation)) continue;
      if (!isSessionWriteActivityUnchanged(context, writeActivity)) continue;
      setApplicants(reloadedApplicants);
      setCurrentWinners(restoreLotteryWinners(lotteryRows, reloadedApplicants));
      setSelectedUser((current) => {
        if (current?.id === undefined) return current;
        return reloadedApplicants.find((user) => user.id === current.id) ?? null;
      });
      hydrateSessionWorkflow(workflowSnapshot);
      resetMatching();
      return true;
    }
    return false;
  });

  // 応募者の削除を先行反映し、保存失敗時は同じセッションの永続状態へ復元する。
  const removeApplicant = async () => {
    if (isSessionReadOnly) {
      setRemoveTarget(null);
      setAlertMessage(getMsg('ApplicantDataPage.savedResultReadOnly'));
      return;
    }
    if (removeTarget === null) return;
    const target = removeTarget;
    if (target.id === undefined) {
      setRemoveTarget(null);
      setAlertMessage(getMsg('ApplicantDataPage.targetUnavailable'));
      return;
    }
    const targetId = target.id;
    let context: ReturnType<typeof getRequiredSessionContext>;
    try {
      context = getRequiredSessionContext();
    } catch {
      setRemoveTarget(null);
      setAlertMessage(getMsg('ApplicantDataPage.sessionUnavailable'));
      return;
    }
    if (isSessionRecoveryActive(context)) {
      setRemoveTarget(null);
      setAlertMessage(getMsg('ApplicantDataPage.recoveryInProgress'));
      return;
    }
    const generation = beginSessionUiMutation();
    setApplicants((current) => current.filter((user) => user.id !== targetId));
    clearApplicantDependentResults();
    setRemoveTarget(null);
    beginApplicantMutation();
    try {
      await deleteApplicant(targetId, context);
      if (!isCurrentSessionContext(context)) return;
      setSelectedUser((current) => current?.id === targetId ? null : current);
    } catch {
      try {
        await reconcilePersistedSessionState(context);
      } catch {
        // 再同期に失敗しても、元の保存失敗を画面へ通知して終了する。
      }
      if (isCurrentSessionContext(context) && isCurrentSessionUiMutation(generation)) {
        setAlertMessage(getMsg('ApplicantDataPage.deleteFailed'));
      }
    } finally {
      finishApplicantMutation();
    }
  };

  // 希望キャストだけを先行反映し、抽選結果を維持したままマッチング結果を失効させる。
  const saveApplicantPreferences = async (updatedUser: UserBean): Promise<boolean> => {
    if (isSessionReadOnly) {
      setAlertMessage(getMsg('ApplicantDataPage.savedResultReadOnly'));
      return false;
    }
    if (
      updatedUser.id === undefined
      || updatedUser.cast_ids === undefined
      || updatedUser.casts.length !== updatedUser.cast_ids.length
    ) {
      setAlertMessage(getMsg('ApplicantDataPage.targetUnavailable'));
      return false;
    }
    let context: ReturnType<typeof getRequiredSessionContext>;
    try {
      context = getRequiredSessionContext();
    } catch {
      setAlertMessage(getMsg('ApplicantDataPage.sessionUnavailable'));
      return false;
    }
    if (isSessionRecoveryActive(context)) {
      setAlertMessage(getMsg('ApplicantDataPage.recoveryInProgress'));
      return false;
    }

    const applicantId = updatedUser.id;
    const generation = beginSessionUiMutation();
    const replaceApplicant = (users: UserBean[]) => users.map(
      (user) => user.id === applicantId ? updatedUser : user,
    );
    beginApplicantMutation();
    setIsPreferenceSaving(true);
    setApplicants(replaceApplicant);
    setCurrentWinners(replaceApplicant);
    setSelectedUser(updatedUser);
    resetMatching();
    try {
      await updateApplicantCastPreferences(applicantId, updatedUser.cast_ids, context);
      return isCurrentSessionContext(context) && isCurrentSessionUiMutation(generation);
    } catch {
      try {
        await reconcilePersistedSessionState(context);
      } catch {
        // 再同期に失敗しても、元の保存失敗を画面へ通知して終了する。
      }
      if (isCurrentSessionContext(context) && isCurrentSessionUiMutation(generation)) {
        setAlertMessage(getMsg('ApplicantDataPage.preferenceSaveFailed'));
      }
      return false;
    } finally {
      setIsPreferenceSaving(false);
      finishApplicantMutation();
    }
  };

  // 応募者全件と依存結果を先行消去し、保存失敗時は永続状態へ復元する。
  const clearApplicants = async () => {
    if (isSessionReadOnly) {
      setShowClearConfirm(false);
      setAlertMessage(getMsg('ApplicantDataPage.savedResultReadOnly'));
      return;
    }
    let context: ReturnType<typeof getRequiredSessionContext>;
    try {
      context = getRequiredSessionContext();
    } catch {
      setShowClearConfirm(false);
      setAlertMessage(getMsg('ApplicantDataPage.sessionUnavailable'));
      return;
    }
    if (isSessionRecoveryActive(context)) {
      setShowClearConfirm(false);
      setAlertMessage(getMsg('ApplicantDataPage.recoveryInProgress'));
      return;
    }
    const generation = beginSessionUiMutation();
    setApplicants([]);
    clearApplicantDependentResults();
    setShowClearConfirm(false);
    setSelectedUser(null);
    setShowImportForm(true);
    beginApplicantMutation();
    try {
      await persistApplicants([], context);
      if (!isCurrentSessionContext(context)) return;
    } catch {
      try {
        await reconcilePersistedSessionState(context);
      } catch {
        // 再同期に失敗しても、元の保存失敗を画面へ通知して終了する。
      }
      if (isCurrentSessionContext(context) && isCurrentSessionUiMutation(generation)) {
        setAlertMessage(getMsg('ApplicantDataPage.deleteAllFailed'));
      }
    } finally {
      finishApplicantMutation();
    }
  };

  // 一覧と確認ダイアログから呼ぶ、対象を型付きで束縛した操作。
  const handleRemoveClick = useCallback((user: UserBean) => {
    if (isSessionReadOnly) {
      setAlertMessage(getMsg('ApplicantDataPage.savedResultReadOnly'));
      return;
    }
    setRemoveTarget(user);
  }, [isSessionReadOnly]);
  const handleOpenClearConfirm = () => {
    if (isSessionReadOnly) {
      setAlertMessage(getMsg('ApplicantDataPage.savedResultReadOnly'));
      return;
    }
    setShowClearConfirm(true);
  };
  const handleConfirmRemove = () => { void removeApplicant(); };
  const handleConfirmClearAll = () => { void clearApplicants(); };
  const handleDismissAlert = () => setAlertMessage(null);
  const handleCancelRemove = () => setRemoveTarget(null);
  const handleCancelClearAll = () => setShowClearConfirm(false);

  return {
    alertMessage,
    removeTarget,
    showClearConfirm,
    isPreferenceSaving,
    isMutatingApplicants: activeMutationCount > 0,
    saveApplicantPreferences,
    handleRemoveClick,
    handleOpenClearConfirm,
    handleConfirmRemove,
    handleConfirmClearAll,
    handleDismissAlert,
    handleCancelRemove,
    handleCancelClearAll,
  };
}
