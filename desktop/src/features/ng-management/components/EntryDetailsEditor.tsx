import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
} from 'react';
import { Save } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import { useExclusiveMutation } from '../hooks/useExclusiveMutation';
import styles from '../NGUserManagementPage.module.css';

export interface EntryDetailsEditorProps {
  notes?: string;
  disabled: boolean;
  discardGeneration: number;
  saveTargetLabel?: string;
  onSave: (notes: string) => Promise<void>;
  onDirtyChange: (editorId: string, dirty: boolean) => void;
}

/** 保存済みの理由・メモとは分離した下書きを編集し、変更分だけを保存する。 */
export function EntryDetailsEditor({
  notes,
  disabled,
  discardGeneration,
  saveTargetLabel,
  onSave,
  onDirtyChange,
}: EntryDetailsEditorProps) {
  const notesInputId = useId();

  // 保存済み値と分離した編集下書き、および保存中状態。
  const [notesDraft, setNotesDraft] = useState(notes ?? '');
  const { isActive: isSaving, run: runSave } = useExclusiveMutation();

  useEffect(() => {
    setNotesDraft(notes ?? '');
  }, [discardGeneration, notes]);

  // 保存済み値との差分を導出する。
  const savedNotes = (notes ?? '').trim();
  const nextNotes = notesDraft.trim();
  const changed = nextNotes !== savedNotes;
  const editorClassName = `${styles.ngEntryDetails} ${styles.ngEntryDetailsCompact}`;

  useEffect(() => {
    onDirtyChange(notesInputId, changed);
    return () => onDirtyChange(notesInputId, false);
  }, [changed, notesInputId, onDirtyChange]);

  // 入力と保存ボタンから、同一の詳細保存処理へ接続する。
  async function save(): Promise<void> {
    if (!changed || disabled) return;
    await runSave(() => onSave(nextNotes));
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
  const saveLabel = isSaving
    ? getMsg('common.saving')
    : changed
      ? getMsg('EntryDetailsEditor.saveChanges')
      : getMsg('EntryDetailsEditor.saved');
  const saveAriaLabel = saveTargetLabel ? `${saveTargetLabel} ${saveLabel}` : saveLabel;

  return (
    <div className={editorClassName}>
      <label htmlFor={notesInputId} className={styles.ngEntryDetailsField}>
        <span className={styles.ngEntryDetailsLabel}>{getMsg('EntryDetailsEditor.reasonAndNotes')}</span>
        <textarea id={notesInputId} className={styles.ngEntryDetailsTextarea} placeholder={getMsg('EntryDetailsEditor.ngNotesPlaceholder')} rows={2} value={notesDraft} disabled={editorDisabled} onChange={handleNotesChange} />
      </label>
      <button type="button" className={styles.ngEntryDetailsSave} aria-label={saveAriaLabel} disabled={saveDisabled} onClick={handleSaveClick}><Save size={12} />{saveLabel}</button>
    </div>
  );
}
