import { useCallback, useEffect, useRef, useState } from 'react';
import { registerPendingPageLeaveGuard } from '@/common/pageCommitRegistry';

interface PendingUnsavedNotesDecision {
  promise: Promise<boolean>;
  resolve: (allowNavigation: boolean) => void;
}

/** 未保存の理由・メモがある間、画面離脱を利用者の判断まで保留する。 */
export function useUnsavedNotesGuard() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discardGeneration, setDiscardGeneration] = useState(0);
  const dirtyEditorIdsRef = useRef(new Set<string>());
  const pendingDecisionRef = useRef<PendingUnsavedNotesDecision | null>(null);

  const handleDirtyChange = useCallback((editorId: string, dirty: boolean) => {
    if (dirty) dirtyEditorIdsRef.current.add(editorId);
    else dirtyEditorIdsRef.current.delete(editorId);
  }, []);

  const confirmLeaving = useCallback((): Promise<boolean> => {
    if (dirtyEditorIdsRef.current.size === 0) return Promise.resolve(true);
    const pendingDecision = pendingDecisionRef.current;
    if (pendingDecision !== null) return pendingDecision.promise;

    let resolveDecision: (allowNavigation: boolean) => void = () => {};
    const promise = new Promise<boolean>((resolve) => {
      resolveDecision = resolve;
    });
    pendingDecisionRef.current = { promise, resolve: resolveDecision };
    setDialogOpen(true);
    return promise;
  }, []);

  useEffect(() => {
    const unregister = registerPendingPageLeaveGuard(confirmLeaving);
    return () => {
      unregister();
      const pendingDecision = pendingDecisionRef.current;
      pendingDecisionRef.current = null;
      pendingDecision?.resolve(false);
    };
  }, [confirmLeaving]);

  const resolveDecision = (allowNavigation: boolean): void => {
    const pendingDecision = pendingDecisionRef.current;
    if (pendingDecision === null) return;
    pendingDecisionRef.current = null;
    setDialogOpen(false);
    if (allowNavigation) {
      dirtyEditorIdsRef.current.clear();
      setDiscardGeneration((current) => current + 1);
    }
    pendingDecision.resolve(allowNavigation);
  };

  const discard = (): void => resolveDecision(true);
  const keepEditing = (): void => resolveDecision(false);

  return {
    dialogOpen,
    discardGeneration,
    handleDirtyChange,
    discard,
    keepEditing,
  };
}
