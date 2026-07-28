import type {
  ChangeEvent,
  KeyboardEvent,
} from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import {
  buildXProfileUrl,
  type CastBean,
  type CastNgFormValues,
  type NGUserEntry,
} from '../ngUserManagementModel';
import styles from '../NGUserManagementPage.module.css';
import { EntryDetailsEditor } from './EntryDetailsEditor';

export interface CastNgPanelController {
  state: {
    filteredCasts: CastBean[];
    selectedCastId: number | null;
    selectedCast: CastBean | null;
    search: string;
    form: CastNgFormValues;
    isSaving: boolean;
  };
  actions: {
    setSearch: (value: string) => void;
    selectCast: (castId: number) => void;
    updateForm: (patch: Partial<CastNgFormValues>) => void;
    add: () => Promise<void>;
    requestDelete: (castId: number, entry: NGUserEntry) => void;
    updateNotes: (castId: number, entryIndex: number, notes: string) => Promise<void>;
  };
}

export interface CastNgPanelProps {
  controller: CastNgPanelController;
  onRequestProfileLink: (accountId: string | undefined, fallbackLabel: string) => void;
}

interface CastListItemProps {
  cast: CastBean;
  isSelected: boolean;
  onSelect: (castId: number) => void;
}

function CastListItem({ cast, isSelected, onSelect }: CastListItemProps) {
  // 選択状態と登録件数から一覧行の表示を決める。
  const className = [
    shared.managementListItem,
    isSelected ? shared.managementListItemSelected : '',
  ].filter(Boolean).join(' ');
  const ngEntryCount = cast.ng_entries?.length ?? 0;

  function handleSelectClick(): void {
    onSelect(cast.id);
  }

  return (
    <button type="button" className={className} aria-pressed={isSelected} onClick={handleSelectClick}>
      <span className={`${shared.managementListItem__info} ${shared.managementListItem__name}`}>{cast.name}</span>
      {ngEntryCount > 0 && <span className={styles.ngCastList__count}>{ngEntryCount}</span>}
    </button>
  );
}

interface CastNgEntryRowProps {
  castId: number;
  entry: NGUserEntry;
  entryIndex: number;
  isSaving: boolean;
  onRequestDelete: (castId: number, entry: NGUserEntry) => void;
  onUpdateNotes: (castId: number, entryIndex: number, notes: string) => Promise<void>;
  onRequestProfileLink: (accountId: string | undefined, fallbackLabel: string) => void;
}

function CastNgEntryRow({
  castId,
  entry,
  entryIndex,
  isSaving,
  onRequestDelete,
  onUpdateNotes,
  onRequestProfileLink,
}: CastNgEntryRowProps) {
  // 登録内容から表示名、リンク可否、操作ラベルを導出する。
  const fallbackLabel = entry.username ?? getMsg('NGUserManagementPage.ngUserFallback');
  const accountLabel = entry.accountId ?? fallbackLabel;
  const hasProfileLink = buildXProfileUrl(entry.accountId) !== null;
  const openProfileAriaLabel = getMsg(
    'NGUserManagementPage.openXAccountAriaLabel',
    { accountId: accountLabel },
  );
  const deleteNgRegistrationAriaLabel = getMsg(
    'NGUserManagementPage.deleteNgRegistrationAriaLabel',
    { label: accountLabel },
  );

  // この行の型付き対象を、各DOMイベントから直接親の操作へ渡す。
  function handleProfileLinkClick(): void {
    onRequestProfileLink(entry.accountId, fallbackLabel);
  }

  function handleDeleteClick(): void {
    onRequestDelete(castId, entry);
  }

  function handleDetailsSave(_reason: string, notes: string): Promise<void> {
    return onUpdateNotes(castId, entryIndex, notes);
  }

  return (
    <div className={styles.ngDetailItem}>
      <div className={styles.ngDetailSummary}>
        <div className={styles.ngCastGrid__text}>
          <span className={styles.ngCastGrid__textName}>{entry.username ?? getMsg('common.unnamed')}</span>
          <span className={styles.ngCastGrid__textId}>{entry.accountId ?? getMsg('NGUserManagementPage.noId')}</span>
        </div>
        {hasProfileLink && (
          <button type="button" className={styles.ngLinkButton} aria-label={openProfileAriaLabel} onClick={handleProfileLinkClick}><ExternalLink size={14} /></button>
        )}
        <button type="button" className={styles.ngCastGrid__remove} aria-label={deleteNgRegistrationAriaLabel} onClick={handleDeleteClick}>×</button>
      </div>
      <EntryDetailsEditor notes={entry.notes} disabled={isSaving} onSave={handleDetailsSave} />
    </div>
  );
}

/** キャストの検索・選択と、選択中キャストのNG登録を表示する。 */
export function CastNgPanel({ controller, onRequestProfileLink }: CastNgPanelProps) {
  // controllerが管理する表示状態。
  const {
    filteredCasts,
    selectedCastId,
    selectedCast,
    search,
    form,
    isSaving,
  } = controller.state;

  // controllerが提供する検索、選択、登録、更新操作。
  const {
    setSearch,
    selectCast,
    updateForm,
    add,
    requestDelete,
    updateNotes,
  } = controller.actions;

  // 検索と追加フォームのDOMイベントを、対応する状態更新へ接続する。
  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearch(event.target.value);
  }

  function handleUsernameChange(event: ChangeEvent<HTMLInputElement>): void {
    updateForm({ username: event.target.value });
  }

  function handleAccountIdChange(event: ChangeEvent<HTMLInputElement>): void {
    updateForm({ accountId: event.target.value });
  }

  function handleNotesChange(event: ChangeEvent<HTMLInputElement>): void {
    updateForm({ notes: event.target.value });
  }

  function handleAddInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') void add();
  }

  function handleAddClick(): void {
    void add();
  }

  return (
    <div className={shared.managementDetailLayout}>
      <div className={shared.managementListPanel}>
        <div className={shared.managementListPanel__search}>
          <Search size={14} className={shared.managementListPanel__searchIcon} />
          <input type="search" className={shared.managementListPanel__searchInput} placeholder={getMsg('common.searchPlaceholder')} aria-label={getMsg('common.searchPlaceholder')} value={search} onChange={handleSearchChange} />
        </div>
        <div className={`${shared.managementListPanel__items} ${shared.customScrollbar}`}>
          {filteredCasts.length === 0 ? (
            <div className={shared.managementListPanel__empty}>{getMsg('NGUserManagementPage.noCasts')}</div>
          ) : (
            filteredCasts.map((cast) => (
              <CastListItem key={cast.id} cast={cast} isSelected={selectedCastId === cast.id} onSelect={selectCast} />
            ))
          )}
        </div>
      </div>

      {selectedCast ? (
        <div className={`${shared.managementDetailPanel} ${shared.customScrollbar}`}>
          <div className={styles.ngDetailHeader}>
            <span className={shared.managementDetailLabel}>{getMsg('NGUserManagementPage.castNgHeading', { castName: selectedCast.name })}</span>
          </div>
          <div className={`${styles.ngPage__addRow} ${styles.ngPage__addRowSpaced}`}>
            <input type="text" className={`${shared.formInput} ${styles.ngPage__addInputName}`} placeholder={getMsg('NGUserManagementPage.usernamePlaceholder')} aria-label={getMsg('NGUserManagementPage.usernamePlaceholder')} value={form.username} onChange={handleUsernameChange} />
            <input type="text" className={`${shared.formInput} ${styles.ngPage__addInputId}`} placeholder={getMsg('NGUserManagementPage.xIdPlaceholder')} aria-label={getMsg('NGUserManagementPage.xIdPlaceholder')} value={form.accountId} onChange={handleAccountIdChange} onKeyDown={handleAddInputKeyDown} />
            <input type="text" className={`${shared.formInput} ${styles.ngPage__addInputNotes}`} placeholder={getMsg('NGUserManagementPage.optionalReasonAndNotes')} aria-label={getMsg('NGUserManagementPage.optionalReasonAndNotes')} value={form.notes} onChange={handleNotesChange} onKeyDown={handleAddInputKeyDown} />
            <button type="button" className={`${shared.btnPrimary} ${shared.btnFixedH}`} disabled={isSaving} onClick={handleAddClick}>{isSaving ? getMsg('common.saving') : getMsg('common.add')}</button>
          </div>
          <div className={shared.managementDetailDivider} />
          {(selectedCast.ng_entries?.length ?? 0) === 0 ? (
            <div className={styles.ngDetailEmpty}>{getMsg('NGUserManagementPage.noNgRegistrations')}</div>
          ) : (
            <div className={styles.ngDetailList}>
              {selectedCast.ng_entries?.map((entry, entryIndex) => {
                const entryKey = `${selectedCast.id}-${entry.username}-${entry.accountId}-${entryIndex}`;
                return (
                  <CastNgEntryRow
                    key={entryKey}
                    castId={selectedCast.id}
                    entry={entry}
                    entryIndex={entryIndex}
                    isSaving={isSaving}
                    onRequestDelete={requestDelete}
                    onUpdateNotes={updateNotes}
                    onRequestProfileLink={onRequestProfileLink}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className={shared.managementDetailEmpty}>
          <span>{getMsg('NGUserManagementPage.selectCastPrompt')}</span>
        </div>
      )}
    </div>
  );
}
