// イベントの作成・選択・名称変更・削除と基本情報の編集を管理するページ。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, NoticeDialog } from '@/components/ConfirmModal';
import { getMsg } from '@/messages/getMsg';
import { useAppContext } from '@/stores/AppContext';
import {
  createEvent,
  getEventMeta,
  listEvents,
  setEventMeta,
} from '@/db/repositories/eventRepository';
import {
  getOpenEventContext,
  isCurrentEventContext,
  waitForEventWritesToSettle,
} from '@/db/repositories/commandContext';
import { EventDetailPanel, type EventMetaLoadStatus } from './components/EventDetailPanel';
import { EventListPanel } from './components/EventListPanel';
import styles from './EventManagementPage.module.css';
import shared from '@/styles/shared.module.css';

// イベント名はDBファイル名として安全な英数字・ハイフン・アンダースコアに限定する。
const EVENT_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

function getEventNameError(
  name: string,
  events: string[],
  currentName?: string,
): string | null {
  if (!EVENT_NAME_PATTERN.test(name)) {
    return getMsg('EventManagementPage.invalidEventName');
  }
  if (name !== currentName && events.includes(name)) {
    return getMsg('EventManagementPage.duplicateEventName');
  }
  return null;
}

export const EventManagementPage: React.FC = () => {
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
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // 選択切替後に古い画像・メモ処理を反映しないため、対象と世代を追跡する。
  const selectedNameRef = useRef<string | null>(selectedName);
  const photoMutationGenerationRef = useRef(0);
  const notesMutationGenerationRef = useRef(0);
  const persistedNotesRef = useRef('');
  selectedNameRef.current = selectedName;

  // 画面破棄時に継続中の画像・メモ処理を無効化する。
  useEffect(() => () => {
    photoMutationGenerationRef.current += 1;
    notesMutationGenerationRef.current += 1;
  }, []);

  // イベント一覧を再取得し、選択対象を現行一覧へ整合させる。
  const refreshList = useCallback(async () => {
    setIsLoading(true);
    try {
      const eventNames = await listEvents();
      setEvents(eventNames);
      setSelectedName((previous) => {
        if (previous !== null && eventNames.includes(previous)) return previous;
        if (currentEventName && eventNames.includes(currentEventName)) return currentEventName;
        return eventNames[0] ?? null;
      });
    } catch {
      setAlertMessage(getMsg('EventManagementPage.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [currentEventName, setEvents]);

  useEffect(() => {
    void refreshList();
  // 初回表示時だけ一覧を再取得し、その後は各操作の結果で更新する。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 選択中かつ開いているイベントだけ、画像とメモを永続状態から読み込む。
  useEffect(() => {
    photoMutationGenerationRef.current += 1;
    notesMutationGenerationRef.current += 1;
    setEditName(selectedName ?? '');
    setEditingNotes(false);
    setPhotoDataUrl(null);
    setEditNotes('');
    setMetaLoadStatus('unavailable');
    persistedNotesRef.current = '';
    if (selectedName === null || selectedName !== currentEventName) {
      return;
    }
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
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
        await waitForEventWritesToSettle(context);
        if (!isCurrentRequest || !isCurrentEventContext(context)) return;
        const eventMeta = await getEventMeta();
        if (!isCurrentRequest || !isCurrentEventContext(context)) return;
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
        if (!isCurrentRequest || !isCurrentEventContext(context)) return;
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
    const name = addName.trim();
    if (!name) return;
    const validationError = getEventNameError(name, events);
    if (validationError) {
      setAlertMessage(validationError);
      return;
    }

    try {
      await createEvent(name);
    } catch {
      setAlertMessage(getMsg('EventManagementPage.createFailed'));
      return;
    }

    setAddName('');
    setSelectedName(name);
    try {
      const eventNames = await listEvents();
      setEvents(eventNames);
    } catch {
      setAlertMessage(getMsg('EventManagementPage.createdButRefreshFailed'));
      return;
    }

    if (currentEventName === null) {
      try {
        await switchEvent(name);
      } catch {
        setAlertMessage(getMsg('EventManagementPage.createdButOpenFailed'));
      }
    }
  };

  const handleNameBlur = async () => {
    const name = editName.trim();
    if (!name || !selectedName || name === selectedName) return;
    const validationError = getEventNameError(name, events, selectedName);
    if (validationError) {
      setEditName(selectedName);
      setAlertMessage(validationError);
      return;
    }

    const previousName = selectedName;
    try {
      await renameManagedEvent(previousName, name);
    } catch {
      setEditName(previousName);
      setAlertMessage(getMsg('EventManagementPage.renameFailed'));
      return;
    }

    setSelectedName(name);
    setEditName(name);
    try {
      const eventNames = await listEvents();
      setEvents(eventNames);
    } catch {
      setAlertMessage(getMsg('EventManagementPage.renamedButRefreshFailed'));
    }
  };

  // 画像とメモは、選択イベントが変わっていない場合だけ保存結果を反映する。
  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !isMetaEditable) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    const mutationGeneration = photoMutationGenerationRef.current + 1;
    photoMutationGenerationRef.current = mutationGeneration;

    const reader = new FileReader();
    reader.onload = () => {
      if (
        photoMutationGenerationRef.current !== mutationGeneration
        || !isCurrentEventContext(context)
      ) return;
      const dataUrl = reader.result as string;
      void setEventMeta({ photo_data_url: dataUrl })
        .then(() => {
          if (
            isCurrentEventContext(context)
            && selectedNameRef.current === context.eventName
          ) {
            setPhotoDataUrl(dataUrl);
          }
        })
        .catch(() => {
          if (
            photoMutationGenerationRef.current !== mutationGeneration
            || !isCurrentEventContext(context)
          ) return;
          setAlertMessage(getMsg('EventManagementPage.photoSaveFailed'));
        });
    };
    reader.onerror = () => {
      if (
        photoMutationGenerationRef.current !== mutationGeneration
        || !isCurrentEventContext(context)
      ) return;
      setAlertMessage(getMsg('common.imageReadFailed'));
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleNotesBlur = async () => {
    setEditingNotes(false);
    if (!isMetaEditable) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    const mutationGeneration = notesMutationGenerationRef.current + 1;
    notesMutationGenerationRef.current = mutationGeneration;
    try {
      await setEventMeta({ notes: editNotes || null });
      if (
        !isCurrentEventContext(context)
        || notesMutationGenerationRef.current !== mutationGeneration
        || selectedNameRef.current !== context.eventName
      ) return;
      persistedNotesRef.current = editNotes;
    } catch {
      if (
        !isCurrentEventContext(context)
        || notesMutationGenerationRef.current !== mutationGeneration
        || selectedNameRef.current !== context.eventName
      ) return;
      try {
        await waitForEventWritesToSettle(context);
        if (
          !isCurrentEventContext(context)
          || notesMutationGenerationRef.current !== mutationGeneration
          || selectedNameRef.current !== context.eventName
        ) return;
        const eventMeta = await getEventMeta();
        if (
          !isCurrentEventContext(context)
          || notesMutationGenerationRef.current !== mutationGeneration
          || selectedNameRef.current !== context.eventName
        ) return;
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
    }
  };

  // イベント切替と削除はAppContextのライフサイクル処理へ委譲する。
  const handleSwitch = async () => {
    if (!switchTarget) return;
    try {
      await switchEvent(switchTarget);
    } catch {
      setAlertMessage(getMsg('EventManagementPage.switchFailed'));
    } finally {
      setSwitchTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      try {
        await deleteManagedEvent(target);
      } catch {
        try {
          const eventNames = await listEvents();
          setEvents(eventNames);
          setSelectedName((previous) => (
            previous !== null && eventNames.includes(previous)
              ? previous
              : (eventNames[0] ?? null)
          ));
        } catch {
          // 一覧を再取得できない場合は、現在の表示を維持する。
        }
        setAlertMessage(getMsg('EventManagementPage.deleteFailed'));
        return;
      }

      try {
        const eventNames = await listEvents();
        setEvents(eventNames);
        setSelectedName((previous) => (
          previous !== null && eventNames.includes(previous)
            ? previous
            : (eventNames[0] ?? null)
        ));
      } catch {
        setAlertMessage(getMsg('EventManagementPage.deletedButRefreshFailed'));
      }
    } finally {
      setDeleteTarget(null);
    }
  };

  // 選択イベントとDB接続中イベントが一致する場合だけ共有メタ情報を編集する。
  const isCurrent = selectedName !== null && selectedName === currentEventName;
  const isMetaEditable = isCurrent && metaLoadStatus === 'ready';

  // 表示コンポーネントから受け取った対象を、Page内の状態とI/Oへ接続する。
  const handleSelectEvent = (eventName: string) => setSelectedName(eventName);
  const handleStartNotesEditing = () => {
    if (!isMetaEditable) return;
    notesMutationGenerationRef.current += 1;
    setEditingNotes(true);
  };
  const handleDismissAlert = () => setAlertMessage(null);
  const handleCancelSwitch = () => setSwitchTarget(null);
  const handleCancelDelete = () => setDeleteTarget(null);
  const handleAddNameChange = (value: string) => setAddName(value);
  const handleEditNameChange = (value: string) => setEditName(value);
  const handleEditNotesChange = (value: string) => setEditNotes(value);
  const handleOpenSwitchConfirm = (eventName: string) => setSwitchTarget(eventName);
  const handleOpenDeleteConfirm = (eventName: string) => setDeleteTarget(eventName);

  return (
    <div className={shared.pageWrapper}>
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
