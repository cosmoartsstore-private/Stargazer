// イベントの作成・選択・名称変更・削除と基本情報の編集を管理するページ。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, NoticeDialog } from '@/components/ConfirmModal';
import { getMsg } from '@/messages/getMsg';
import {
  flushPendingPageCommits,
  registerPendingPageCommit,
} from '@/common/pageCommitRegistry';
import { readFileAsDataUrl } from '@/common/fileReading';
import { createSharedBusyTracker } from '@/common/sharedBusyTracker';
import { useAppContext } from '@/stores/AppContext';
import {
  createEvent,
  getEventMeta,
  getEventMetaReadOnly,
  listEvents,
  setEventMeta,
} from '@/db/repositories/eventRepository';
import {
  getOpenEventContext,
  isCurrentEventContext,
  waitForEventWritesToSettle,
  type EventCommandContext,
} from '@/db/repositories/commandContext';
import { EventDetailPanel, type EventMetaLoadStatus } from './components/EventDetailPanel';
import { EventListPanel } from './components/EventListPanel';
import { EVENT_NAME_MAX_LENGTH, getEventNameFormatError } from './eventNameValidation';
import styles from './EventManagementPage.module.css';
import shared from '@/styles/shared.module.css';

// 画面を再生成しても、同じ接続先へ最後に選択した写真だけを保存する。
const eventPhotoMutationTokenByContext = new Map<string, symbol>();
// 再生成前に始まった処理も含め、すべて完了した時点で親画面のbusyを解除する。
const eventManagementBusyTracker = createSharedBusyTracker();

function getEventPhotoMutationKey(context: EventCommandContext): string {
  return `${context.eventName}\u0000${context.generation}`;
}

function getEventNameError(
  name: string,
  events: string[],
  currentName?: string,
): string | null {
  const formatError = getEventNameFormatError(name);
  if (formatError === 'tooLong') return getMsg('EventManagementPage.eventNameTooLong', { maxLength: EVENT_NAME_MAX_LENGTH });
  if (formatError === 'windowsReserved') return getMsg('EventManagementPage.windowsReservedEventName');
  if (formatError === 'invalidCharacters') return getMsg('EventManagementPage.invalidEventName');
  if (
    name !== currentName
    && events.some((eventName) => eventName.toLowerCase() === name.toLowerCase())
  ) {
    return getMsg('EventManagementPage.duplicateEventName');
  }
  return null;
}

export interface EventManagementPageProps {
  onRequestEventBoundaryChange?: (
    kind: 'switch' | 'rename',
    action: () => Promise<boolean>,
  ) => Promise<boolean>;
  onBusyChange?: (busy: boolean) => void;
}

export const EventManagementPage: React.FC<EventManagementPageProps> = ({
  onRequestEventBoundaryChange,
  onBusyChange,
}) => {
  // イベント一覧と、切替・削除・改名のアプリ共通操作を取得する。
  const {
    events,
    setEvents,
    currentEventName,
    switchEvent,
    deleteManagedEvent,
    renameManagedEvent,
  } = useAppContext();

  // 一覧選択、編集値、確認ダイアログの状態を保持する。
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [editName, setEditName] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [metaLoadStatus, setMetaLoadStatus] = useState<EventMetaLoadStatus>('unavailable');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [isNotesSaving, setIsNotesSaving] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // イベント操作の多重実行と、選択切替後に古い処理を反映する競合を防ぐ。
  const selectedNameRef = useRef<string | null>(selectedName);
  const isMountedRef = useRef(true);
  const onBusyChangeRef = useRef(onBusyChange);
  const eventListRequestGenerationRef = useRef(0);
  const createInFlightRef = useRef(false);
  const renameInFlightRef = useRef(false);
  const renameCommitPromiseRef = useRef<Promise<boolean> | null>(null);
  const switchInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
  const isPhotoSavingRef = useRef(false);
  const notesSaveInFlightRef = useRef(false);
  const notesCommitPromiseRef = useRef<Promise<boolean> | null>(null);
  const activePhotoMutationTokensRef = useRef(new Set<symbol>());
  const photoMutationGenerationRef = useRef(0);
  const notesMutationGenerationRef = useRef(0);
  const persistedNotesRef = useRef('');
  const pendingEditorCommitRef = useRef<() => Promise<boolean>>(
    () => Promise.resolve(true),
  );
  selectedNameRef.current = selectedName;
  onBusyChangeRef.current = onBusyChange;

  // 画面破棄時は画面への反映だけを止め、開始済みの写真保存は継続する。
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      eventListRequestGenerationRef.current += 1;
      photoMutationGenerationRef.current += 1;
      notesMutationGenerationRef.current += 1;
    };
  }, []);

  useEffect(
    () => registerPendingPageCommit(() => pendingEditorCommitRef.current()),
    [],
  );

  const beginEventManagementBusy = (busyToken: symbol) => {
    eventManagementBusyTracker.begin(busyToken, onBusyChangeRef.current);
  };

  const finishEventManagementBusy = (busyToken: symbol) => {
    eventManagementBusyTracker.finish(busyToken);
  };

  const beginPhotoSaving = (mutationToken: symbol) => {
    beginEventManagementBusy(mutationToken);
    activePhotoMutationTokensRef.current.add(mutationToken);
    if (!isPhotoSavingRef.current) {
      isPhotoSavingRef.current = true;
      if (isMountedRef.current) setIsPhotoSaving(true);
    }
  };

  const finishPhotoSaving = (mutationToken: symbol) => {
    if (!activePhotoMutationTokensRef.current.delete(mutationToken)) return;
    if (activePhotoMutationTokensRef.current.size === 0) {
      isPhotoSavingRef.current = false;
      if (isMountedRef.current) setIsPhotoSaving(false);
    }
    finishEventManagementBusy(mutationToken);
  };

  // 未保存作業の確認が不要な利用元では、イベント境界の操作を直ちに開始する。
  const requestEventBoundaryChange = (
    kind: 'switch' | 'rename',
    action: () => Promise<boolean>,
  ): Promise<boolean> => {
    if (onRequestEventBoundaryChange) {
      return onRequestEventBoundaryChange(kind, action);
    }
    return action();
  };

  // 一覧取得の完了順が前後しても、最後に開始した要求だけを画面へ反映する。
  const requestEventList = useCallback(async (
    applySelection?: (eventNames: string[]) => void,
  ): Promise<boolean> => {
    const requestGeneration = eventListRequestGenerationRef.current + 1;
    eventListRequestGenerationRef.current = requestGeneration;
    try {
      const eventNames = await listEvents();
      if (
        !isMountedRef.current
        || eventListRequestGenerationRef.current !== requestGeneration
      ) return false;
      setEvents(eventNames);
      applySelection?.(eventNames);
      setIsLoading(false);
      return true;
    } catch (error) {
      if (
        !isMountedRef.current
        || eventListRequestGenerationRef.current !== requestGeneration
      ) return false;
      setIsLoading(false);
      throw error;
    }
  }, [setEvents]);

  // イベント一覧を再取得し、選択対象を現行一覧へ整合させる。
  const refreshList = useCallback(async () => {
    setIsLoading(true);
    try {
      await requestEventList((eventNames) => {
        setSelectedName((previous) => {
          if (previous !== null && eventNames.includes(previous)) return previous;
          if (currentEventName && eventNames.includes(currentEventName)) return currentEventName;
          return eventNames[0] ?? null;
        });
      });
    } catch {
      setAlertMessage(getMsg('EventManagementPage.loadFailed'));
    }
  }, [currentEventName, requestEventList]);

  useEffect(() => {
    void refreshList();
  // 初回表示時だけ一覧を再取得し、その後は各操作の結果で更新する。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 使用中イベントは現在の接続から、その他の選択イベントは読み取り専用接続から表示情報を取得する。
  useEffect(() => {
    photoMutationGenerationRef.current += 1;
    notesMutationGenerationRef.current += 1;
    setEditName(selectedName ?? '');
    setEditingNotes(false);
    setPhotoDataUrl(null);
    setEditNotes('');
    setMetaLoadStatus('unavailable');
    persistedNotesRef.current = '';
    if (selectedName === null) return;
    const eventName = selectedName;
    const context = eventName === currentEventName ? getOpenEventContext(currentEventName) : null;
    if (eventName === currentEventName && context === null) {
      setMetaLoadStatus('failed');
      setAlertMessage(getMsg('EventManagementPage.metaLoadFailed'));
      return;
    }
    setMetaLoadStatus('loading');

    let isCurrentRequest = true;
    const photoGeneration = photoMutationGenerationRef.current;
    const notesGeneration = notesMutationGenerationRef.current;
    void (async () => {
      try {
        if (context !== null) await waitForEventWritesToSettle(context);
        if (
          !isCurrentRequest
          || selectedNameRef.current !== eventName
          || (context !== null && !isCurrentEventContext(context))
        ) return;
        const eventMeta = context !== null
          ? await getEventMeta()
          : await getEventMetaReadOnly(eventName);
        if (
          !isCurrentRequest
          || selectedNameRef.current !== eventName
          || (context !== null && !isCurrentEventContext(context))
        ) return;
        if (photoMutationGenerationRef.current === photoGeneration) {
          setPhotoDataUrl(eventMeta.photo_data_url);
        }
        if (notesMutationGenerationRef.current === notesGeneration) {
          const notes = eventMeta.notes ?? '';
          persistedNotesRef.current = notes;
          setEditNotes(notes);
        }
        setMetaLoadStatus('ready');
      } catch {
        if (
          !isCurrentRequest
          || selectedNameRef.current !== eventName
          || (context !== null && !isCurrentEventContext(context))
        ) return;
        if (photoMutationGenerationRef.current === photoGeneration) {
          setPhotoDataUrl(null);
        }
        if (notesMutationGenerationRef.current === notesGeneration) {
          setEditNotes('');
        }
        setMetaLoadStatus('failed');
        setAlertMessage(getMsg('EventManagementPage.metaLoadFailed'));
      }
    })();
    return () => {
      isCurrentRequest = false;
    };
  }, [currentEventName, selectedName]);

  // イベントの作成・名称変更を検証してから永続化する。
  const handleAdd = async () => {
    if (!await flushPendingPageCommits()) return;
    if (
      isLoading
      || isPhotoSavingRef.current
      || notesSaveInFlightRef.current
      || createInFlightRef.current
      || renameInFlightRef.current
      || switchInFlightRef.current
      || deleteInFlightRef.current
    ) return;
    const name = addName.trim();
    if (!name) return;
    const validationError = getEventNameError(name, events);
    if (validationError) {
      setAlertMessage(validationError);
      return;
    }

    const busyToken = Symbol();
    createInFlightRef.current = true;
    beginEventManagementBusy(busyToken);
    setIsCreating(true);
    try {
      try {
        await createEvent(name);
      } catch {
        setAlertMessage(getMsg('EventManagementPage.createFailed'));
        return;
      }

      setAddName('');
      setSelectedName(name);
      try {
        const didApply = await requestEventList();
        if (!didApply) return;
      } catch {
        setAlertMessage(getMsg('EventManagementPage.createdButRefreshFailed'));
        return;
      }

      if (currentEventName === null) {
        void requestEventBoundaryChange('switch', async () => {
          if (
            isPhotoSavingRef.current
            || notesSaveInFlightRef.current
            || renameInFlightRef.current
            || switchInFlightRef.current
            || deleteInFlightRef.current
          ) return false;
          const switchBusyToken = Symbol();
          switchInFlightRef.current = true;
          beginEventManagementBusy(switchBusyToken);
          if (isMountedRef.current) setIsSwitching(true);
          try {
            await switchEvent(name);
            return true;
          } catch {
            if (isMountedRef.current) {
              setAlertMessage(getMsg('EventManagementPage.createdButOpenFailed'));
            }
            return false;
          } finally {
            switchInFlightRef.current = false;
            if (isMountedRef.current) setIsSwitching(false);
            finishEventManagementBusy(switchBusyToken);
          }
        });
      }
    } finally {
      createInFlightRef.current = false;
      if (isMountedRef.current) setIsCreating(false);
      finishEventManagementBusy(busyToken);
    }
  };

  const commitEventName = (): Promise<boolean> => {
    if (renameCommitPromiseRef.current) return renameCommitPromiseRef.current;
    if (!selectedName) return Promise.resolve(true);
    const name = editName.trim();
    if (name === selectedName) {
      if (editName !== selectedName) setEditName(selectedName);
      return Promise.resolve(true);
    }
    if (
      isPhotoSavingRef.current
      || notesSaveInFlightRef.current
      || renameInFlightRef.current
      || switchInFlightRef.current
      || deleteInFlightRef.current
    ) return Promise.resolve(false);
    const validationError = getEventNameError(name, events, selectedName);
    if (validationError) {
      setEditName(selectedName);
      setAlertMessage(validationError);
      return Promise.resolve(false);
    }

    const previousName = selectedName;
    const renameEvent = async (): Promise<boolean> => {
      if (
        isPhotoSavingRef.current
        || notesSaveInFlightRef.current
        || renameInFlightRef.current
        || selectedNameRef.current !== previousName
      ) return false;

      const busyToken = Symbol();
      renameInFlightRef.current = true;
      beginEventManagementBusy(busyToken);
      if (isMountedRef.current) setIsRenaming(true);
      try {
        try {
          await renameManagedEvent(previousName, name);
        } catch {
          if (selectedNameRef.current === previousName) {
            setEditName(previousName);
          }
          setAlertMessage(getMsg('EventManagementPage.renameFailed'));
          return false;
        }

        if (selectedNameRef.current === previousName) {
          selectedNameRef.current = name;
          setSelectedName((currentSelection) => (
            currentSelection === previousName ? name : currentSelection
          ));
        }
        try {
          await requestEventList();
        } catch {
          setAlertMessage(getMsg('EventManagementPage.renamedButRefreshFailed'));
        }
        return true;
      } finally {
        renameInFlightRef.current = false;
        if (isMountedRef.current) setIsRenaming(false);
        finishEventManagementBusy(busyToken);
      }
    };

    const commitPromise = (
      previousName === currentEventName
        ? requestEventBoundaryChange('rename', renameEvent)
        : renameEvent()
    ).finally(() => {
      renameCommitPromiseRef.current = null;
    });
    renameCommitPromiseRef.current = commitPromise;
    return commitPromise;
  };
  const handleNameBlur = () => { void commitEventName(); };

  // 画像とメモは、選択イベントが変わっていない場合だけ保存結果を反映する。
  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (
      !file
      || !isMetaEditable
      || isPhotoSavingRef.current
      || notesSaveInFlightRef.current
      || createInFlightRef.current
      || renameInFlightRef.current
      || switchInFlightRef.current
      || deleteInFlightRef.current
    ) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    const viewGeneration = photoMutationGenerationRef.current + 1;
    photoMutationGenerationRef.current = viewGeneration;
    const mutationKey = getEventPhotoMutationKey(context);
    const mutationToken = Symbol();
    eventPhotoMutationTokenByContext.set(mutationKey, mutationToken);

    beginPhotoSaving(mutationToken);
    void (async () => {
      try {
        let dataUrl: string;
        try {
          dataUrl = await readFileAsDataUrl(file);
        } catch {
          if (
            isMountedRef.current
            && eventPhotoMutationTokenByContext.get(mutationKey) === mutationToken
            && isCurrentEventContext(context)
            && photoMutationGenerationRef.current === viewGeneration
            && selectedNameRef.current === context.eventName
          ) {
            setAlertMessage(getMsg('common.imageReadFailed'));
          }
          return;
        }
        if (
          eventPhotoMutationTokenByContext.get(mutationKey) !== mutationToken
          || !isCurrentEventContext(context)
        ) return;
        try {
          await setEventMeta({ photo_data_url: dataUrl });
          if (
            isMountedRef.current
            && eventPhotoMutationTokenByContext.get(mutationKey) === mutationToken
            && isCurrentEventContext(context)
            && photoMutationGenerationRef.current === viewGeneration
            && selectedNameRef.current === context.eventName
          ) {
            setPhotoDataUrl(dataUrl);
          }
        } catch {
          if (
            !isMountedRef.current
            || eventPhotoMutationTokenByContext.get(mutationKey) !== mutationToken
            || !isCurrentEventContext(context)
            || photoMutationGenerationRef.current !== viewGeneration
            || selectedNameRef.current !== context.eventName
          ) return;
          setAlertMessage(getMsg('EventManagementPage.photoSaveFailed'));
        }
      } finally {
        if (eventPhotoMutationTokenByContext.get(mutationKey) === mutationToken) {
          eventPhotoMutationTokenByContext.delete(mutationKey);
        }
        finishPhotoSaving(mutationToken);
      }
    })();
    event.target.value = '';
  };

  const commitEventNotes = (): Promise<boolean> => {
    if (notesCommitPromiseRef.current) return notesCommitPromiseRef.current;
    setEditingNotes(false);
    if (editNotes === persistedNotesRef.current) return Promise.resolve(true);
    if (!isMetaEditable || notesSaveInFlightRef.current) return Promise.resolve(false);
    const context = getOpenEventContext(currentEventName);
    if (context === null) return Promise.resolve(false);
    const mutationGeneration = notesMutationGenerationRef.current + 1;
    notesMutationGenerationRef.current = mutationGeneration;
    const busyToken = Symbol();
    notesSaveInFlightRef.current = true;
    if (isMountedRef.current) setIsNotesSaving(true);
    beginEventManagementBusy(busyToken);
    const commitPromise = (async (): Promise<boolean> => {
      try {
        try {
          await setEventMeta({ notes: editNotes || null });
          if (
            !isCurrentEventContext(context)
            || notesMutationGenerationRef.current !== mutationGeneration
            || selectedNameRef.current !== context.eventName
          ) return false;
          persistedNotesRef.current = editNotes;
          return true;
        } catch {
          if (
            !isCurrentEventContext(context)
            || notesMutationGenerationRef.current !== mutationGeneration
            || selectedNameRef.current !== context.eventName
          ) return false;
          try {
            await waitForEventWritesToSettle(context);
            if (
              !isCurrentEventContext(context)
              || notesMutationGenerationRef.current !== mutationGeneration
              || selectedNameRef.current !== context.eventName
            ) return false;
            const eventMeta = await getEventMeta();
            if (
              !isCurrentEventContext(context)
              || notesMutationGenerationRef.current !== mutationGeneration
              || selectedNameRef.current !== context.eventName
            ) return false;
            const persistedNotes = eventMeta.notes ?? '';
            persistedNotesRef.current = persistedNotes;
            setEditNotes(persistedNotes);
            setAlertMessage(getMsg('EventManagementPage.notesRollback'));
          } catch {
            if (
              isCurrentEventContext(context)
              && notesMutationGenerationRef.current === mutationGeneration
              && selectedNameRef.current === context.eventName
            ) {
              setEditNotes(persistedNotesRef.current);
              setMetaLoadStatus('failed');
              setAlertMessage(getMsg('EventManagementPage.notesSaveFailed'));
            }
          }
          return false;
        }
      } finally {
        notesSaveInFlightRef.current = false;
        if (isMountedRef.current) setIsNotesSaving(false);
        finishEventManagementBusy(busyToken);
      }
    })().finally(() => {
      notesCommitPromiseRef.current = null;
    });
    notesCommitPromiseRef.current = commitPromise;
    return commitPromise;
  };
  const handleNotesBlur = () => { void commitEventNotes(); };

  // イベント切替と削除はAppContextのライフサイクル処理へ委譲する。
  const handleSwitch = async () => {
    if (!await flushPendingPageCommits()) return;
    if (
      isPhotoSavingRef.current
      || notesSaveInFlightRef.current
      || renameInFlightRef.current
      || switchInFlightRef.current
      || deleteInFlightRef.current
      || !switchTarget
    ) return;
    const target = switchTarget;
    setSwitchTarget(null);
    void requestEventBoundaryChange('switch', async () => {
      if (
        isPhotoSavingRef.current
        || notesSaveInFlightRef.current
        || renameInFlightRef.current
        || switchInFlightRef.current
        || deleteInFlightRef.current
      ) return false;
      const busyToken = Symbol();
      switchInFlightRef.current = true;
      beginEventManagementBusy(busyToken);
      if (isMountedRef.current) setIsSwitching(true);
      try {
        await switchEvent(target);
        return true;
      } catch {
        if (isMountedRef.current) {
          setAlertMessage(getMsg('EventManagementPage.switchFailed'));
        }
        return false;
      } finally {
        switchInFlightRef.current = false;
        if (isMountedRef.current) setIsSwitching(false);
        finishEventManagementBusy(busyToken);
      }
    });
  };

  const handleDelete = async () => {
    if (!await flushPendingPageCommits()) return;
    if (
      isPhotoSavingRef.current
      || notesSaveInFlightRef.current
      || renameInFlightRef.current
      || switchInFlightRef.current
      || deleteInFlightRef.current
      || !deleteTarget
    ) return;
    const target = deleteTarget;
    const busyToken = Symbol();
    deleteInFlightRef.current = true;
    beginEventManagementBusy(busyToken);
    if (isMountedRef.current) setIsDeleting(true);
    try {
      try {
        await deleteManagedEvent(target);
      } catch {
        try {
          await requestEventList((eventNames) => {
            setSelectedName((previous) => (
              previous !== null && eventNames.includes(previous)
                ? previous
                : (eventNames[0] ?? null)
            ));
          });
        } catch {
          // 一覧を再取得できない場合は、現在の表示を維持する。
        }
        setAlertMessage(getMsg('EventManagementPage.deleteFailed'));
        return;
      }

      try {
        await requestEventList((eventNames) => {
          setSelectedName((previous) => (
            previous !== null && eventNames.includes(previous)
              ? previous
              : (eventNames[0] ?? null)
          ));
        });
      } catch {
        setAlertMessage(getMsg('EventManagementPage.deletedButRefreshFailed'));
      }
    } finally {
      deleteInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsDeleting(false);
        setDeleteTarget(null);
      }
      finishEventManagementBusy(busyToken);
    }
  };

  // 選択イベントとDB接続中イベントが一致する場合だけ共有メタ情報を編集する。
  const isCurrent = selectedName !== null && selectedName === currentEventName;
  const isMetaEditable = isCurrent && metaLoadStatus === 'ready';
  const isMutating = isCreating
    || isRenaming
    || isSwitching
    || isDeleting
    || isPhotoSaving
    || isNotesSaving;

  // 表示コンポーネントから受け取った対象を、Page内の状態とI/Oへ接続する。
  const handleSelectEvent = (eventName: string) => {
    const selectionAtRequest = selectedNameRef.current;
    void (async () => {
      if (!await flushPendingPageCommits()) return;
      if (
        isPhotoSavingRef.current
        || notesSaveInFlightRef.current
        || createInFlightRef.current
        || renameInFlightRef.current
        || switchInFlightRef.current
        || deleteInFlightRef.current
      ) return;
      setSelectedName(
        eventName === selectionAtRequest
          ? (selectedNameRef.current ?? eventName)
          : eventName,
      );
    })();
  };
  const handleStartNotesEditing = () => {
    if (!isMetaEditable || notesSaveInFlightRef.current) return;
    notesMutationGenerationRef.current += 1;
    setEditingNotes(true);
  };
  const handleDismissAlert = () => setAlertMessage(null);
  const handleCancelSwitch = () => {
    if (!switchInFlightRef.current) setSwitchTarget(null);
  };
  const handleCancelDelete = () => {
    if (!deleteInFlightRef.current) setDeleteTarget(null);
  };
  const handleAddNameChange = (value: string) => setAddName(value);
  const handleEditNameChange = (value: string) => setEditName(value);
  const handleEditNotesChange = (value: string) => setEditNotes(value);
  const handleOpenSwitchConfirm = (eventName: string) => {
    void (async () => {
      if (!await flushPendingPageCommits()) return;
      if (
        isPhotoSavingRef.current
        || notesSaveInFlightRef.current
        || createInFlightRef.current
        || renameInFlightRef.current
        || switchInFlightRef.current
        || deleteInFlightRef.current
      ) return;
      setSwitchTarget(selectedNameRef.current ?? eventName);
    })();
  };
  const handleOpenDeleteConfirm = (eventName: string) => {
    void (async () => {
      if (!await flushPendingPageCommits()) return;
      if (
        isPhotoSavingRef.current
        || notesSaveInFlightRef.current
        || createInFlightRef.current
        || renameInFlightRef.current
        || switchInFlightRef.current
        || deleteInFlightRef.current
      ) return;
      setDeleteTarget(selectedNameRef.current ?? eventName);
    })();
  };

  pendingEditorCommitRef.current = async () => {
    if (!await commitEventNotes()) return false;
    return commitEventName();
  };

  return (
    <div className={shared.pageWrapper} aria-busy={isMutating || undefined}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('EventManagementPage.pageTitle')}</h1>
        <p className={shared.pageHeaderSubtitle}>{currentEventName === null ? getMsg('EventManagementPage.noOpenEventSubtitle') : getMsg('EventManagementPage.openEventSubtitle')}</p>
      </header>

      {alertMessage && (
        <NoticeDialog
          title={getMsg('EventManagementPage.pageTitle')}
          message={alertMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleDismissAlert}
        />
      )}
      {switchTarget && (
        <ConfirmDialog
          title={getMsg('EventManagementPage.switchDialogTitle')}
          message={getMsg('EventManagementPage.switchDialogMessage', { eventName: switchTarget })}
          confirmLabel={getMsg('EventManagementPage.switchConfirm')}
          cancelLabel={getMsg('common.cancel')}
          confirmDisabled={isMutating}
          onConfirm={handleSwitch}
          onCancel={handleCancelSwitch}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title={getMsg('EventManagementPage.deleteDialogTitle')}
          message={getMsg('EventManagementPage.deleteDialogMessage', { eventName: deleteTarget })}
          confirmLabel={getMsg('EventManagementPage.deleteConfirm')}
          cancelLabel={getMsg('common.cancel')}
          confirmDisabled={isMutating}
          intent="danger"
          onConfirm={handleDelete}
          onCancel={handleCancelDelete}
        />
      )}

      <div className={`${shared.managementDetailLayout} ${styles.eventDetailLayout}`}>
        <EventListPanel
          events={events}
          selectedName={selectedName}
          currentEventName={currentEventName}
          isLoading={isLoading}
          isMutating={isMutating}
          addName={addName}
          onSelect={handleSelectEvent}
          onAddNameChange={handleAddNameChange}
          onCreate={handleAdd}
        />

        <EventDetailPanel
          selectedName={selectedName}
          editName={editName}
          photoDataUrl={photoDataUrl}
          editNotes={editNotes}
          editingNotes={editingNotes}
          isCurrent={isCurrent}
          isMutating={isMutating}
          metaLoadStatus={metaLoadStatus}
          onEditNameChange={handleEditNameChange}
          onCommitName={handleNameBlur}
          onPhotoChange={handlePhotoChange}
          onStartNotesEditing={handleStartNotesEditing}
          onEditNotesChange={handleEditNotesChange}
          onCommitNotes={handleNotesBlur}
          onRequestSwitch={handleOpenSwitchConfirm}
          onRequestDelete={handleOpenDeleteConfirm}
        />
      </div>
    </div>
  );
};
