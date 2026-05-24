import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Database, Plus, Camera, FileText, Search, RefreshCw } from '@/common/icons';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useAppContext } from '@/stores/AppContext';
import {
  listEvents,
  createEvent,
  deleteEvent,
  renameEvent,
  getEventMeta,
  setEventMeta,
  type EventMeta,
} from '@/db/repositories/eventRepository';
import { clearLastUsedEvent } from '@/db/initializer';
import styles from './EventManagementPage.module.css';
import shared from '@/styles/shared.module.css';

export const EventManagementPage: React.FC = () => {
  const {
    events,
    setEvents,
    currentEventName,
    switchEvent,
    setCurrentEventName,
  } = useAppContext();

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addName, setAddName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [meta, setMeta] = useState<EventMeta | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);

  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const filteredEvents = events.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );

  const refreshList = useCallback(async () => {
    setIsLoading(true);
    try {
      const evList = await listEvents();
      setEvents(evList);
      setSelectedName((prev) => {
        if (prev !== null && evList.includes(prev)) return prev;
        if (currentEventName && evList.includes(currentEventName)) return currentEventName;
        return evList[0] ?? null;
      });
    } catch (e) {
      console.error(e);
      setAlertMessage('イベントの取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }, [setEvents, currentEventName]);

  useEffect(() => {
    void refreshList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedName === null) {
      setMeta(null);
      setEditName('');
      setEditNotes('');
      setEditingNotes(false);
      return;
    }
    setEditName(selectedName);
    setEditingNotes(false);
    if (selectedName === currentEventName) {
      getEventMeta()
        .then((m) => {
          setMeta(m);
          setEditNotes(m.notes ?? '');
        })
        .catch(() => {
          setMeta(null);
          setEditNotes('');
        });
    } else {
      setMeta(null);
      setEditNotes('');
    }
  }, [selectedName, currentEventName]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setAlertMessage('イベント名は半角英数字、ハイフン、アンダースコアのみ使用可能です。');
      return;
    }
    if (events.includes(name)) {
      setAlertMessage('すでに同じ名前のイベントが存在します。');
      return;
    }
    try {
      await createEvent(name);
      setAddName('');
      const evList = await listEvents();
      setEvents(evList);
      setSelectedName(name);
      if (currentEventName === null) {
        await switchEvent(name);
      }
    } catch (err) {
      setAlertMessage(`作成に失敗しました: ${err}`);
    }
  };

  const handleNameBlur = async () => {
    const name = editName.trim();
    if (!name || name === selectedName) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setEditName(selectedName ?? '');
      setAlertMessage('イベント名は半角英数字、ハイフン、アンダースコアのみ使用可能です。');
      return;
    }
    if (events.includes(name)) {
      setEditName(selectedName ?? '');
      setAlertMessage('すでに同じ名前のイベントが存在します。');
      return;
    }
    if (!selectedName) return;
    try {
      const wasCurrent = selectedName === currentEventName;
      await renameEvent(selectedName, name);
      const evList = await listEvents();
      setEvents(evList);
      setSelectedName(name);
      if (wasCurrent) {
        await switchEvent(name);
      }
    } catch (err) {
      setEditName(selectedName);
      setAlertMessage(`名前の変更に失敗しました: ${err}`);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedName || selectedName !== currentEventName) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await setEventMeta({ photo_data_url: reader.result as string });
        const m = await getEventMeta();
        setMeta(m);
      } catch (err) {
        setAlertMessage(`画像の保存に失敗しました: ${err}`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleNotesBlur = async () => {
    setEditingNotes(false);
    if (!selectedName || selectedName !== currentEventName) return;
    try {
      await setEventMeta({ notes: editNotes || null });
      const m = await getEventMeta();
      setMeta(m);
    } catch (err) {
      setAlertMessage(`メモの保存に失敗しました: ${err}`);
    }
  };

  const handleSwitch = async () => {
    if (!switchTarget) return;
    try {
      await switchEvent(switchTarget);
      setSwitchTarget(null);
    } catch (err) {
      setAlertMessage(`切り替えに失敗しました: ${err}`);
      setSwitchTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEvent(deleteTarget);
      if (currentEventName === deleteTarget) {
        setCurrentEventName(null);
        clearLastUsedEvent();
      }
      const evList = await listEvents();
      setEvents(evList);
      setDeleteTarget(null);
      setSelectedName((prev) => (prev === deleteTarget ? (evList[0] ?? null) : prev));
    } catch (err) {
      setAlertMessage(`削除に失敗しました: ${err}`);
      setDeleteTarget(null);
    }
  };

  const isCurrent = selectedName !== null && selectedName === currentEventName;

  return (
    <div className={shared.pageWrapper}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>イベント管理</h1>
        <p className={shared.pageHeaderSubtitle}>
          {currentEventName === null
            ? 'イベントを作成、または既存イベントを開いてください。'
            : '複数のイベントデータを切り替えて管理します。'}
        </p>
      </header>

      {alertMessage && (
        <ConfirmModal type="alert" message={alertMessage} onConfirm={() => setAlertMessage(null)} confirmLabel="OK" />
      )}
      {switchTarget && (
        <ConfirmModal
          type="confirm"
          title="イベント切り替え"
          message={`「${switchTarget}」に切り替えますか？`}
          confirmLabel="切り替える"
          cancelLabel="キャンセル"
          onConfirm={handleSwitch}
          onCancel={() => setSwitchTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          type="confirm"
          title="イベントの削除"
          message={`「${deleteTarget}」を削除しますか？\nこのイベントのデータはすべて削除されます。`}
          confirmLabel="削除する"
          cancelLabel="キャンセル"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className={styles.eventDetailLayout}>
        <div className={shared.castListPanel}>
          <div className={shared.castListPanel__search}>
            <Search size={14} className={shared.castListPanel__searchIcon} />
            <input
              className={shared.castListPanel__searchInput}
              placeholder="検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={shared.castListPanel__items}>
            {isLoading ? (
              <div className={shared.castListPanel__empty}>読込中...</div>
            ) : filteredEvents.length === 0 ? (
              <div className={shared.castListPanel__empty}>イベントなし</div>
            ) : (
              filteredEvents.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`${shared.castListItem} ${name === selectedName ? shared.castListItemSelected : ''}`}
                  onClick={() => setSelectedName(name)}
                >
                  <div className={`${shared.castListItem__dot} ${name === currentEventName ? shared.castListItem__dotPresent : shared.castListItem__dotAbsent}`} />
                  <div className={shared.castListItem__info}>
                    <div className={shared.castListItem__name}>{name}</div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className={shared.castListPanel__add}>
            <form onSubmit={handleAdd} className={shared.castListPanel__addRow}>
              <input
                className={shared.castListPanel__addInput}
                placeholder="新規イベント名"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
              <button type="submit" className={`${shared.btnPrimary} ${shared.castListPanel__addBtn}`} disabled={!addName.trim()} title="作成">
                <Plus size={14} />
              </button>
            </form>
          </div>
        </div>

        {!selectedName ? (
          <div className={shared.castDetailEmpty}>
            <Database size={40} className={shared.castDetailEmpty__icon} />
            <span>イベントを選択してください</span>
          </div>
        ) : (
          <div className={styles.eventCharPanel}>
            <div className={styles.eventCharContent}>
              <input
                className={styles.eventCharNameInput}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleNameBlur}
              />

              <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              <div
                className={styles.eventCharPhotoFrame}
                onClick={() => { if (isCurrent) photoInputRef.current?.click(); }}
              >
                {meta?.photo_data_url ? (
                  <>
                    <img src={meta.photo_data_url} className={styles.eventCharPhotoFrame__img} alt="" />
                    {isCurrent && (
                      <div className={styles.eventCharPhotoFrame__overlay}>
                        <Camera size={20} />
                        <span>変更</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.eventCharPhotoFrame__placeholder}>
                    <Camera size={36} className={styles.eventCharPhotoFrame__placeholderIcon} />
                    <span className={styles.eventCharPhotoFrame__placeholderText}>
                      {isCurrent ? 'クリックして画像を追加' : '使用中のイベントのみ編集可'}
                    </span>
                  </div>
                )}
              </div>

              <div className={shared.castCharDivider} />

              <div className={shared.castCharMemoSection}>
                <div className={shared.castCharMemoHeader}>
                  <span className={shared.castDetailLabel}>
                    <FileText size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    メモ・説明
                  </span>
                </div>
                {editingNotes ? (
                  <textarea
                    className={shared.castCharMemo__textarea}
                    rows={6}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    onBlur={handleNotesBlur}
                    autoFocus
                  />
                ) : (
                  <div
                    className={`${shared.castCharMemo__text} ${!editNotes ? shared.castCharMemo__textEmpty : ''}`}
                    onClick={() => { if (isCurrent) setEditingNotes(true); }}
                  >
                    {editNotes || (isCurrent ? 'クリックして編集...' : '使用中のイベントのみ編集可')}
                  </div>
                )}
              </div>

              <div className={shared.castCharDivider} />

              <div className={styles.eventCharActionRow}>
                <button
                  type="button"
                  className={`${styles.eventCharSwitchBtn} ${isCurrent ? styles.eventCharSwitchBtnCurrent : ''}`}
                  disabled={isCurrent}
                  onClick={() => setSwitchTarget(selectedName)}
                >
                  {isCurrent
                    ? <><Database size={13} /> 使用中</>
                    : <><RefreshCw size={13} /> 切り替える</>
                  }
                </button>
                {!isCurrent && (
                  <button
                    type="button"
                    className={styles.eventCharDeleteBtn}
                    onClick={() => setDeleteTarget(selectedName)}
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
