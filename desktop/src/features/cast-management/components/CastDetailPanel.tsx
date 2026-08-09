import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { Camera, ExternalLink, Pencil, Plus, User } from 'lucide-react';
import type { CastBean } from '@/common/types/entities';
import { registerPendingPageCommit } from '@/common/pageCommitRegistry';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../CastManagementPage.module.css';
import {
  getContactMarker,
  getEditableContactUrls,
  getOpenableContactUrl,
  type ContactMarkerKind,
  type EventMutationResult,
} from '../castManagementModel';

interface AliasRowProps {
  castName: string;
  alias: string;
  aliasIndex: number;
  disabled: boolean;
  onUpdate: (aliasIndex: number, nextAlias: string) => Promise<EventMutationResult>;
  onDelete: (aliasIndex: number) => void;
}

const AliasRow = ({ castName, alias, aliasIndex, disabled, onUpdate, onDelete }: AliasRowProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const commitPromiseRef = useRef<Promise<boolean> | null>(null);
  const commitValue = useCallback((): Promise<boolean> => {
    if (commitPromiseRef.current) return commitPromiseRef.current;
    const input = inputRef.current;
    if (!input || input.value === alias) return Promise.resolve(true);

    const commitPromise = onUpdate(aliasIndex, input.value)
      .then((result) => {
        if (result === 'stale') return false;
        input.value = result === 'saved' ? input.value.trim() : alias;
        return result === 'saved';
      })
      .catch(() => {
        input.value = alias;
        return false;
      })
      .finally(() => {
        commitPromiseRef.current = null;
      });
    commitPromiseRef.current = commitPromise;
    return commitPromise;
  }, [alias, aliasIndex, onUpdate]);

  useEffect(
    () => registerPendingPageCommit(commitValue),
    [commitValue],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };
  const handleBlur = () => { void commitValue(); };
  // 削除ボタン押下時は入力欄のblur保存を先行させず、削除操作だけを実行する。
  const handleDeleteMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };
  const handleDeleteClick = () => onDelete(aliasIndex);
  const inputAriaLabel = getMsg('CastManagementPage.aliasInputAriaLabel', {
    castName,
    index: aliasIndex + 1,
  });

  return (
    <div className={styles.castAliasItem}>
      <input ref={inputRef} type="text" className={styles.castAliasInput} defaultValue={alias} disabled={disabled} aria-label={inputAriaLabel} onKeyDown={handleKeyDown} onBlur={handleBlur} />
      <button type="button" className={`${styles.castContactBtn} ${styles.castContactBtnDelete}`} aria-label={getMsg('CastManagementPage.deleteAliasAriaLabel', { alias })} disabled={disabled} onMouseDown={handleDeleteMouseDown} onClick={handleDeleteClick}>×</button>
    </div>
  );
};

interface AliasEditorProps {
  cast: CastBean;
  inputAlias: string;
  isSaving: boolean;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onUpdate: (aliasIndex: number, nextAlias: string) => Promise<EventMutationResult>;
  onDelete: (aliasIndex: number) => void;
}

const AliasEditor = ({ cast, inputAlias, isSaving, onInputChange, onAdd, onUpdate, onDelete }: AliasEditorProps) => {
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onInputChange(event.currentTarget.value);
  };
  const handleAddKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onAdd();
  };

  return (
    <div className={styles.castAliasSection}>
      <div className={styles.castAliasHeader}>
        <span className={shared.managementDetailLabel}>{getMsg('CastManagementPage.aliasLabel')}</span>
        <span className={styles.castAliasHint}>{getMsg('CastManagementPage.aliasHint')}</span>
      </div>
      {(cast.aliases?.length ?? 0) > 0 && (
        <div className={styles.castAliasList}>
          {cast.aliases?.map((alias, aliasIndex) => (
            <AliasRow
              key={`${cast.id}-${alias}-${aliasIndex}`}
              castName={cast.name}
              alias={alias}
              aliasIndex={aliasIndex}
              disabled={isSaving}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
      <div className={styles.castAliasAddRow}>
        <input type="text" className={styles.castAliasInput} placeholder={getMsg('CastManagementPage.addAliasPlaceholder')} aria-label={getMsg('CastManagementPage.addAliasPlaceholder')} value={inputAlias} disabled={isSaving} onChange={handleInputChange} onKeyDown={handleAddKeyDown} />
        <button type="button" className={styles.castAliasAddBtn} disabled={isSaving || !inputAlias.trim()} onClick={onAdd}><Plus size={13} />{getMsg('common.add')}</button>
      </div>
    </div>
  );
};

function getContactMarkerClassName(kind: ContactMarkerKind): string {
  switch (kind) {
    case 'externalChat': return `${styles.castContactMarker} ${styles.castContactMarkerExternalChat}`;
    case 'vrchat': return `${styles.castContactMarker} ${styles.castContactMarkerVrchat}`;
    case 'x': return `${styles.castContactMarker} ${styles.castContactMarkerX}`;
    case 'https': return `${styles.castContactMarker} ${styles.castContactMarkerHttps}`;
    case 'text': return `${styles.castContactMarker} ${styles.castContactMarkerText}`;
    default: return styles.castContactMarker;
  }
}

interface ContactRowProps {
  url: string;
  index: number;
  onChange: (index: number, value: string) => void;
  onOpen: (url: string) => void;
  onDelete: (index: number) => void;
}

const ContactRow = ({ url, index, onChange, onOpen, onDelete }: ContactRowProps) => {
  const marker = getContactMarker(url);
  const canOpen = getOpenableContactUrl(url) !== null;
  const contactAriaLabel = `${getMsg('CastManagementPage.contactLabel')}${index + 1}`;
  const openLinkAriaLabel = `${contactAriaLabel}: ${canOpen ? getMsg('common.openLink') : getMsg('CastManagementPage.openLinkHint')}`;
  const deleteAriaLabel = getMsg('CastManagementPage.deleteContactAriaLabel', { index: index + 1 });

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(index, event.currentTarget.value);
  };
  const handleOpen = () => onOpen(url);
  const handleDelete = () => onDelete(index);

  return (
    <div className={styles.castContactItem}>
      <div className={styles.castContactInputWrap}>
        <span className={getContactMarkerClassName(marker.kind)}>{marker.label}</span>
        <input type="text" className={styles.castContactInput} placeholder={getMsg('CastManagementPage.contactUrlPlaceholder')} aria-label={contactAriaLabel} value={url} onChange={handleChange} />
      </div>
      <button type="button" className={`${styles.castContactBtn} ${styles.castContactBtnOpen}`} disabled={!canOpen} aria-label={openLinkAriaLabel} onClick={handleOpen}><ExternalLink size={13} /></button>
      <button type="button" className={`${styles.castContactBtn} ${styles.castContactBtnDelete}`} aria-label={deleteAriaLabel} onClick={handleDelete}>×</button>
    </div>
  );
};

interface ContactEditorProps {
  cast: CastBean;
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onOpen: (url: string) => void;
  onDelete: (index: number) => void;
}

const ContactEditor = ({ cast, onChange, onAdd, onOpen, onDelete }: ContactEditorProps) => {
  const contactHeadingId = useId();

  return (
    <div className={styles.castContactSection} role="group" aria-labelledby={contactHeadingId}>
      <span id={contactHeadingId} className={shared.managementDetailLabel}>{getMsg('CastManagementPage.contactLabel')}</span>
      <div className={styles.castContactList}>
        {getEditableContactUrls(cast).map((url, index) => (
          <ContactRow key={`${cast.id}-${index}`} url={url} index={index} onChange={onChange} onOpen={onOpen} onDelete={onDelete} />
        ))}
        <button type="button" className={styles.castContactAddBtn} onClick={onAdd}><Plus size={13} />{getMsg('CastManagementPage.addContact')}</button>
      </div>
    </div>
  );
};

export interface CastDetailPanelProps {
  cast: CastBean | null;
  inputAlias: string;
  isSavingAliases: boolean;
  memoEditing: boolean;
  onPhotoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDeleteCast: () => void;
  onRenameCast: (nextName: string) => Promise<EventMutationResult>;
  onGroupNameChange: (groupName: string | undefined) => Promise<EventMutationResult>;
  onAliasInputChange: (value: string) => void;
  onAddAlias: () => void;
  onUpdateAlias: (aliasIndex: number, nextAlias: string) => Promise<EventMutationResult>;
  onDeleteAlias: (aliasIndex: number) => void;
  onMemoEditingChange: (editing: boolean) => void;
  onMemoChange: (memo: string | undefined) => Promise<EventMutationResult>;
  onContactChange: (index: number, value: string) => void;
  onAddContact: () => void;
  onOpenContact: (url: string) => void;
  onDeleteContact: (index: number) => void;
}

export const CastDetailPanel = ({
  cast,
  inputAlias,
  isSavingAliases,
  memoEditing,
  onPhotoUpload,
  onDeleteCast,
  onRenameCast,
  onGroupNameChange,
  onAliasInputChange,
  onAddAlias,
  onUpdateAlias,
  onDeleteAlias,
  onMemoEditingChange,
  onMemoChange,
  onContactChange,
  onAddContact,
  onOpenContact,
  onDeleteContact,
}: CastDetailPanelProps) => {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const groupNameInputRef = useRef<HTMLInputElement>(null);
  const memoInputRef = useRef<HTMLTextAreaElement>(null);
  const nameCommitPromiseRef = useRef<Promise<boolean> | null>(null);
  const groupCommitPromiseRef = useRef<Promise<boolean> | null>(null);
  const memoCommitPromiseRef = useRef<Promise<boolean> | null>(null);
  const groupNameInputId = useId();
  const profileLabelId = useId();

  const commitName = useCallback((): Promise<boolean> => {
    if (nameCommitPromiseRef.current) return nameCommitPromiseRef.current;
    const input = nameInputRef.current;
    if (!cast || !input) return Promise.resolve(true);
    if (input.value.trim() === cast.name) {
      input.value = cast.name;
      return Promise.resolve(true);
    }

    const commitPromise = onRenameCast(input.value)
      .then((result) => {
        if (result === 'stale') return false;
        input.value = result === 'saved' ? input.value.trim() : cast.name;
        return result === 'saved';
      })
      .catch(() => {
        input.value = cast.name;
        return false;
      })
      .finally(() => {
        nameCommitPromiseRef.current = null;
      });
    nameCommitPromiseRef.current = commitPromise;
    return commitPromise;
  }, [cast, onRenameCast]);

  const commitGroupName = useCallback((): Promise<boolean> => {
    if (groupCommitPromiseRef.current) return groupCommitPromiseRef.current;
    const input = groupNameInputRef.current;
    if (!cast || !input) return Promise.resolve(true);
    const groupName = input.value.trim() || undefined;
    if (groupName === cast.group_name) {
      input.value = cast.group_name ?? '';
      return Promise.resolve(true);
    }

    const commitPromise = onGroupNameChange(groupName)
      .then((result) => {
        if (result === 'stale') return false;
        input.value = result === 'saved' ? (groupName ?? '') : (cast.group_name ?? '');
        return result === 'saved';
      })
      .catch(() => {
        input.value = cast.group_name ?? '';
        return false;
      })
      .finally(() => {
        groupCommitPromiseRef.current = null;
      });
    groupCommitPromiseRef.current = commitPromise;
    return commitPromise;
  }, [cast, onGroupNameChange]);

  const commitMemo = useCallback((): Promise<boolean> => {
    if (memoCommitPromiseRef.current) return memoCommitPromiseRef.current;
    const input = memoInputRef.current;
    if (!cast || !input) return Promise.resolve(true);
    const memo = input.value.trim() || undefined;
    if (memo === cast.memo) {
      onMemoEditingChange(false);
      return Promise.resolve(true);
    }

    const commitPromise = onMemoChange(memo)
      .then((result) => {
        if (result === 'saved') onMemoEditingChange(false);
        return result === 'saved';
      })
      .catch(() => false)
      .finally(() => {
        memoCommitPromiseRef.current = null;
      });
    memoCommitPromiseRef.current = commitPromise;
    return commitPromise;
  }, [cast, onMemoChange, onMemoEditingChange]);

  const commitPendingFields = useCallback(async (): Promise<boolean> => {
    if (!await commitName()) return false;
    if (!await commitGroupName()) return false;
    return commitMemo();
  }, [commitGroupName, commitMemo, commitName]);

  useEffect(
    () => registerPendingPageCommit(commitPendingFields),
    [commitPendingFields],
  );

  if (!cast) {
    return (
      <div className={`${shared.managementDetailEmpty} ${styles.castPanelHeight}`}>
        <User size={36} className={shared.managementDetailEmpty__icon} />
        <p>{getMsg('CastManagementPage.selectCastPrompt')}</p>
      </div>
    );
  }

  const handlePhotoFrameClick = () => photoInputRef.current?.click();
  const handleCastNameBlur = () => { void commitName(); };
  const handleGroupNameBlur = () => { void commitGroupName(); };
  const handleMemoEditClick = () => onMemoEditingChange(true);
  const handleMemoBlur = () => { void commitMemo(); };
  const memoTextClassName = `${styles.castCharMemo__text}${
    cast.memo ? '' : ` ${styles.castCharMemo__textEmpty}`
  }`;
  const photoFrameAriaLabel = getMsg('CastManagementPage.photoFrameAriaLabel', { castName: cast.name });

  return (
    <div className={`${shared.managementDetailPanel} ${styles.castPanelHeight} ${shared.customScrollbar}`}>
      <div className={styles.castCharProfileLayout}>
        <div className={styles.castCharPhotoCol}>
          <button type="button" className={styles.castCharPhotoFrame} aria-label={photoFrameAriaLabel} onClick={handlePhotoFrameClick}>
            {cast.photo_data_url ? (
              <img src={cast.photo_data_url} alt={cast.name} className={styles.castCharPhotoFrame__img} />
            ) : (
              <span className={styles.castCharPhotoFrame__placeholder}><User size={36} className={styles.castCharPhotoFrame__placeholderIcon} /><span className={styles.castCharPhotoFrame__placeholderText}>{getMsg('CastManagementPage.addPhoto')}</span></span>
            )}
            <span className={styles.castCharPhotoFrame__overlay}><Camera size={16} /><span>{getMsg('common.change')}</span></span>
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" className={styles.castPhotoInputHidden} onChange={onPhotoUpload} />
          <button type="button" className={styles.castCharDeleteBtn} onClick={onDeleteCast}>{getMsg('CastManagementPage.deleteCast')}</button>
        </div>

        <div className={styles.castCharInfoCol}>
          <input ref={nameInputRef} type="text" className={styles.castCharNameInput} defaultValue={cast.name} aria-label={getMsg('CastManagementPage.addCastPlaceholder')} onBlur={handleCastNameBlur} />
          <div className={styles.castGroupSection}>
            <label htmlFor={groupNameInputId} className={shared.managementDetailLabel}>{getMsg('CastManagementPage.groupLabel')}</label>
            <input ref={groupNameInputRef} id={groupNameInputId} type="text" className={styles.castGroupInput} defaultValue={cast.group_name ?? ''} placeholder={getMsg('CastManagementPage.groupPlaceholder')} onBlur={handleGroupNameBlur} />
          </div>

          <div className={styles.castCharMemoSection}>
            <div className={styles.castCharMemoHeader}>
              <span id={profileLabelId} className={shared.managementDetailLabel}>{getMsg('CastManagementPage.profileLabel')}</span>
              {!memoEditing && (
                <button type="button" className={styles.castCharMemoEditBtn} aria-label={getMsg('CastManagementPage.editProfileAriaLabel')} onClick={handleMemoEditClick}><Pencil size={12} /></button>
              )}
            </div>
            {memoEditing ? (
              <textarea ref={memoInputRef} autoFocus className={`${styles.castCharMemo__textarea} ${shared.customScrollbar}`} defaultValue={cast.memo ?? ''} placeholder={getMsg('CastManagementPage.profilePlaceholder')} aria-labelledby={profileLabelId} rows={5} onBlur={handleMemoBlur} />
            ) : (
              <button type="button" className={memoTextClassName} onClick={handleMemoEditClick}>{cast.memo ?? getMsg('CastManagementPage.profilePrompt')}</button>
            )}
          </div>

          <div className={styles.castCharDivider} />

          <AliasEditor
            cast={cast}
            inputAlias={inputAlias}
            isSaving={isSavingAliases}
            onInputChange={onAliasInputChange}
            onAdd={onAddAlias}
            onUpdate={onUpdateAlias}
            onDelete={onDeleteAlias}
          />

          <div className={styles.castCharDivider} />

          <ContactEditor cast={cast} onChange={onContactChange} onAdd={onAddContact} onOpen={onOpenContact} onDelete={onDeleteContact} />
        </div>
      </div>
    </div>
  );
};
