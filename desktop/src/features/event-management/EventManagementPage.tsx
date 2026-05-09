import React, { useState, useEffect, useRef } from 'react';
import { Database, Plus, Camera, FileText, Search, RefreshCw } from '@/common/icons';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useAppContext } from '@/stores/AppContext';
import { STORAGE_KEYS } from '@/common/config';
import {
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getCurrentEventId,
  setCurrentEventId as setCurrentEventIdDb,
  type EventRow,
} from '@/db/repositories/eventRepository';
import styles from './EventManagementPage.module.css';
import shared from '@/styles/shared.module.css';

export const EventManagementPage: React.FC = () => {
  const {
    setCurrentEventId: setCurrentEventIdCtx,
    resetMatching,
    setCurrentWinners,
  } = useAppContext();

  const [events, setEvents]         = useState<EventRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [currentId, setCurrentId_]  = useState<number | null>(null);
  const [search, setSearch]         = useState('');
  const [addName, setAddName]       = useState('');
  const [isLoading, setIsLoading]   = useState(true);

  const [editName, setEditName]         = useState('');
  const [editNotes, setEditNotes]       = useState('');
  const [editingNotes, setEditingNotes] = useState(false);

  const [switchTarget, setSwitchTarget] = useState<EventRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventRow | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const selectedEvent   = events.find(e => e.id === selectedId) ?? null;
  const filteredEvents  = events.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    setEditName(selectedEvent.name);
    setEditNotes(selectedEvent.notes ?? '');
    setEditingNotes(false);
  }, [selectedId]);

  const load = async () => {
    setIsLoading(true);
    try {
      const [evList, curId] = await Promise.all([getAllEvents(), getCurrentEventId()]);
      setEvents(evList);
      setCurrentId_(curId);
      setSelectedId(prev => {
        if (prev !== null && evList.some(e => e.id === prev)) return prev;
        return evList.find(e => e.id === curId)?.id ?? evList[0]?.id ?? null;
      });
    } catch (e) {
      console.error(e);
      setAlertMessage('イベントの取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setAlertMessage('イベント名は半角英数字、ハイフン、アンダースコアのみ使用可能です。');
      return;
    }
    if (events.some(ev => ev.name === name)) {
      setAlertMessage('すでに同じ名前のイベントが存在します。');
      return;
    }
    try {
      const id = await createEvent(name);
      setAddName('');
      const evList = await getAllEvents();
      setEvents(evList);
      setSelectedId(id);
    } catch (err) {
      setAlertMessage(`作成に失敗しました: ${err}`);
    }
  };

  const saveField = async (patch: Parameters<typeof updateEvent>[1]) => {
    if (!selectedEvent) return;
    try {
      await updateEvent(selectedEvent.id, patch);
      setEvents(prev => prev.map(ev => ev.id === selectedEvent.id ? { ...ev, ...patch } : ev));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNameBlur = async () => {
    const name = editName.trim();
    if (!name || name === selectedEvent?.name) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setEditName(selectedEvent?.name ?? '');
      setAlertMessage('イベント名は半角英数字、ハイフン、アンダースコアのみ使用可能です。');
      return;
    }
    if (events.some(ev => ev.name === name && ev.id !== selectedEvent?.id)) {
      setEditName(selectedEvent?.name ?? '');
      setAlertMessage('すでに同じ名前のイベントが存在します。');
      return;
    }
    await saveField({ name });
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEvent) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await saveField({ photo_data_url: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSwitch = async () => {
    if (!switchTarget) return;
    try {
      await setCurrentEventIdDb(switchTarget.id);
      resetMatching();
      setCurrentWinners([]);
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      setCurrentId_(switchTarget.id);
      setCurrentEventIdCtx(switchTarget.id);
      setSwitchTarget(null);
    } catch (err) {
      setAlertMessage(`切り替えに失敗しました: ${err}`);
      setSwitchTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEvent(deleteTarget.id);
      const evList = await getAllEvents();
      setEvents(evList);
      setDeleteTarget(null);
      setSelectedId(prev =>
        prev === deleteTarget.id ? (evList[0]?.id ?? null) : prev
      );
    } catch (err) {
      setAlertMessage(`削除に失敗しました: ${err}`);
      setDeleteTarget(null);
    }
  };

  return (
    <div className={shared.pageWrapper}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>イベント管理</h1>
        <p className={shared.pageHeaderSubtitle}>複数のイベントデータを切り替えて管理します。</p>
      </header>

      {alertMessage && (
        <ConfirmModal type="alert" message={alertMessage} onConfirm={() => setAlertMessage(null)} confirmLabel="OK" />
      )}
      {switchTarget && (
        <ConfirmModal
          type="confirm"
          title="イベント切り替え"
          message={`「${switchTarget.name}」に切り替えますか？\nアプリケーションが再起動されます。`}
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
          message={`「${deleteTarget.name}」を削除しますか？\nこのイベントのデータはすべて削除されます。`}
          confirmLabel="削除する"
          cancelLabel="キャンセル"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className={styles.eventDetailLayout}>
        {/* ── Left: event list ── */}
        <div className={shared.castListPanel}>
          <div className={shared.castListPanel__search}>
            <Search size={14} className={shared.castListPanel__searchIcon} />
            <input
              className={shared.castListPanel__searchInput}
              placeholder="検索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className={shared.castListPanel__items}>
            {isLoading ? (
              <div className={shared.castListPanel__empty}>読込中...</div>
            ) : filteredEvents.length === 0 ? (
              <div className={shared.castListPanel__empty}>イベントなし</div>
            ) : (
              filteredEvents.map(ev => (
                <button
                  key={ev.id}
                  type="button"
                  className={`${shared.castListItem} ${ev.id === selectedId ? shared.castListItemSelected : ''}`}
                  onClick={() => setSelectedId(ev.id)}
                >
                  <div className={`${shared.castListItem__dot} ${ev.id === currentId ? shared.castListItem__dotPresent : shared.castListItem__dotAbsent}`} />
                  <div className={shared.castListItem__info}>
                    <div className={shared.castListItem__name}>{ev.name}</div>
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
                onChange={e => setAddName(e.target.value)}
              />
              <button type="submit" className={`${shared.btnPrimary} ${shared.castListPanel__addBtn}`} disabled={!addName.trim()} title="作成">
                <Plus size={14} />
              </button>
            </form>
          </div>
        </div>

        {/* ── Right: event detail ── */}
        {!selectedEvent ? (
          <div className={shared.castDetailEmpty}>
            <Database size={40} className={shared.castDetailEmpty__icon} />
            <span>イベントを選択してください</span>
          </div>
        ) : (
          <div className={styles.eventCharPanel}>
            <div className={styles.eventCharContent}>
              {/* Name */}
              <input
                className={styles.eventCharNameInput}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={handleNameBlur}
              />

              {/* Photo 16:9 */}
              <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              <div className={styles.eventCharPhotoFrame} onClick={() => photoInputRef.current?.click()}>
                {selectedEvent.photo_data_url ? (
                  <>
                    <img src={selectedEvent.photo_data_url} className={styles.eventCharPhotoFrame__img} alt="" />
                    <div className={styles.eventCharPhotoFrame__overlay}>
                      <Camera size={20} />
                      <span>変更</span>
                    </div>
                  </>
                ) : (
                  <div className={styles.eventCharPhotoFrame__placeholder}>
                    <Camera size={36} className={styles.eventCharPhotoFrame__placeholderIcon} />
                    <span className={styles.eventCharPhotoFrame__placeholderText}>クリックして画像を追加</span>
                  </div>
                )}
              </div>

              <div className={shared.castCharDivider} />

              {/* Notes */}
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
                    onChange={e => setEditNotes(e.target.value)}
                    onBlur={async () => {
                      setEditingNotes(false);
                      await saveField({ notes: editNotes || null });
                    }}
                    autoFocus
                  />
                ) : (
                  <div
                    className={`${shared.castCharMemo__text} ${!editNotes ? shared.castCharMemo__textEmpty : ''}`}
                    onClick={() => setEditingNotes(true)}
                  >
                    {editNotes || 'クリックして編集...'}
                  </div>
                )}
              </div>

              <div className={shared.castCharDivider} />

              {/* Bottom action row */}
              <div className={styles.eventCharActionRow}>
                <button
                  type="button"
                  className={`${styles.eventCharSwitchBtn} ${selectedEvent.id === currentId ? styles.eventCharSwitchBtnCurrent : ''}`}
                  disabled={selectedEvent.id === currentId}
                  onClick={() => setSwitchTarget(selectedEvent)}
                >
                  {selectedEvent.id === currentId
                    ? <><Database size={13} /> 使用中</>
                    : <><RefreshCw size={13} /> 切り替える</>
                  }
                </button>
                {selectedEvent.id !== currentId && (
                  <button
                    type="button"
                    className={styles.eventCharDeleteBtn}
                    onClick={() => setDeleteTarget(selectedEvent)}
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
