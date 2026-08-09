import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { CastBean, NGUserEntry } from '@/common/types/entities';
import { updateCastFields } from '@/db';
import {
  getOpenEventContext,
  isCurrentEventContext,
  type EventCommandContext,
} from '@/db/repositories/commandContext';
import { getMsg } from '@/messages/getMsg';
import {
  EMPTY_CAST_NG_FORM,
  clearSubmittedNgFormValues,
  createCastNgEntry,
  filterCastsByName,
  isDuplicateCastNgEntry,
  removeCastNgEntry,
  resolveSelectedCastId,
  updateCastNgEntryNotes,
  type CastNgFormValues,
  type PendingCastNgDeletion,
} from '../ngUserManagementModel';
import { useExclusiveMutation } from './useExclusiveMutation';

interface UseCastNgManagementParams {
  casts: CastBean[];
  setCasts: Dispatch<SetStateAction<CastBean[]>>;
  currentEventName: string | null;
  showAlert: (message: string) => void;
}

interface PersistCastNgEntriesOptions {
  context: EventCommandContext;
  castId: number;
  entries: NGUserEntry[] | undefined;
  failureMessage: string;
  afterSave?: () => void;
  afterSettled?: () => void;
}

/** キャスト別NGの表示状態と、イベント共有DBへの保存操作を調停する。 */
export function useCastNgManagement({
  casts,
  setCasts,
  currentEventName,
  showAlert,
}: UseCastNgManagementParams) {
  // 選択中のキャスト、検索語、追加フォームという利用者の入力状態。
  const [selectedCastId, setSelectedCastId] = useState<number | null>(casts[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CastNgFormValues>(EMPTY_CAST_NG_FORM);

  // 削除確認の対象と、保存中表示に使う非同期操作の状態。
  const [pendingDelete, setPendingDelete] = useState<PendingCastNgDeletion | null>(null);
  const {
    isActive: isSaving,
    run: runMutation,
    getIsActive: isMutationInFlight,
  } = useExclusiveMutation();

  // 現在の名簿と検索語から、パネルが直接描画できる値を導出する。
  const filteredCasts = filterCastsByName(casts, search);
  const selectedCast = casts.find((cast) => cast.id === selectedCastId) ?? null;

  useEffect(() => {
    setSelectedCastId((current) => resolveSelectedCastId(casts, current));
  }, [casts]);

  /** 追加フォームの指定項目だけを更新し、ほかの入力は保持する。 */
  function updateForm(patch: Partial<CastNgFormValues>): void {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function persistCastNgEntries(
    {
      context,
      castId,
      entries,
      failureMessage,
      afterSave,
      afterSettled,
    }: PersistCastNgEntriesOptions,
  ): Promise<void> {
    await runMutation(async () => {
      try {
        await updateCastFields(castId, { ng_entries: entries });
        if (!isCurrentEventContext(context)) return;
        setCasts((current) => current.map((cast) => (
          cast.id === castId ? { ...cast, ng_entries: entries } : cast
        )));
        afterSave?.();
      } catch {
        if (isCurrentEventContext(context)) showAlert(failureMessage);
      } finally {
        afterSettled?.();
      }
    });
  }

  /** 入力を検証してNG登録を保存し、同じイベントを表示中の場合だけ画面へ反映する。 */
  async function add(): Promise<void> {
    if (!selectedCast) {
      showAlert(getMsg('NGUserManagementPage.selectCastFirst'));
      return;
    }
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      showAlert(getMsg('NGUserManagementPage.addNgNeedsEvent'));
      return;
    }
    const nextEntry = createCastNgEntry(form);
    if (nextEntry === null) {
      showAlert(getMsg('NGUserManagementPage.invalidXId'));
      return;
    }
    if (isDuplicateCastNgEntry(selectedCast.ng_entries ?? [], nextEntry)) {
      showAlert(getMsg('NGUserManagementPage.duplicateNg'));
      return;
    }
    const submittedForm = form;
    const nextEntries = [...(selectedCast.ng_entries ?? []), nextEntry];
    await persistCastNgEntries({
      context,
      castId: selectedCast.id,
      entries: nextEntries,
      failureMessage: getMsg('NGUserManagementPage.addNgFailed'),
      afterSave: () => {
        // 保存中に利用者が書き換えた項目は消さず、送信時の値だけを空に戻す。
        setForm((current) => clearSubmittedNgFormValues(current, submittedForm));
      },
    });
  }

  /** 一覧行が既に保持する型付き登録を、そのまま削除確認へ渡す。 */
  function requestDelete(castId: number, entry: NGUserEntry): void {
    setPendingDelete({ castId, entry });
  }

  /** 確認済みのNG登録を保存値の完全一致で除き、既存の削除規則を維持する。 */
  async function confirmDelete(): Promise<void> {
    if (!pendingDelete || isMutationInFlight()) return;
    const deleteTarget = pendingDelete;
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      setPendingDelete(null);
      showAlert(getMsg('NGUserManagementPage.deleteNgRegistrationNeedsEvent'));
      return;
    }
    const targetCast = casts.find((cast) => cast.id === deleteTarget.castId);
    if (!targetCast) {
      setPendingDelete(null);
      showAlert(getMsg('NGUserManagementPage.deleteCastMissing'));
      return;
    }
    const nextEntries = removeCastNgEntry(targetCast.ng_entries ?? [], deleteTarget.entry);
    const persistedEntries = nextEntries.length > 0 ? nextEntries : undefined;
    await persistCastNgEntries({
      context,
      castId: deleteTarget.castId,
      entries: persistedEntries,
      failureMessage: getMsg('NGUserManagementPage.deleteNgRegistrationFailed'),
      afterSettled: () => {
        if (isCurrentEventContext(context)) setPendingDelete(null);
      },
    });
  }

  function cancelDelete(): void {
    if (!isMutationInFlight()) setPendingDelete(null);
  }

  /** NG登録のメモだけを置き換え、同じイベントを表示中の場合だけ一覧を更新する。 */
  async function updateNotes(
    castId: number,
    entryIndex: number,
    notes: string,
  ): Promise<void> {
    if (isMutationInFlight()) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      showAlert(getMsg('NGUserManagementPage.saveDetailsNeedsEvent'));
      return;
    }
    const targetCast = casts.find((cast) => cast.id === castId);
    const entry = targetCast?.ng_entries?.[entryIndex];
    if (!targetCast || !entry) {
      showAlert(getMsg('NGUserManagementPage.ngRegistrationMissing'));
      return;
    }
    const nextEntries = updateCastNgEntryNotes(targetCast.ng_entries ?? [], entryIndex, notes);
    await persistCastNgEntries({
      context,
      castId,
      entries: nextEntries,
      failureMessage: getMsg('NGUserManagementPage.detailsSaveFailed'),
    });
  }

  return {
    state: {
      filteredCasts,
      selectedCastId,
      selectedCast,
      search,
      form,
      isSaving,
    },
    actions: {
      setSearch,
      selectCast: setSelectedCastId,
      updateForm,
      add,
      requestDelete,
      updateNotes,
    },
    pendingDelete,
    confirmDelete,
    cancelDelete,
  };
}
