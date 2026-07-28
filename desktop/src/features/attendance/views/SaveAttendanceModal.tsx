// 出欠記録の日付と参加キャストを確認して保存するモーダルを表示する。

import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { AppDialog } from '@/components/AppDialog';
import type { CastBean } from '@/common/types/entities';
import { CalendarDays } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../AttendancePage.module.css';
import {
  buildCalendarDays,
  formatRecordDateInput,
  formatRecordDateValue,
  hasRecordDateFormat,
  parseRecordDate,
} from '../models/recordDate';
import type { AttendanceDateRecordStatus } from '../models/types';

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

interface CalendarDayButtonProps {
  date: Date;
  className: string;
  ariaLabel: string;
  selected: boolean;
  onSelect: (date: Date) => void;
}

function CalendarDayButton({ date, className, ariaLabel, selected, onSelect }: CalendarDayButtonProps) {
  const handleClick = () => onSelect(date);

  return <button type="button" className={className} aria-label={ariaLabel} aria-pressed={selected} onClick={handleClick}>{date.getDate()}</button>;
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
  // 入力日付とカレンダー表示から、保存・選択に必要な表示値を導出する。
  const canSave = hasRecordDateFormat(recordDate)
    && (dateRecordStatus === 'absent' || dateRecordStatus === 'exists');
  const parsedRecordDate = parseRecordDate(recordDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parsedRecordDate ?? new Date());
  const recordDateInputId = useId();
  const calendarPanelId = useId();
  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const selectedDateValue = parsedRecordDate ? formatRecordDateValue(parsedRecordDate) : '';
  const currentMonth = viewDate.getMonth();
  const weekdayLabels = getMsg('SaveAttendanceModal.weekdays').split(',');
  const recordStatusMessage = dateRecordStatus === 'exists'
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

  // 日付入力、カレンダー、保存ボタンのUIイベント。
  const handleSelectDate = (date: Date) => {
    onRecordDateChange(formatRecordDateValue(date));
    setViewDate(date);
    setCalendarOpen(false);
  };

  const shiftMonth = (delta: number) => {
    setViewDate((current) => new Date(
      current.getFullYear(),
      current.getMonth() + delta,
      1,
    ));
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleRecordDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    onRecordDateChange(formatRecordDateInput(event.target.value));
  };

  const handleToggleCalendar = () => {
    const nextDate = parseRecordDate(recordDate);
    if (nextDate) setViewDate(nextDate);
    setCalendarOpen((open) => !open);
  };

  const handlePreviousMonth = () => shiftMonth(-1);
  const handleNextMonth = () => shiftMonth(1);
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
          <div className={styles.recordDateField}>
            <CalendarDays size={16} className={styles.recordDateIcon} aria-hidden />
            <input id={recordDateInputId} type="text" inputMode="numeric" className={styles.recordDateInput} placeholder={getMsg('SaveAttendanceModal.datePlaceholder')} maxLength={10} value={recordDate} onChange={handleRecordDateChange} />
            <button type="button" className={styles.recordDateCalendarButton} aria-label={getMsg('SaveAttendanceModal.openCalendar')} aria-expanded={calendarOpen} aria-controls={calendarPanelId} onClick={handleToggleCalendar}><CalendarDays size={15} /></button>
            {calendarOpen && (
              <div id={calendarPanelId} className={styles.recordDateCalendarPanel}>
                <div className={styles.recordDateCalendarHeader}>
                  <button type="button" onClick={handlePreviousMonth} aria-label={getMsg('SaveAttendanceModal.previousMonth')}>‹</button>
                  <strong>{getMsg('SaveAttendanceModal.calendarMonth', { year: viewDate.getFullYear(), month: viewDate.getMonth() + 1 })}</strong>
                  <button type="button" onClick={handleNextMonth} aria-label={getMsg('SaveAttendanceModal.nextMonth')}>›</button>
                </div>
                <div className={styles.recordDateCalendarWeekdays}>{weekdayLabels.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
                <div className={styles.recordDateCalendarGrid}>
                  {calendarDays.map((date) => {
                    // 日付セルの選択状態と当月外表示を同じ日付値から組み立てる。
                    const value = formatRecordDateValue(date);
                    const isSelected = value === selectedDateValue;
                    const isCurrentMonth = date.getMonth() === currentMonth;
                    const className = [
                      styles.recordDateCalendarDay,
                      isSelected ? styles.recordDateCalendarDaySelected : '',
                      isCurrentMonth ? '' : styles.recordDateCalendarDayMuted,
                    ].filter(Boolean).join(' ');
                    const ariaLabel = getMsg('SaveAttendanceModal.calendarDate', { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
                    return <CalendarDayButton key={value} date={date} className={className} ariaLabel={ariaLabel} selected={isSelected} onSelect={handleSelectDate} />;
                  })}
                </div>
              </div>
            )}
          </div>
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
        {recordStatusMessage && <span className={styles.overwriteNote} role={dateRecordStatus === 'failed' ? 'alert' : 'status'}>{recordStatusMessage}</span>}
        <button type="button" className={shared.btnSecondary} onClick={onClose}>{getMsg('common.cancel')}</button>
        <button type="button" className={shared.btnPrimary} disabled={saving || !canSave} onClick={handleSaveClick}>{saveButtonLabel}</button>
      </div>
    </AppDialog>
  );
}
