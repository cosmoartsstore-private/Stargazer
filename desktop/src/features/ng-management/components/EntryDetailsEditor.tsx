import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Save } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import styles from '../NGUserManagementPage.module.css';

export interface EntryDetailsEditorProps {
  reason?: string;
  notes?: string;
  showReason?: boolean;
  disabled: boolean;
  saveTargetLabel?: string;
  onSave: (reason: string, notes: string) => Promise<void>;
}

/** 保存済みの理由・メモとは分離した下書きを編集し、変更分だけを保存する。 */
export function EntryDetailsEditor({
  reason,
  notes,
  showReason = false,
  disabled,
  saveTargetLabel,
  onSave,
}: EntryDetailsEditorProps) {
  const reasonInputId = useId();
  const notesInputId = useId();

  // 保存済み値と分離した編集下書き、および保存中状態。
  const [reasonDraft, setReasonDraft] = useState(reason ?? '');
  const [notesDraft, setNotesDraft] = useState(notes ?? '');
  const [isSaving, setIsSaving] = useState(false);

  // state反映前の連続操作でも、同じ下書きを二重保存しないための同期ガード。
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    setReasonDraft(reason ?? '');
    setNotesDraft(notes ?? '');
  }, [reason, notes]);

  // 保存済み値との差分と、現在の表示形式を導出する。
  const savedReason = (reason ?? '').trim();
  const savedNotes = (notes ?? '').trim();
  const nextReason = reasonDraft.trim();
  const nextNotes = notesDraft.trim();
  const changed = (showReason && nextReason !== savedReason) || nextNotes !== savedNotes;
  const editorClassName = [
    styles.ngEntryDetails,
    showReason ? '' : styles.ngEntryDetailsCompact,
  ].filter(Boolean).join(' ');

  // 入力と保存ボタンから、同一の詳細保存処理へ接続する。
  async function save(): Promise<void> {
    if (!changed || disabled || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      await onSave(nextReason, nextNotes);
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  function handleReasonChange(event: ChangeEvent<HTMLInputElement>): void {
    setReasonDraft(event.target.value);
  }

  function handleNotesChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    setNotesDraft(event.target.value);
  }

  function handleSaveClick(): void {
    void save();
  }

  // 保存可否と表示文言を現在の編集状態から確定する。
  const editorDisabled = disabled || isSaving;
  const saveDisabled = !changed || editorDisabled;
  const notesPlaceholder = showReason
    ? getMsg('EntryDetailsEditor.notesPlaceholder')
    : getMsg('EntryDetailsEditor.ngNotesPlaceholder');
  const saveLabel = isSaving
    ? getMsg('common.saving')
    : changed
      ? getMsg('EntryDetailsEditor.saveChanges')
      : getMsg('EntryDetailsEditor.saved');
  const saveAriaLabel = saveTargetLabel ? `${saveTargetLabel} ${saveLabel}` : saveLabel;

  return (
    <div className={editorClassName}>
      {showReason && (
        <label htmlFor={reasonInputId} className={styles.ngEntryDetailsField}>
          <span className={styles.ngEntryDetailsLabel}>{getMsg('EntryDetailsEditor.reason')}</span>
          <input id={reasonInputId} type="text" className={styles.ngEntryDetailsInput} placeholder={getMsg('EntryDetailsEditor.reasonPlaceholder')} value={reasonDraft} disabled={editorDisabled} onChange={handleReasonChange} />
        </label>
      )}
      <label htmlFor={notesInputId} className={styles.ngEntryDetailsField}>
        <span className={styles.ngEntryDetailsLabel}>{showReason ? getMsg('EntryDetailsEditor.notes') : getMsg('EntryDetailsEditor.reasonAndNotes')}</span>
        <textarea id={notesInputId} className={styles.ngEntryDetailsTextarea} placeholder={notesPlaceholder} rows={2} value={notesDraft} disabled={editorDisabled} onChange={handleNotesChange} />
      </label>
      <button type="button" className={styles.ngEntryDetailsSave} aria-label={saveAriaLabel} disabled={saveDisabled} onClick={handleSaveClick}><Save size={12} />{saveLabel}</button>
    </div>
  );
}
