// 出席履歴の回数と日付列へ適用する集計期間を入力するダイアログ。

import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { AppDialog } from '@/components/AppDialog';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../AttendancePage.module.css';
import type { AttendancePeriod } from '../models/types';

interface AttendancePeriodDialogProps {
  period: AttendancePeriod;
  onApply: (period: AttendancePeriod) => void;
  onClose: () => void;
}

export function AttendancePeriodDialog({ period, onApply, onClose }: AttendancePeriodDialogProps) {
  const [draftPeriod, setDraftPeriod] = useState<AttendancePeriod>(period);
  const startDateInputId = useId();
  const endDateInputId = useId();
  const rangeErrorId = useId();
  const hasInvalidRange = Boolean(
    draftPeriod.startDate
    && draftPeriod.endDate
    && draftPeriod.startDate > draftPeriod.endDate,
  );
  const rangeErrorDescription = hasInvalidRange ? rangeErrorId : undefined;

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleStartDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftPeriod((current) => ({ ...current, startDate: event.target.value }));
  };

  const handleEndDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftPeriod((current) => ({ ...current, endDate: event.target.value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasInvalidRange) onApply(draftPeriod);
  };

  const handleShowAll = () => {
    onApply({ startDate: '', endDate: '' });
  };

  return (
    <AppDialog
      open
      onOpenChange={handleOpenChange}
      title={getMsg('AttendancePeriodDialog.dialogTitle')}
      description={getMsg('AttendancePeriodDialog.dialogDescription')}
      showClose
      className={styles.attendancePeriodDialog}
      descriptionClassName={styles.attendancePeriodDescription}
    >
      <form className={styles.attendancePeriodForm} onSubmit={handleSubmit}>
        <div className={styles.attendancePeriodFields}>
          <div className={styles.attendancePeriodField}>
            <label htmlFor={startDateInputId}>{getMsg('AttendancePeriodDialog.startDate')}</label>
            <input id={startDateInputId} type="date" autoFocus max={draftPeriod.endDate || undefined} value={draftPeriod.startDate} aria-invalid={hasInvalidRange || undefined} aria-describedby={rangeErrorDescription} onChange={handleStartDateChange} />
          </div>
          <div className={styles.attendancePeriodField}>
            <label htmlFor={endDateInputId}>{getMsg('AttendancePeriodDialog.endDate')}</label>
            <input id={endDateInputId} type="date" min={draftPeriod.startDate || undefined} value={draftPeriod.endDate} aria-invalid={hasInvalidRange || undefined} aria-describedby={rangeErrorDescription} onChange={handleEndDateChange} />
          </div>
        </div>

        {hasInvalidRange && <p id={rangeErrorId} className={styles.attendancePeriodError} role="alert">{getMsg('AttendancePeriodDialog.invalidRange')}</p>}

        <div className={styles.attendancePeriodActions}>
          <button type="button" className={`${shared.btnSecondary} ${styles.attendancePeriodShowAll}`} onClick={handleShowAll}>{getMsg('AttendancePeriodDialog.showAll')}</button>
          <button type="button" className={shared.btnSecondary} onClick={onClose}>{getMsg('common.cancel')}</button>
          <button type="submit" className={shared.btnPrimary} disabled={hasInvalidRange}>{getMsg('AttendancePeriodDialog.apply')}</button>
        </div>
      </form>
    </AppDialog>
  );
}
