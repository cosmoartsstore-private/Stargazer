// 出席履歴の回数と日付列へ適用する集計期間を入力するダイアログ。

import { useId, useState, type FormEvent } from 'react';
import { AppDialog } from '@/components/AppDialog';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../AttendancePage.module.css';
import { parseRecordDate } from '../models/recordDate';
import type { AttendancePeriod } from '../models/types';
import { AttendanceDateField } from './AttendanceDateField';

interface AttendancePeriodDialogProps {
  period: AttendancePeriod;
  onApply: (period: AttendancePeriod) => void;
  onClose: () => void;
}

export function AttendancePeriodDialog({ period, onApply, onClose }: AttendancePeriodDialogProps) {
  const [draftPeriod, setDraftPeriod] = useState<AttendancePeriod>(period);
  const [openCalendar, setOpenCalendar] = useState<'start' | 'end' | null>(null);
  const startDateInputId = useId();
  const endDateInputId = useId();
  const validationErrorId = useId();
  const hasInvalidStartDate = Boolean(draftPeriod.startDate && !parseRecordDate(draftPeriod.startDate));
  const hasInvalidEndDate = Boolean(draftPeriod.endDate && !parseRecordDate(draftPeriod.endDate));
  const hasInvalidRange = Boolean(
    !hasInvalidStartDate
    && !hasInvalidEndDate
    && draftPeriod.startDate
    && draftPeriod.endDate
    && draftPeriod.startDate > draftPeriod.endDate,
  );
  const hasValidationError = hasInvalidStartDate || hasInvalidEndDate || hasInvalidRange;
  const validationErrorDescription = hasValidationError ? validationErrorId : undefined;
  const validationMessage = hasInvalidStartDate || hasInvalidEndDate
    ? getMsg('AttendancePeriodDialog.invalidDate')
    : getMsg('AttendancePeriodDialog.invalidRange');
  const validStartDate = hasInvalidStartDate ? undefined : draftPeriod.startDate || undefined;
  const validEndDate = hasInvalidEndDate ? undefined : draftPeriod.endDate || undefined;

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleStartDateChange = (value: string) => {
    setDraftPeriod((current) => ({ ...current, startDate: value }));
  };

  const handleEndDateChange = (value: string) => {
    setDraftPeriod((current) => ({ ...current, endDate: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasValidationError) onApply(draftPeriod);
  };

  const handleReset = () => {
    setDraftPeriod({ startDate: '', endDate: '' });
    setOpenCalendar(null);
  };

  const handleStartCalendarOpenChange = (open: boolean) => setOpenCalendar(open ? 'start' : null);
  const handleEndCalendarOpenChange = (open: boolean) => setOpenCalendar(open ? 'end' : null);

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
            <AttendanceDateField id={startDateInputId} value={draftPeriod.startDate} onValueChange={handleStartDateChange} autoFocus max={validEndDate} ariaInvalid={hasInvalidStartDate || hasInvalidRange} ariaDescribedBy={validationErrorDescription} calendarOpen={openCalendar === 'start'} onCalendarOpenChange={handleStartCalendarOpenChange} />
          </div>
          <div className={styles.attendancePeriodField}>
            <label htmlFor={endDateInputId}>{getMsg('AttendancePeriodDialog.endDate')}</label>
            <AttendanceDateField id={endDateInputId} value={draftPeriod.endDate} onValueChange={handleEndDateChange} min={validStartDate} ariaInvalid={hasInvalidEndDate || hasInvalidRange} ariaDescribedBy={validationErrorDescription} calendarOpen={openCalendar === 'end'} onCalendarOpenChange={handleEndCalendarOpenChange} />
          </div>
        </div>

        {hasValidationError && <p id={validationErrorId} className={styles.attendancePeriodError} role="alert">{validationMessage}</p>}

        <div className={styles.attendancePeriodActions}>
          <button type="button" className={`${shared.btnSecondary} ${styles.attendancePeriodReset}`} onClick={handleReset}>{getMsg('AttendancePeriodDialog.reset')}</button>
          <button type="button" className={shared.btnSecondary} onClick={onClose}>{getMsg('common.cancel')}</button>
          <button type="submit" className={shared.btnPrimary} disabled={hasValidationError}>{getMsg('AttendancePeriodDialog.apply')}</button>
        </div>
      </form>
    </AppDialog>
  );
}
