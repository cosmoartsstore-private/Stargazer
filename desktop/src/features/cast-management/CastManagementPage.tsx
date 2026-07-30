// キャストの登録・編集・削除とプロフィール情報を管理するページ。

import React, { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ConfirmDialog, NoticeDialog } from '@/components/ConfirmModal';
import { getMsg } from '@/messages/getMsg';
import type { CastBean } from '@/common/types/entities';
import { findCastNameUsages, renameCastInPreferences } from '@/common/castReferences';
import { useAppContext } from '@/stores/AppContext';
import {
  deleteCast,
  getAllCasts,
  insertCast,
  renameCast as renameCastDb,
  updateCastFields,
} from '@/db';
import {
  captureEventWriteActivity,
  getOpenEventContext,
  isEventWriteActivityUnchanged,
  isCurrentEventContext,
  waitForEventWritesToSettle,
  type EventCommandContext,
} from '@/db/repositories/commandContext';
import { openExternalUrl } from '@/tauri';
import { CastDetailPanel } from './components/CastDetailPanel';
import { CastListPanel } from './components/CastListPanel';
import {
  COMMON_SHORTCUT_LINKS,
  getAliasConflictMessage,
  getEditableContactUrls,
  getFormalNameConflictMessage,
  getOpenableContactUrl,
  type CommonShortcutLink,
  type EventMutationResult,
} from './castManagementModel';
import styles from './CastManagementPage.module.css';
import shared from '@/styles/shared.module.css';

interface CastManagementPageProps {
  initialSelectedCastId?: number;
}

export const CastManagementPage: React.FC<CastManagementPageProps> = ({ initialSelectedCastId }) => {
  // イベント名簿と、キャスト名変更に追従する画面内データ。
  const {
    casts,
    setCasts,
    setApplicants,
    setCurrentWinners,
    updateMatchingCastName,
    currentEventName,
  } = useAppContext();

  // 選択・編集・検索・確認ダイアログのUI状態。
  const [selectedCastId, setSelectedCastId] = useState<number | null>(() => initialSelectedCastId ?? null);
  const [memoEditing, setMemoEditing] = useState(false);
  const [inputCastName, setInputCastName] = useState('');
  const [inputAlias, setInputAlias] = useState('');
  const [castSearchQuery, setCastSearchQuery] = useState('');
  const [isSavingAliases, setIsSavingAliases] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CastBean | null>(null);
  const shortcutGroupLabelId = useId();

  // 写真読込と連絡先保存の競合を、キャスト単位の世代番号で管理する。
  const photoMutationGenerationByCastRef = useRef(new Map<number, number>());
  const pendingPhotoReadersRef = useRef(new Set<FileReader>());
  const contactMutationSequenceByCastRef = useRef(new Map<number, number>());

  // 一覧選択から詳細ペインの対象を確定する。
  const selectedCast = casts.find((cast) => cast.id === selectedCastId) ?? null;

  useEffect(() => {
    setSelectedCastId(initialSelectedCastId ?? null);
    setMemoEditing(false);
    setInputAlias('');
    setIsSavingAliases(false);
    setAlertMessage(null);
    setDeleteTarget(null);
    photoMutationGenerationByCastRef.current.clear();
    contactMutationSequenceByCastRef.current.clear();
  }, [currentEventName, initialSelectedCastId]);

  useEffect(() => () => {
    photoMutationGenerationByCastRef.current.clear();
    for (const reader of pendingPhotoReadersRef.current) {
      if (reader.readyState === FileReader.LOADING) reader.abort();
    }
    pendingPhotoReadersRef.current.clear();
  }, []);

  // キャスト本体の追加・削除・名称・基本項目を永続化する。
  const handleAddCast = async () => {
    const castName = inputCastName.trim();
    if (!castName) return;
    const conflictMessage = getFormalNameConflictMessage(castName, casts);
    if (conflictMessage) {
      setAlertMessage(conflictMessage);
      return;
    }
    const newCast: Omit<CastBean, 'id'> = { name: castName, is_present: false };
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    try {
      const id = await insertCast(newCast);
      if (!isCurrentEventContext(context)) return;
      setCasts((prev) => [...prev, { ...newCast, id }]);
      setInputCastName('');
      setSelectedCastId(id);
    } catch {
      if (!isCurrentEventContext(context)) return;
      setAlertMessage(getMsg('CastManagementPage.addFailed'));
    }
  };

  const handleDeleteCast = (cast: CastBean) => {
    setDeleteTarget(cast);
  };

  const handleConfirmDeleteCast = async () => {
    if (deleteTarget === null) return;
    const cast = deleteTarget;
    setDeleteTarget(null);
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    try {
      await deleteCast(cast.id);
      if (!isCurrentEventContext(context)) return;
      setCasts((prev) => prev.filter((current) => current.id !== cast.id));
      if (selectedCastId === cast.id) setSelectedCastId(null);
    } catch {
      if (!isCurrentEventContext(context)) return;
      setAlertMessage(getMsg('CastManagementPage.deleteFailed'));
    }
  };

  const handleRenameCast = async (
    renamedCast: CastBean,
    nextName: string,
  ): Promise<EventMutationResult> => {
    const oldName = renamedCast.name;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === oldName) return trimmed === oldName ? 'saved' : 'failed';
    const conflictMessage = getFormalNameConflictMessage(trimmed, casts);
    if (conflictMessage) {
      setAlertMessage(
        findCastNameUsages(trimmed, casts).some((usage) => usage.castId === renamedCast.id)
          ? getMsg('CastManagementPage.renameMatchesAlias', { name: trimmed })
          : conflictMessage,
      );
      return 'failed';
    }
    const context = getOpenEventContext(currentEventName);
    if (context === null) return 'stale';
    try {
      // DB更新後に、現在プロセスで保持している表示名を同じ安定IDの希望へ反映する。
      await renameCastDb(renamedCast.id, trimmed);
      if (!isCurrentEventContext(context)) return 'stale';
      setCasts((prev) => prev.map((cast) => (
        cast.id === renamedCast.id ? { ...cast, name: trimmed } : cast
      )));
      setApplicants((current) => (
        renameCastInPreferences(current, renamedCast, oldName, trimmed)
      ));
      setCurrentWinners((current) => (
        renameCastInPreferences(current, renamedCast, oldName, trimmed)
      ));
      updateMatchingCastName(renamedCast.id, trimmed);
      return 'saved';
    } catch {
      if (!isCurrentEventContext(context)) return 'stale';
      setAlertMessage(getMsg('CastManagementPage.renameFailed'));
      return 'failed';
    }
  };

  const handleFieldChange = async (
    castId: number,
    patch: Partial<Omit<CastBean, 'id' | 'name'>>,
  ): Promise<EventMutationResult> => {
    const context = getOpenEventContext(currentEventName);
    if (context === null) return 'stale';
    try {
      await updateCastFields(castId, patch);
      if (!isCurrentEventContext(context)) return 'stale';
      setCasts((prev) => prev.map((cast) => (
        cast.id === castId ? { ...cast, ...patch } : cast
      )));
      return 'saved';
    } catch {
      if (!isCurrentEventContext(context)) return 'stale';
      setAlertMessage(getMsg('CastManagementPage.updateFailed'));
      return 'failed';
    }
  };

  // FileReaderの世代とイベント世代を確認して写真を保存する。
  const handlePhotoUpload = (castId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    const mutationGeneration = (photoMutationGenerationByCastRef.current.get(castId) ?? 0) + 1;
    photoMutationGenerationByCastRef.current.set(castId, mutationGeneration);
    const reader = new FileReader();
    pendingPhotoReadersRef.current.add(reader);
    reader.onloadend = () => {
      pendingPhotoReadersRef.current.delete(reader);
    };
    reader.onload = () => {
      if (
        photoMutationGenerationByCastRef.current.get(castId) !== mutationGeneration
        || !isCurrentEventContext(context)
      ) return;
      const dataUrl = reader.result as string;
      void updateCastFields(castId, { photo_data_url: dataUrl })
        .then(() => {
          if (!isCurrentEventContext(context)) return;
          setCasts((prev) => prev.map((cast) => (
            cast.id === castId ? { ...cast, photo_data_url: dataUrl } : cast
          )));
        })
        .catch(() => {
          if (
            photoMutationGenerationByCastRef.current.get(castId) !== mutationGeneration
            || !isCurrentEventContext(context)
          ) return;
          setAlertMessage(getMsg('CastManagementPage.photoUpdateFailed'));
        });
    };
    const handleReaderFailure = () => {
      if (
        photoMutationGenerationByCastRef.current.get(castId) !== mutationGeneration
        || !isCurrentEventContext(context)
      ) return;
      setAlertMessage(getMsg('common.imageReadFailed'));
    };
    reader.onerror = handleReaderFailure;
    reader.onabort = handleReaderFailure;
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 連絡先の楽観更新と、失敗時のDB再読み込みをキャスト単位で調停する。
  const restoreCastsAfterContactFailure = async (
    context: EventCommandContext,
    castId: number,
    sequence: number,
  ): Promise<boolean> => {
    while (
      isCurrentEventContext(context)
      && contactMutationSequenceByCastRef.current.get(castId) === sequence
    ) {
      await waitForEventWritesToSettle(context);
      if (!isCurrentEventContext(context)) return false;
      if (contactMutationSequenceByCastRef.current.get(castId) !== sequence) return false;
      const writeActivity = captureEventWriteActivity(context);
      if (!isEventWriteActivityUnchanged(context, writeActivity)) continue;
      const persistedCasts = await getAllCasts();
      if (!isCurrentEventContext(context)) return false;
      if (contactMutationSequenceByCastRef.current.get(castId) !== sequence) return false;
      if (!isEventWriteActivityUnchanged(context, writeActivity)) continue;
      setCasts(persistedCasts);
      return true;
    }
    return false;
  };

  const handleContactUrlChange = async (castId: number, index: number, value: string) => {
    const cast = casts.find((current) => current.id === castId);
    if (!cast) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    const urls = [...getEditableContactUrls(cast)];
    urls[index] = value;
    const normalized = urls.map((u) => u.trim()).filter(Boolean);
    const contact_urls = normalized.length > 0 ? normalized : undefined;
    const sequence = (contactMutationSequenceByCastRef.current.get(castId) ?? 0) + 1;
    contactMutationSequenceByCastRef.current.set(castId, sequence);
    setCasts((prev) => prev.map((current) => (
      current.id === castId ? { ...current, contact_urls } : current
    )));
    try {
      await updateCastFields(castId, { contact_urls });
      if (!isCurrentEventContext(context)) return;
    } catch {
      if (!isCurrentEventContext(context)) return;
      if (contactMutationSequenceByCastRef.current.get(castId) !== sequence) return;
      try {
        if (await restoreCastsAfterContactFailure(context, castId, sequence)) {
          setAlertMessage(getMsg('CastManagementPage.contactRollback'));
        }
      } catch {
        if (
          isCurrentEventContext(context)
          && contactMutationSequenceByCastRef.current.get(castId) === sequence
        ) {
          setAlertMessage(getMsg('CastManagementPage.contactSaveFailed'));
        }
      }
    }
  };

  const handleAddContactUrl = async (castId: number) => {
    const cast = casts.find((current) => current.id === castId);
    if (!cast) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    const contact_urls = [...(cast.contact_urls ?? []), ''];
    const sequence = (contactMutationSequenceByCastRef.current.get(castId) ?? 0) + 1;
    contactMutationSequenceByCastRef.current.set(castId, sequence);
    setCasts((prev) => prev.map((cast) => (
      cast.id === castId
        ? { ...cast, contact_urls }
        : cast
    )));
    try {
      await updateCastFields(castId, { contact_urls });
      if (!isCurrentEventContext(context)) return;
    } catch {
      if (!isCurrentEventContext(context)) return;
      if (contactMutationSequenceByCastRef.current.get(castId) !== sequence) return;
      try {
        if (await restoreCastsAfterContactFailure(context, castId, sequence)) {
          setAlertMessage(getMsg('CastManagementPage.contactAddRollback'));
        }
      } catch {
        if (
          isCurrentEventContext(context)
          && contactMutationSequenceByCastRef.current.get(castId) === sequence
        ) {
          setAlertMessage(getMsg('CastManagementPage.contactAddFailed'));
        }
      }
    }
  };

  // 正式名との競合を検査して別名義を追加・変更・削除する。
  const handleAddAlias = async (cast: CastBean) => {
    if (isSavingAliases) return;
    const alias = inputAlias.trim();
    if (!alias) return;
    const conflictMessage = getAliasConflictMessage(alias, casts, cast);
    if (conflictMessage) {
      setAlertMessage(conflictMessage);
      return;
    }
    setIsSavingAliases(true);
    let result: EventMutationResult = 'stale';
    try {
      result = await handleFieldChange(cast.id, {
        aliases: [...(cast.aliases ?? []), alias],
      });
      if (result === 'saved') setInputAlias('');
    } finally {
      if (result !== 'stale') setIsSavingAliases(false);
    }
  };

  const handleUpdateAlias = async (
    cast: CastBean,
    aliasIndex: number,
    nextAlias: string,
  ): Promise<EventMutationResult> => {
    if (isSavingAliases) return 'failed';
    const alias = nextAlias.trim();
    if (!alias) {
      setAlertMessage(getMsg('CastManagementPage.emptyAlias'));
      return 'failed';
    }
    if (alias === cast.aliases?.[aliasIndex]) return 'saved';
    const conflictMessage = getAliasConflictMessage(alias, casts, cast, aliasIndex);
    if (conflictMessage) {
      setAlertMessage(conflictMessage);
      return 'failed';
    }
    const aliases = [...(cast.aliases ?? [])];
    aliases[aliasIndex] = alias;
    setIsSavingAliases(true);
    let result: EventMutationResult = 'stale';
    try {
      result = await handleFieldChange(cast.id, { aliases });
      return result;
    } finally {
      if (result !== 'stale') setIsSavingAliases(false);
    }
  };

  const handleDeleteAlias = async (cast: CastBean, aliasIndex: number) => {
    if (isSavingAliases) return;
    const aliases = (cast.aliases ?? []).filter((_, index) => index !== aliasIndex);
    setIsSavingAliases(true);
    let result: EventMutationResult = 'stale';
    try {
      result = await handleFieldChange(cast.id, {
        aliases: aliases.length > 0 ? aliases : undefined,
      });
    } finally {
      if (result !== 'stale') setIsSavingAliases(false);
    }
  };

  // 連絡先表示と外部リンク起動に必要な値を組み立てる。
  const handleOpenContactUrl = async (url: string) => {
    const openUrl = getOpenableContactUrl(url);
    if (!openUrl) return;
    try {
      await openExternalUrl(openUrl);
    } catch {
      setAlertMessage(getMsg('CastManagementPage.openContactFailed'));
    }
  };

  const handleOpenCommonShortcut = async (shortcut: CommonShortcutLink) => {
    try {
      await openExternalUrl(shortcut.url);
    } catch {
      setAlertMessage(getMsg('CastManagementPage.openShortcutFailed', {
        shortcut: shortcut.label,
      }));
    }
  };

  // 表示コンポーネントから受け取った型付き引数を、選択中キャストの更新処理へ接続する。
  const handleSelectCast = (castId: number) => {
    setSelectedCastId(castId);
    setMemoEditing(false);
    setInputAlias('');
  };
  const handleSelectedPhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedCast) handlePhotoUpload(selectedCast.id, event);
  };
  const handleRenameSelectedCast = (nextName: string): Promise<EventMutationResult> => {
    if (!selectedCast) return Promise.resolve('stale');
    return handleRenameCast(selectedCast, nextName);
  };
  const handleSelectedGroupNameChange = (
    groupName: string | undefined,
  ): Promise<EventMutationResult> => {
    if (!selectedCast) return Promise.resolve('stale');
    return handleFieldChange(selectedCast.id, { group_name: groupName });
  };
  const handleUpdateSelectedAlias = (
    aliasIndex: number,
    nextAlias: string,
  ): Promise<EventMutationResult> => {
    if (!selectedCast) return Promise.resolve('stale');
    return handleUpdateAlias(selectedCast, aliasIndex, nextAlias);
  };
  const handleDeleteSelectedAlias = (aliasIndex: number) => {
    if (selectedCast) void handleDeleteAlias(selectedCast, aliasIndex);
  };
  const handleMemoEditingChange = (editing: boolean) => setMemoEditing(editing);
  const handleSelectedMemoChange = (memo: string | undefined) => {
    if (selectedCast) void handleFieldChange(selectedCast.id, { memo });
  };
  const handleSelectedContactChange = (contactIndex: number, value: string) => {
    if (selectedCast) void handleContactUrlChange(selectedCast.id, contactIndex, value);
  };
  const handleDeleteSelectedContact = (contactIndex: number) => {
    if (selectedCast) void handleContactUrlChange(selectedCast.id, contactIndex, '');
  };
  const handleDeleteSelectedCast = () => {
    if (selectedCast) handleDeleteCast(selectedCast);
  };
  const handleAddSelectedAlias = () => {
    if (selectedCast) void handleAddAlias(selectedCast);
  };
  const handleAddSelectedContact = () => {
    if (selectedCast) void handleAddContactUrl(selectedCast.id);
  };
  const handleInputAliasChange = (value: string) => setInputAlias(value);
  const handleDismissAlert = () => setAlertMessage(null);
  const handleConfirmDeleteClick = () => { void handleConfirmDeleteCast(); };
  const handleCancelDelete = () => setDeleteTarget(null);
  const deleteConfirmMessage = deleteTarget
    ? getMsg('CastManagementPage.deleteConfirmMessage', { castName: deleteTarget.name })
    : '';

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <div className={`${shared.pageHeaderRow} ${shared.pageHeaderRowFlexStart} ${styles.castPageHeaderRow}`}>
          <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('CastManagementPage.pageTitle')}</h1>
          <div className={styles.castShortcutGroup} role="group" aria-labelledby={shortcutGroupLabelId}>
            <span id={shortcutGroupLabelId} className={styles.castShortcutGroupLabel}>{getMsg('CastManagementPage.commonShortcuts')}</span>
            <div className={styles.castShortcutActions}>
              {COMMON_SHORTCUT_LINKS.map((shortcut) => (
                <button
                  key={shortcut.key}
                  type="button"
                  className={styles.castShortcutButton}
                  aria-label={getMsg('CastManagementPage.openShortcutAriaLabel', { shortcut: shortcut.label })}
                  onClick={() => { void handleOpenCommonShortcut(shortcut); }}
                >
                  <span>{shortcut.label}</span>
                  <ExternalLink size={13} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <div className={`${shared.statusCard} ${styles.castHeaderStatus}`}>
            <div className={shared.statusCard__label}>{getMsg('CastManagementPage.registeredCount')}</div>
            <div className={shared.statusCard__value}><span className={shared.statusCard__valueAccent}>{casts.length}</span></div>
          </div>
        </div>
      </header>

      <div className={`${shared.managementDetailLayout} ${styles.castDetailLayout}`}>
        <CastListPanel
          casts={casts}
          selectedCastId={selectedCastId}
          searchQuery={castSearchQuery}
          inputCastName={inputCastName}
          onSearchQueryChange={setCastSearchQuery}
          onInputCastNameChange={setInputCastName}
          onAddCast={handleAddCast}
          onSelectCast={handleSelectCast}
        />

        <CastDetailPanel
          key={selectedCast?.id ?? 'empty'}
          cast={selectedCast}
          inputAlias={inputAlias}
          isSavingAliases={isSavingAliases}
          memoEditing={memoEditing}
          onPhotoUpload={handleSelectedPhotoUpload}
          onDeleteCast={handleDeleteSelectedCast}
          onRenameCast={handleRenameSelectedCast}
          onGroupNameChange={handleSelectedGroupNameChange}
          onAliasInputChange={handleInputAliasChange}
          onAddAlias={handleAddSelectedAlias}
          onUpdateAlias={handleUpdateSelectedAlias}
          onDeleteAlias={handleDeleteSelectedAlias}
          onMemoEditingChange={handleMemoEditingChange}
          onMemoChange={handleSelectedMemoChange}
          onContactChange={handleSelectedContactChange}
          onAddContact={handleAddSelectedContact}
          onOpenContact={handleOpenContactUrl}
          onDeleteContact={handleDeleteSelectedContact}
        />
      </div>

      {alertMessage && (
        <NoticeDialog
          title={getMsg('CastManagementPage.pageTitle')}
          message={alertMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleDismissAlert}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title={getMsg('CastManagementPage.deleteConfirmTitle')}
          message={deleteConfirmMessage}
          confirmLabel={getMsg('common.delete')}
          cancelLabel={getMsg('common.cancel')}
          intent="danger"
          onConfirm={handleConfirmDeleteClick}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
  );
};
