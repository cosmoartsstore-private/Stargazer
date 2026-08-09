// 出欠記録の日付と参加キャストを確認して保存するモーダルを表示する。

import { useId } from 'react';
import { AppDialog } from '@/components/AppDialog';
import type { CastBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../AttendancePage.module.css';
import { parseRecordDate } from '../models/recordDate';
import type { AttendanceDateRecordStatus } from '../models/types';
import { AttendanceDateField } from './AttendanceDateField';

interface SaveAttendanceModalProps {
  presentCasts: CastBean[];
  presentCount: number;
  saving: boolean;
  recordDate: string;
  dateRecordStatus: AttendanceDateRecordStatus;
  onClose: () => void;
  onRecordDateChange: (value: string) => void;
  onSave: () => Promise<void>;
}

export function SaveAttendanceModal({
  presentCasts,
  presentCount,
  saving,
  recordDate,
  dateRecordStatus,
  onClose,
  onRecordDateChange,
  onSave,
}: SaveAttendanceModalProps) {
  // 入力日付と保存状況から、保存可否と表示文言を導出する。
  const parsedRecordDate = parseRecordDate(recordDate);
  const hasInvalidRecordDate = recordDate.length === 10 && parsedRecordDate === null;
  const canSave = parsedRecordDate !== null
    && (dateRecordStatus === 'absent' || dateRecordStatus === 'exists');
  const recordDateInputId = useId();
  const recordStatusMessageId = useId();
  const recordStatusMessage = hasInvalidRecordDate
    ? getMsg('SaveAttendanceModal.invalidDate')
    : dateRecordStatus === 'exists'
    ? getMsg('SaveAttendanceModal.overwriteNote')
    : dateRecordStatus === 'checking'
      ? getMsg('SaveAttendanceModal.checkingRecord')
      : dateRecordStatus === 'failed'
        ? getMsg('SaveAttendanceModal.recordCheckFailed')
        : null;
  const saveButtonLabel = saving
    ? getMsg('common.saving')
    : dateRecordStatus === 'exists'
      ? getMsg('SaveAttendanceModal.overwriteSave')
      : getMsg('common.save');

  // モーダルの開閉と保存操作を親へ委譲する。
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const handleSaveClick = () => { void onSave(); };

  return (
    <AppDialog
      open
      onOpenChange={handleOpenChange}
      title={getMsg('SaveAttendanceModal.dialogTitle')}
      showClose
      useDefaultContentClass={false}
      className={styles.saveModalPanel}
      headerClassName={styles.modalHeader}
      titleClassName={styles.modalTitle}
      closeClassName={styles.modalClose}
    >
      <div className={styles.saveModalBody}>
        <div className={styles.saveModalCol}>
          <label className={styles.saveModalColLabel} htmlFor={recordDateInputId}>{getMsg('SaveAttendanceModal.recordDate')}</label>
          <AttendanceDateField id={recordDateInputId} value={recordDate} onValueChange={onRecordDateChange} ariaInvalid={hasInvalidRecordDate} ariaDescribedBy={recordStatusMessage ? recordStatusMessageId : undefined} />
        </div>
        <div className={`${styles.saveModalCol} ${styles.saveModalColCenter}`}>
          <span className={styles.saveModalColLabel}>{getMsg('SaveAttendanceModal.attendeeCount')}</span>
          <div className={styles.saveCountRow}>
            <span className={styles.saveCountNum}>{presentCount}</span>
            <span className={styles.saveCountUnit}>{getMsg('SaveAttendanceModal.attendeeUnit')}</span>
          </div>
        </div>
        <div className={`${styles.saveModalCol} ${styles.saveModalColCasts}`}>
          <span className={styles.saveModalColLabel}>{getMsg('SaveAttendanceModal.attendingCasts')}</span>
          <div className={styles.saveCastList}>
            {presentCasts.map((cast) => (
              <span key={cast.id} className={styles.saveCastItem}>{cast.name}</span>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.modalFooter}>
        {recordStatusMessage && <span id={recordStatusMessageId} className={styles.overwriteNote} role={hasInvalidRecordDate || dateRecordStatus === 'failed' ? 'alert' : 'status'}>{recordStatusMessage}</span>}
        <div className={styles.modalFooterActions}>
          <button type="button" className={shared.btnSecondary} onClick={onClose}>{getMsg('common.cancel')}</button>
          <button type="button" className={`${shared.btnPrimary} ${styles.attendanceRecordButton}`} disabled={saving || !canSave} onClick={handleSaveClick}>{saveButtonLabel}</button>
        </div>
      </div>
    </AppDialog>
  );
}
