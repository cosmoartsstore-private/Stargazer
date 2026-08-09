import { useRef, useState } from 'react';
import { attachCastIdsToUsers } from '@/common/castReferences';
import type { UserBean } from '@/common/types/entities';
import { DEFAULT_SESSION_WORKFLOW_STATE } from '@/common/types/sessionWorkflow';
import { findXIdIdentityIssues } from '@/common/xIdUtils';
import {
  captureSessionWriteActivity,
  getRequiredSessionContext,
  isCurrentSessionContext,
  isSessionRecoveryActive,
  isSessionWriteActivityUnchanged,
} from '@/db/repositories/commandContext';
import {
  getSessionWorkflowSnapshot,
  loadApplicants,
  persistApplicants,
} from '@/db';
import { getMsg } from '@/messages/getMsg';
import { useAppContext } from '@/stores/AppContext';
import type { PageType } from '@/layout/appNavigation';

export interface PendingImport {
  users: UserBean[];
  nextPage?: PageType;
}

export interface UseImportCommitOptions {
  onAlert: (message: string) => void;
  requestSessionReload: () => void;
}

export interface ImportCommitState {
  isMutationLoading: boolean;
  pendingImport: PendingImport | null;
  importUsers: (users: UserBean[], nextPage?: PageType) => void;
  importNewUsers: (users: UserBean[], nextPage?: PageType) => void;
  confirmImportOverwrite: () => void;
  cancelImportOverwrite: () => void;
}

/** 取込の上書き確認、セッション保存、世代検証後の画面再同期を管理する。 */
export function useImportCommit({
  onAlert,
  requestSessionReload,
}: UseImportCommitOptions): ImportCommitState {
  const {
    setActivePage,
    casts,
    applicants,
    setApplicants,
    currentWinners,
    setCurrentWinners,
    hydrateSessionWorkflow,
    ensureWritableSession,
    startNewImportSession,
    isLotteryInputReadOnly,
    hasSavedSessionResult,
    resetMatching,
    beginSessionUiMutation,
    isCurrentSessionUiMutation,
  } = useAppContext();
  const [isMutationLoading, setIsMutationLoading] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const importRunningRef = useRef(false);

  // 保存後も同じ接続・UI操作・書込み世代である場合だけ、再読込結果を画面へ反映する。
  const applyImport = async (
    users: UserBean[],
    nextPage: PageType = 'import',
    createNewSession = false,
  ) => {
    // React stateの反映前に連続実行されても、取込処理は一つだけ開始する。
    if (importRunningRef.current) return;
    importRunningRef.current = true;
    let failureMessage: string | undefined;
    try {
      setIsMutationLoading(true);
      failureMessage = getMsg('AppContainer.importFailed');
      const identityIssues = findXIdIdentityIssues(users.map((user, index) => ({
        rowNumber: index + 1,
        xId: user.x_id,
      })));
      const destinationPage = identityIssues.length > 0 ? 'import' : nextPage;
      const usersWithCastIds = attachCastIdsToUsers(users, casts);
      if (createNewSession) {
        await startNewImportSession(usersWithCastIds);
        setCurrentWinners([]);
        resetMatching();
        setActivePage(destinationPage);
        return;
      }
      await ensureWritableSession();
      const context = getRequiredSessionContext();
      if (isSessionRecoveryActive(context)) {
        onAlert(getMsg('AppContainer.saveStatePending'));
        return;
      }
      const mutationGeneration = beginSessionUiMutation();
      await persistApplicants(usersWithCastIds, context);
      if (!isCurrentSessionContext(context)) return;
      if (!isCurrentSessionUiMutation(mutationGeneration)) {
        requestSessionReload();
        return;
      }
      const writeActivity = captureSessionWriteActivity(context);
      if (!isSessionWriteActivityUnchanged(context, writeActivity)) {
        requestSessionReload();
        return;
      }

      let loadedApplicants;
      let workflowSnapshot;
      try {
        [loadedApplicants, workflowSnapshot] = await Promise.all([
          loadApplicants(),
          getSessionWorkflowSnapshot(),
        ]);
      } catch (error) {
        if (
          isCurrentSessionContext(context)
          && isCurrentSessionUiMutation(mutationGeneration)
        ) {
          setApplicants([]);
          setCurrentWinners([]);
          resetMatching();
          hydrateSessionWorkflow({
            state: { ...DEFAULT_SESSION_WORKFLOW_STATE },
            isLotteryResultCurrent: false,
          });
          requestSessionReload();
        }
        failureMessage = getMsg('AppContainer.savedButRefreshFailed');
        throw error;
      }
      if (!isCurrentSessionContext(context)) return;
      if (
        !isCurrentSessionUiMutation(mutationGeneration)
        || !isSessionWriteActivityUnchanged(context, writeActivity)
      ) {
        requestSessionReload();
        return;
      }
      setApplicants(loadedApplicants);
      setCurrentWinners([]);
      hydrateSessionWorkflow({
        ...workflowSnapshot,
        isLotteryResultCurrent: false,
      });
      resetMatching();
      setActivePage(destinationPage);
    } catch {
      onAlert(failureMessage ?? getMsg('AppContainer.importFailed'));
    } finally {
      importRunningRef.current = false;
      setIsMutationLoading(false);
    }
  };

  const importUsers = (users: UserBean[], nextPage?: PageType) => {
    if (isLotteryInputReadOnly || hasSavedSessionResult) {
      onAlert(getMsg('AppContainer.sessionReadOnly'));
      return;
    }
    if (applicants.length > 0 || currentWinners.length > 0) {
      setPendingImport({ users, nextPage });
      return;
    }
    void applyImport(users, nextPage);
  };

  const importNewUsers = (users: UserBean[], nextPage?: PageType) => {
    void applyImport(users, nextPage ?? 'import', true);
  };

  const confirmImportOverwrite = () => {
    if (!pendingImport) return;
    const next = pendingImport;
    setPendingImport(null);
    void applyImport(next.users, next.nextPage);
  };

  const cancelImportOverwrite = () => setPendingImport(null);

  return {
    isMutationLoading,
    pendingImport,
    importUsers,
    importNewUsers,
    confirmImportOverwrite,
    cancelImportOverwrite,
  };
}
