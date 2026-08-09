import { useId, useRef, type ChangeEvent, type MouseEvent } from 'react';
import { Camera, Database, FileText, RefreshCw } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import { EVENT_NAME_MAX_LENGTH } from '../eventNameValidation';
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
  isMutating: boolean;
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
  isMutating,
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
  const isMetaEditable = isCurrent && metaLoadStatus === 'ready';
  const canEditMeta = isMetaEditable && !isMutating;

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
  // 名称・メモのblur保存でボタンが無効化される前に、Page側の明示commitへ操作を渡す。
  const handleBoundaryMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (!isMutating) event.preventDefault();
  };

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
  const photoPlaceholder = metaLoadStatus === 'failed'
    ? getMsg('EventManagementPage.metaUnavailable')
    : metaLoadStatus === 'ready'
      ? getMsg(isCurrent ? 'EventManagementPage.addPhotoPrompt' : 'EventManagementPage.noPhoto')
      : getMsg('common.loading');
  const notesPlaceholder = metaLoadStatus === 'failed'
    ? getMsg('EventManagementPage.metaUnavailable')
    : metaLoadStatus === 'ready'
      ? getMsg(isCurrent ? 'EventManagementPage.editNotesPrompt' : 'EventManagementPage.noNotes')
      : getMsg('common.loading');
  const switchButtonContent = isCurrent
    ? <><Database size={13} /> {getMsg('EventManagementPage.currentStatus')}</>
    : <><RefreshCw size={13} /> {getMsg('EventManagementPage.switchAction')}</>;
  const photoFrameContent = photoDataUrl ? (
    <>
      <img src={photoDataUrl} className={styles.eventCharPhotoFrame__img} alt={isMetaEditable ? '' : getMsg('EventManagementPage.eventPhotoAlt', { eventName: selectedName })} />
      {canEditMeta && (
        <span className={styles.eventCharPhotoFrame__overlay}><Camera size={20} /><span>{getMsg('common.change')}</span></span>
      )}
    </>
  ) : (
    <span className={styles.eventCharPhotoFrame__placeholder}><Camera size={36} className={styles.eventCharPhotoFrame__placeholderIcon} /><span className={styles.eventCharPhotoFrame__placeholderText}>{photoPlaceholder}</span></span>
  );

  return (
    <section className={styles.eventCharPanel}>
      <div className={styles.eventCharContent}>
        {isCurrent ? (
          <input type="text" className={styles.eventCharNameInput} aria-label={getMsg('EventManagementPage.addPlaceholder')} value={editName} maxLength={EVENT_NAME_MAX_LENGTH} disabled={isMutating} onChange={handleEditNameChange} onBlur={handleEditNameBlur} />
        ) : (
          <h2 className={`${styles.eventCharNameInput} ${styles.eventCharReadOnly}`}>{selectedName}</h2>
        )}

        <input ref={photoInputRef} type="file" accept="image/*" className={styles.eventPhotoInput} disabled={!canEditMeta} onChange={onPhotoChange} />
        {isMetaEditable ? (
          <button type="button" className={photoFrameClassName} disabled={!canEditMeta} aria-label={getMsg('EventManagementPage.changePhotoAriaLabel')} onClick={handlePhotoFrameClick}>{photoFrameContent}</button>
        ) : (
          <div className={photoFrameClassName}>{photoFrameContent}</div>
        )}

        <div className={styles.eventCharDivider} />

        <div className={styles.eventCharMemoSection}>
          <div className={styles.eventCharMemoHeader}>
            <span id={notesLabelId} className={shared.managementDetailLabel}><FileText size={11} className={styles.eventNotesIcon} />{getMsg('EventManagementPage.notesLabel')}</span>
          </div>
          {editingNotes && canEditMeta ? (
            <textarea className={`${styles.eventCharMemoTextarea} ${shared.customScrollbar}`} aria-labelledby={notesLabelId} rows={6} value={editNotes} onChange={handleEditNotesChange} onBlur={handleNotesBlur} autoFocus />
          ) : isMetaEditable ? (
            <button type="button" className={memoTextClassName} disabled={!canEditMeta} aria-labelledby={notesLabelId} onClick={handleNotesClick}>{editNotes || notesPlaceholder}</button>
          ) : (
            <div className={memoTextClassName} aria-labelledby={notesLabelId}>{editNotes || notesPlaceholder}</div>
          )}
        </div>

        <div className={styles.eventCharDivider} />

        <div className={styles.eventCharActionRow}>
          <button type="button" className={switchButtonClassName} disabled={isCurrent || isMutating} onMouseDown={handleBoundaryMouseDown} onClick={handleSwitchClick}>{switchButtonContent}</button>
          {!isCurrent && <button type="button" className={styles.eventCharDeleteBtn} disabled={isMutating} onMouseDown={handleBoundaryMouseDown} onClick={handleDeleteClick}>{getMsg('common.delete')}</button>}
        </div>
      </div>
    </section>
  );
};
