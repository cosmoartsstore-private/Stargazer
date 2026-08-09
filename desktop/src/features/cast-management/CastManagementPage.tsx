// キャストの登録・編集・削除とプロフィール情報を管理するページ。

import React, { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ConfirmDialog, NoticeDialog } from '@/components/ConfirmModal';
import { getMsg } from '@/messages/getMsg';
import type { CastBean } from '@/common/types/entities';
import { findCastNameUsages, renameCastInPreferences } from '@/common/castReferences';
import { flushPendingPageCommits } from '@/common/pageCommitRegistry';
import { readFileAsDataUrl } from '@/common/fileReading';
import { createSharedBusyTracker } from '@/common/sharedBusyTracker';
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

// 画面を再生成しても、同じ接続先・キャストへ最後に選択した写真だけを保存する。
const castPhotoMutationTokenByTarget = new Map<string, symbol>();
// 再生成前に始まった処理も含め、すべて完了した時点で親画面のbusyを解除する。
const castManagementBusyTracker = createSharedBusyTracker();

function getCastPhotoMutationKey(context: EventCommandContext, castId: number): string {
  return `${context.eventName}\u0000${context.generation}\u0000${castId}`;
}

interface CastManagementPageProps {
  initialSelectedCastId?: number;
  onBusyChange?: (busy: boolean) => void;
}

export const CastManagementPage: React.FC<CastManagementPageProps> = ({
  initialSelectedCastId,
  onBusyChange,
}) => {
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
  const [isCreating, setIsCreating] = useState(false);
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [isSavingAliases, setIsSavingAliases] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CastBean | null>(null);
  const shortcutGroupLabelId = useId();

  // 写真読込と連絡先保存の競合を、キャスト単位で管理する。
  const isMountedRef = useRef(true);
  const onBusyChangeRef = useRef(onBusyChange);
  const isPhotoSavingRef = useRef(false);
  const isSavingAliasesRef = useRef(false);
  const activePhotoMutationTokensRef = useRef(new Set<symbol>());
  const contactMutationSequenceByCastRef = useRef(new Map<number, number>());
  const isCreatingRef = useRef(false);
  onBusyChangeRef.current = onBusyChange;

  // 一覧選択から詳細ペインの対象を確定する。
  const selectedCast = casts.find((cast) => cast.id === selectedCastId) ?? null;

  useEffect(() => {
    setSelectedCastId(initialSelectedCastId ?? null);
    setMemoEditing(false);
    setInputAlias('');
    setIsSavingAliases(false);
    setAlertMessage(null);
    setDeleteTarget(null);
    contactMutationSequenceByCastRef.current.clear();
  }, [currentEventName, initialSelectedCastId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const beginCastManagementBusy = (busyToken: symbol) => {
    castManagementBusyTracker.begin(busyToken, onBusyChangeRef.current);
  };

  const finishCastManagementBusy = (busyToken: symbol) => {
    castManagementBusyTracker.finish(busyToken);
  };

  const runAliasMutation = async <T,>(mutation: () => Promise<T>): Promise<T> => {
    const busyToken = Symbol();
    isSavingAliasesRef.current = true;
    beginCastManagementBusy(busyToken);
    setIsSavingAliases(true);
    try {
      return await mutation();
    } finally {
      isSavingAliasesRef.current = false;
      if (isMountedRef.current) setIsSavingAliases(false);
      finishCastManagementBusy(busyToken);
    }
  };

  const beginPhotoSaving = (mutationToken: symbol) => {
    beginCastManagementBusy(mutationToken);
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
    finishCastManagementBusy(mutationToken);
  };

  // キャスト本体の追加・削除・名称・基本項目を永続化する。
  const handleAddCast = async () => {
    if (isCreatingRef.current) return;
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
    const busyToken = Symbol();
    isCreatingRef.current = true;
    beginCastManagementBusy(busyToken);
    if (isMountedRef.current) setIsCreating(true);
    try {
      const id = await insertCast(newCast);
      if (!isCurrentEventContext(context)) return;
      setCasts((prev) => [...prev, { ...newCast, id }]);
      setInputCastName('');
      setSelectedCastId(id);
    } catch {
      if (!isCurrentEventContext(context)) return;
      setAlertMessage(getMsg('CastManagementPage.addFailed'));
    } finally {
      isCreatingRef.current = false;
      if (isMountedRef.current) setIsCreating(false);
      finishCastManagementBusy(busyToken);
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
    const busyToken = Symbol();
    beginCastManagementBusy(busyToken);
    try {
      await deleteCast(cast.id);
      if (!isCurrentEventContext(context)) return;
      setCasts((prev) => prev.filter((current) => current.id !== cast.id));
      setSelectedCastId((current) => (current === cast.id ? null : current));
    } catch {
      if (!isCurrentEventContext(context)) return;
      setAlertMessage(getMsg('CastManagementPage.deleteFailed'));
    } finally {
      finishCastManagementBusy(busyToken);
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
    const busyToken = Symbol();
    beginCastManagementBusy(busyToken);
    try {
      // DB更新後に、現在プロセスで保持している表示名を同じ安定IDの希望へ反映する。
      await renameCastDb(renamedCast.id, trimmed);
      if (!isCurrentEventContext(context)) return 'stale';
      setCasts((prev) => prev.map((cast) => (
        cast.id === renamedCast.id ? { ...cast, name: trimmed } : cast
      )));
      setApplicants((current) => (
        renameCastInPreferences(current, renamedCast, trimmed)
      ));
      setCurrentWinners((current) => (
        renameCastInPreferences(current, renamedCast, trimmed)
      ));
      updateMatchingCastName(renamedCast.id, trimmed);
      return 'saved';
    } catch {
      if (!isCurrentEventContext(context)) return 'stale';
      setAlertMessage(getMsg('CastManagementPage.renameFailed'));
      return 'failed';
    } finally {
      finishCastManagementBusy(busyToken);
    }
  };

  const handleFieldChange = async (
    castId: number,
    patch: Partial<Omit<CastBean, 'id' | 'name'>>,
  ): Promise<EventMutationResult> => {
    const context = getOpenEventContext(currentEventName);
    if (context === null) return 'stale';
    const busyToken = Symbol();
    beginCastManagementBusy(busyToken);
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
    } finally {
      finishCastManagementBusy(busyToken);
    }
  };

  // FileReaderの世代とイベント世代を確認して写真を保存する。
  const handlePhotoUpload = (castId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    const mutationKey = getCastPhotoMutationKey(context, castId);
    const mutationToken = Symbol();
    castPhotoMutationTokenByTarget.set(mutationKey, mutationToken);
    beginPhotoSaving(mutationToken);
    void (async () => {
      try {
        let dataUrl: string;
        try {
          dataUrl = await readFileAsDataUrl(file);
        } catch {
          if (
            isMountedRef.current
            && castPhotoMutationTokenByTarget.get(mutationKey) === mutationToken
            && isCurrentEventContext(context)
          ) {
            setAlertMessage(getMsg('common.imageReadFailed'));
          }
          return;
        }
        if (
          castPhotoMutationTokenByTarget.get(mutationKey) !== mutationToken
          || !isCurrentEventContext(context)
        ) return;
        try {
          await updateCastFields(castId, { photo_data_url: dataUrl });
          if (
            castPhotoMutationTokenByTarget.get(mutationKey) !== mutationToken
            || !isCurrentEventContext(context)
          ) return;
          setCasts((prev) => prev.map((cast) => (
            cast.id === castId ? { ...cast, photo_data_url: dataUrl } : cast
          )));
        } catch {
          if (
            !isMountedRef.current
            || castPhotoMutationTokenByTarget.get(mutationKey) !== mutationToken
            || !isCurrentEventContext(context)
          ) return;
          setAlertMessage(getMsg('CastManagementPage.photoUpdateFailed'));
        }
      } finally {
        if (castPhotoMutationTokenByTarget.get(mutationKey) === mutationToken) {
          castPhotoMutationTokenByTarget.delete(mutationKey);
        }
        finishPhotoSaving(mutationToken);
      }
    })();
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
    const busyToken = Symbol();
    beginCastManagementBusy(busyToken);
    try {
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
    } finally {
      finishCastManagementBusy(busyToken);
    }
  };

  const handleAddContactUrl = (castId: number) => {
    const cast = casts.find((current) => current.id === castId);
    if (!cast) return;
    const contact_urls = [...getEditableContactUrls(cast), ''];
    // 空欄は入力用の画面状態として保持し、値が入力された時点で永続化する。
    setCasts((currentCasts) => currentCasts.map((current) => (
      current.id === castId
        ? { ...current, contact_urls }
        : current
    )));
  };

  // 正式名との競合を検査して別名義を追加・変更・削除する。
  const handleAddAlias = async (cast: CastBean) => {
    if (isSavingAliasesRef.current) return;
    const alias = inputAlias.trim();
    if (!alias) return;
    const conflictMessage = getAliasConflictMessage(alias, casts, cast);
    if (conflictMessage) {
      setAlertMessage(conflictMessage);
      return;
    }
    await runAliasMutation(async () => {
      const result = await handleFieldChange(cast.id, {
        aliases: [...(cast.aliases ?? []), alias],
      });
      if (result === 'saved' && isMountedRef.current) setInputAlias('');
    });
  };

  const handleUpdateAlias = async (
    cast: CastBean,
    aliasIndex: number,
    nextAlias: string,
  ): Promise<EventMutationResult> => {
    if (isSavingAliasesRef.current) return 'failed';
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
    return runAliasMutation(() => handleFieldChange(cast.id, { aliases }));
  };

  const handleDeleteAlias = async (cast: CastBean, aliasIndex: number) => {
    if (isSavingAliasesRef.current) return;
    const aliases = (cast.aliases ?? []).filter((_, index) => index !== aliasIndex);
    await runAliasMutation(() => (
      handleFieldChange(cast.id, {
        aliases: aliases.length > 0 ? aliases : undefined,
      })
    ));
  };

  // 連絡先表示と外部リンク起動に必要な値を組み立てる。
  const openExternalUrlWithAlert = async (url: string, failureMessage: string) => {
    try {
      await openExternalUrl(url);
    } catch {
      setAlertMessage(failureMessage);
    }
  };

  const handleOpenContactUrl = async (url: string) => {
    const openUrl = getOpenableContactUrl(url);
    if (!openUrl) return;
    await openExternalUrlWithAlert(openUrl, getMsg('CastManagementPage.openContactFailed'));
  };

  const handleOpenCommonShortcut = async (shortcut: CommonShortcutLink) => {
    await openExternalUrlWithAlert(
      shortcut.url,
      getMsg('CastManagementPage.openShortcutFailed', { shortcut: shortcut.label }),
    );
  };

  // 表示コンポーネントから受け取った型付き引数を、選択中キャストの更新処理へ接続する。
  const handleSelectCast = (castId: number) => {
    void (async () => {
      if (!await flushPendingPageCommits()) return;
      setSelectedCastId(castId);
      setMemoEditing(false);
      setInputAlias('');
    })();
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
  const handleSelectedMemoChange = (
    memo: string | undefined,
  ): Promise<EventMutationResult> => {
    if (!selectedCast) return Promise.resolve('stale');
    return handleFieldChange(selectedCast.id, { memo });
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
    if (selectedCast) handleAddContactUrl(selectedCast.id);
  };
  const handleInputAliasChange = (value: string) => setInputAlias(value);
  const handleDismissAlert = () => setAlertMessage(null);
  const handleConfirmDeleteClick = () => { void handleConfirmDeleteCast(); };
  const handleCancelDelete = () => setDeleteTarget(null);
  const deleteConfirmMessage = deleteTarget
    ? getMsg('CastManagementPage.deleteConfirmMessage', { castName: deleteTarget.name })
    : '';

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`} aria-busy={isPhotoSaving || undefined}>
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
          isCreating={isCreating}
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
