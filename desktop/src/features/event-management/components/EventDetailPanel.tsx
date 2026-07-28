import { useId, useRef, type ChangeEvent } from 'react';
import { Camera, Database, FileText, RefreshCw } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../EventManagementPage.module.css';

export type EventMetaLoadStatus = 'unavailable' | 'loading' | 'ready' | 'failed';

export interface EventDetailPanelProps {
  selectedName: string | null;
  editName: string;
  photoDataUrl: string | null;
  editNotes: string;
  editingNotes: boolean;
  isCurrent: boolean;
  metaLoadStatus: EventMetaLoadStatus;
  onEditNameChange: (value: string) => void;
  onCommitName: () => void | Promise<void>;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartNotesEditing: () => void;
  onEditNotesChange: (value: string) => void;
  onCommitNotes: () => void | Promise<void>;
  onRequestSwitch: (eventName: string) => void;
  onRequestDelete: (eventName: string) => void;
}

export const EventDetailPanel = ({
  selectedName,
  editName,
  photoDataUrl,
  editNotes,
  editingNotes,
  isCurrent,
  metaLoadStatus,
  onEditNameChange,
  onCommitName,
  onPhotoChange,
  onStartNotesEditing,
  onEditNotesChange,
  onCommitNotes,
  onRequestSwitch,
  onRequestDelete,
}: EventDetailPanelProps) => {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const notesLabelId = useId();
  const canEditMeta = isCurrent && metaLoadStatus === 'ready';

  if (!selectedName) {
    return (
      <div className={shared.managementDetailEmpty}>
        <Database size={40} className={shared.managementDetailEmpty__icon} />
        <span>{getMsg('EventManagementPage.selectEvent')}</span>
      </div>
    );
  }

  const handleEditNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onEditNameChange(event.currentTarget.value);
  };
  const handleEditNameBlur = () => { void onCommitName(); };
  const handlePhotoFrameClick = () => {
    if (canEditMeta) photoInputRef.current?.click();
  };
  const handleNotesClick = () => {
    if (canEditMeta) onStartNotesEditing();
  };
  const handleEditNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onEditNotesChange(event.currentTarget.value);
  };
  const handleNotesBlur = () => { void onCommitNotes(); };
  const handleSwitchClick = () => onRequestSwitch(selectedName);
  const handleDeleteClick = () => onRequestDelete(selectedName);

  const memoTextClassName = `${styles.eventCharMemoText} ${
    editNotes ? '' : styles.eventCharMemoTextEmpty
  } ${
    canEditMeta ? '' : styles.eventCharReadOnly
  }`;
  const switchButtonClassName = `${styles.eventCharSwitchBtn} ${
    isCurrent ? styles.eventCharSwitchBtnCurrent : ''
  }`;
  const photoFrameClassName = `${styles.eventCharPhotoFrame} ${
    canEditMeta ? '' : styles.eventCharReadOnly
  }`;
  const photoPlaceholder = !isCurrent
    ? getMsg('EventManagementPage.currentOnly')
    : metaLoadStatus === 'failed'
      ? getMsg('EventManagementPage.metaUnavailable')
      : metaLoadStatus === 'ready'
        ? getMsg('EventManagementPage.addPhotoPrompt')
        : getMsg('common.loading');
  const notesPlaceholder = !isCurrent
    ? getMsg('EventManagementPage.currentOnly')
    : metaLoadStatus === 'failed'
      ? getMsg('EventManagementPage.metaUnavailable')
      : metaLoadStatus === 'ready'
        ? getMsg('EventManagementPage.editNotesPrompt')
        : getMsg('common.loading');
  const switchButtonContent = isCurrent
    ? <><Database size={13} /> {getMsg('EventManagementPage.currentStatus')}</>
    : <><RefreshCw size={13} /> {getMsg('EventManagementPage.switchAction')}</>;

  return (
    <section className={styles.eventCharPanel}>
      <div className={styles.eventCharContent}>
        <input type="text" className={styles.eventCharNameInput} aria-label={getMsg('EventManagementPage.addPlaceholder')} value={editName} onChange={handleEditNameChange} onBlur={handleEditNameBlur} />

        <input ref={photoInputRef} type="file" accept="image/*" className={styles.eventPhotoInput} disabled={!canEditMeta} onChange={onPhotoChange} />
        <button
          type="button"
          className={photoFrameClassName}
          disabled={!canEditMeta}
          aria-label={getMsg('EventManagementPage.changePhotoAriaLabel')}
          onClick={handlePhotoFrameClick}
        >
          {photoDataUrl ? (
            <>
              <img src={photoDataUrl} className={styles.eventCharPhotoFrame__img} alt="" />
              {canEditMeta && (
                <span className={styles.eventCharPhotoFrame__overlay}><Camera size={20} /><span>{getMsg('common.change')}</span></span>
              )}
            </>
          ) : (
            <span className={styles.eventCharPhotoFrame__placeholder}><Camera size={36} className={styles.eventCharPhotoFrame__placeholderIcon} /><span className={styles.eventCharPhotoFrame__placeholderText}>{photoPlaceholder}</span></span>
          )}
        </button>

        <div className={styles.eventCharDivider} />

        <div className={styles.eventCharMemoSection}>
          <div className={styles.eventCharMemoHeader}>
            <span id={notesLabelId} className={shared.managementDetailLabel}><FileText size={11} className={styles.eventNotesIcon} />{getMsg('EventManagementPage.notesLabel')}</span>
          </div>
          {editingNotes && canEditMeta ? (
            <textarea className={`${styles.eventCharMemoTextarea} ${shared.customScrollbar}`} aria-labelledby={notesLabelId} rows={6} value={editNotes} onChange={handleEditNotesChange} onBlur={handleNotesBlur} autoFocus />
          ) : (
            <button type="button" className={memoTextClassName} disabled={!canEditMeta} onClick={handleNotesClick}>{editNotes || notesPlaceholder}</button>
          )}
        </div>

        <div className={styles.eventCharDivider} />

        <div className={styles.eventCharActionRow}>
          <button type="button" className={switchButtonClassName} disabled={isCurrent} onClick={handleSwitchClick}>{switchButtonContent}</button>
          {!isCurrent && <button type="button" className={styles.eventCharDeleteBtn} onClick={handleDeleteClick}>{getMsg('common.delete')}</button>}
        </div>
      </div>
    </section>
  );
};
