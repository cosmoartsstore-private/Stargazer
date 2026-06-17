import { AppDialog } from '@/components/AppDialog';
import type { CastBean } from '@/common/types/entities';
import { CalendarDays } from '@/common/icons';
import shared from '@/styles/shared.module.css';
import styles from '../AttendancePage.module.css';

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatRecordDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

interface SaveAttendanceModalProps {
  presentCasts: CastBean[];
  presentCount: number;
  saving: boolean;
  recordDate: string;
  dateHasRecord: boolean;
  onClose: () => void;
  onRecordDateChange: (value: string) => void;
  onSave: () => Promise<void>;
}

export function SaveAttendanceModal({
  presentCasts,
  presentCount,
  saving,
  recordDate,
  dateHasRecord,
  onClose,
  onRecordDateChange,
  onSave,
}: SaveAttendanceModalProps) {
  const canSave = DATE_VALUE_PATTERN.test(recordDate);

  return (
    <AppDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="出席を記録する"
      showClose
      useDefaultContentClass={false}
      className={styles.saveModalPanel}
      headerClassName={styles.modalHeader}
      titleClassName={styles.modalTitle}
      closeClassName={styles.modalClose}
    >
      <div className={styles.saveModalBody}>
        <div className={styles.saveModalCol}>
          <span className={styles.saveModalColLabel}>記録日</span>
          <div className={styles.recordDateField}>
            <CalendarDays size={16} className={styles.recordDateIcon} aria-hidden />
            <input
              type="text"
              inputMode="numeric"
              className={styles.recordDateInput}
              placeholder="YYYY-MM-DD"
              maxLength={10}
              value={recordDate}
              onChange={(event) => onRecordDateChange(formatRecordDateInput(event.target.value))}
            />
          </div>
        </div>
        <div className={`${styles.saveModalCol} ${styles.saveModalColCenter}`}>
          <span className={styles.saveModalColLabel}>出席人数</span>
          <div className={styles.saveCountRow}>
            <span className={styles.saveCountNum}>{presentCount}</span>
            <span className={styles.saveCountUnit}>名</span>
          </div>
        </div>
        <div className={`${styles.saveModalCol} ${styles.saveModalColCasts}`}>
          <span className={styles.saveModalColLabel}>出席キャスト</span>
          <div className={styles.saveCastList}>
            {presentCasts.map((cast) => (
              <span key={cast.name} className={styles.saveCastItem}>{cast.name}</span>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.modalFooter}>
        {dateHasRecord && (
          <span className={styles.overwriteNote}>この日付のデータが既に存在します。上書きされます。</span>
        )}
        <button type="button" className={shared.btnSecondary} onClick={onClose}>
          キャンセル
        </button>
        <button type="button" className={shared.btnPrimary} disabled={saving || !canSave} onClick={() => { void onSave(); }}>
          {saving ? '保存中...' : dateHasRecord ? '上書きして保存' : '保存'}
        </button>
      </div>
    </AppDialog>
  );
}
