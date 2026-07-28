import { useId, useRef, type ChangeEvent, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Camera, ExternalLink, Pencil, Plus, Trash2, User } from 'lucide-react';
import type { CastBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../CastManagementPage.module.css';
import {
  CONTACT_SITE_LINKS,
  getContactMarker,
  getEditableContactUrls,
  getOpenableContactUrl,
  type ContactMarkerKind,
  type ContactSiteLink,
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
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };
  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    void onUpdate(aliasIndex, input.value).then((result) => {
      if (result === 'stale') return;
      input.value = result === 'saved' ? input.value.trim() : alias;
    });
  };
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
      <input type="text" className={styles.castAliasInput} defaultValue={alias} disabled={disabled} aria-label={inputAriaLabel} onKeyDown={handleKeyDown} onBlur={handleBlur} />
      <button type="button" className={`${styles.castContactBtn} ${styles.castContactBtnDelete}`} aria-label={getMsg('CastManagementPage.deleteAliasAriaLabel', { alias })} disabled={disabled} onMouseDown={handleDeleteMouseDown} onClick={handleDeleteClick}><Trash2 size={13} /></button>
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

interface ContactSiteButtonProps {
  item: ContactSiteLink;
  onOpen: (url: string) => void;
}

const ContactSiteButton = ({ item, onOpen }: ContactSiteButtonProps) => {
  const handleClick = () => onOpen(item.url);

  return (
    <button type="button" className={`${styles.castContactQuickBtn} ${styles.castContactSiteBtn}`} onClick={handleClick}>
      <span className={styles.castContactQuickIcon}><ExternalLink size={12} /></span>
      <span className={styles.castContactQuickText}>
        <strong>{item.label}</strong>
        <small>{getMsg('CastManagementPage.openSite')}</small>
      </span>
    </button>
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
      <button type="button" className={`${styles.castContactBtn} ${styles.castContactBtnDelete}`} aria-label={deleteAriaLabel} onClick={handleDelete}><Trash2 size={13} /></button>
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
      <div className={styles.castContactSiteLinks}>
        <span className={styles.castContactSiteLabel}>{getMsg('CastManagementPage.externalSites')}</span>
        <div className={styles.castContactSiteActions}>
          {CONTACT_SITE_LINKS.map((item) => <ContactSiteButton key={item.key} item={item} onOpen={onOpen} />)}
        </div>
      </div>
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
  onMemoChange: (memo: string | undefined) => void;
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
  const profileLabelId = useId();

  if (!cast) {
    return (
      <div className={`${shared.managementDetailEmpty} ${styles.castPanelHeight}`}>
        <User size={36} className={shared.managementDetailEmpty__icon} />
        <p>{getMsg('CastManagementPage.selectCastPrompt')}</p>
      </div>
    );
  }

  const handlePhotoFrameClick = () => photoInputRef.current?.click();
  const handleCastNameBlur = (event: FocusEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    void onRenameCast(input.value).then((result) => {
      if (result === 'stale') return;
      input.value = result === 'saved' ? input.value.trim() : cast.name;
    });
  };
  const handleGroupNameBlur = (event: FocusEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const groupName = input.value.trim() || undefined;
    void onGroupNameChange(groupName).then((result) => {
      if (result === 'stale') return;
      input.value = result === 'saved' ? (groupName ?? '') : (cast.group_name ?? '');
    });
  };
  const handleMemoEditClick = () => onMemoEditingChange(true);
  const handleMemoBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    onMemoChange(event.currentTarget.value.trim() || undefined);
    onMemoEditingChange(false);
  };
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
          <input type="text" className={styles.castCharNameInput} defaultValue={cast.name} aria-label={getMsg('CastManagementPage.addCastPlaceholder')} onBlur={handleCastNameBlur} />
          <input type="text" className={styles.castCharGroupBadge} defaultValue={cast.group_name ?? ''} placeholder={getMsg('CastManagementPage.groupPlaceholder')} aria-label={getMsg('CastManagementPage.groupPlaceholder')} onBlur={handleGroupNameBlur} />

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

          <div className={styles.castCharMemoSection}>
            <div className={styles.castCharMemoHeader}>
              <span id={profileLabelId} className={shared.managementDetailLabel}>{getMsg('CastManagementPage.profileLabel')}</span>
              {!memoEditing && (
                <button type="button" className={styles.castCharMemoEditBtn} aria-label={getMsg('CastManagementPage.editProfileAriaLabel')} onClick={handleMemoEditClick}><Pencil size={12} /></button>
              )}
            </div>
            {memoEditing ? (
              <textarea autoFocus className={`${styles.castCharMemo__textarea} ${shared.customScrollbar}`} defaultValue={cast.memo ?? ''} placeholder={getMsg('CastManagementPage.profilePlaceholder')} aria-labelledby={profileLabelId} rows={5} onBlur={handleMemoBlur} />
            ) : (
              <button type="button" className={memoTextClassName} onClick={handleMemoEditClick}>{cast.memo ?? getMsg('CastManagementPage.profilePrompt')}</button>
            )}
          </div>

          <div className={styles.castCharDivider} />

          <ContactEditor cast={cast} onChange={onContactChange} onAdd={onAddContact} onOpen={onOpenContact} onDelete={onDeleteContact} />
        </div>
      </div>
    </div>
  );
};
