import { useMemo, useState } from 'react';
import { AppDialog } from '@/components/AppDialog';
import type { CastBean } from '@/common/types/entities';
import { CalendarDays } from '@/common/icons';
import shared from '@/styles/shared.module.css';
import styles from '../AttendancePage.module.css';

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseRecordDate(value: string): Date | null {
  if (!DATE_VALUE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function buildCalendarDays(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

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
  const parsedRecordDate = parseRecordDate(recordDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parsedRecordDate ?? new Date());
  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const selectedDateValue = parsedRecordDate ? formatDateValue(parsedRecordDate) : '';
  const currentMonth = viewDate.getMonth();

  const handleSelectDate = (date: Date) => {
    onRecordDateChange(formatDateValue(date));
    setViewDate(date);
    setCalendarOpen(false);
  };

  const shiftMonth = (delta: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

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
            <button
              type="button"
              className={styles.recordDateCalendarButton}
              aria-label="カレンダーを開く"
              onClick={() => {
                const nextDate = parseRecordDate(recordDate);
                if (nextDate) setViewDate(nextDate);
                setCalendarOpen((open) => !open);
              }}
            >
              <CalendarDays size={15} />
            </button>
            {calendarOpen && (
              <div className={styles.recordDateCalendarPanel}>
                <div className={styles.recordDateCalendarHeader}>
                  <button type="button" onClick={() => shiftMonth(-1)} aria-label="前の月">‹</button>
                  <strong>{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</strong>
                  <button type="button" onClick={() => shiftMonth(1)} aria-label="次の月">›</button>
                </div>
                <div className={styles.recordDateCalendarWeekdays}>
                  {WEEKDAY_LABELS.map((weekday) => <span key={weekday}>{weekday}</span>)}
                </div>
                <div className={styles.recordDateCalendarGrid}>
                  {calendarDays.map((date) => {
                    const value = formatDateValue(date);
                    const isSelected = value === selectedDateValue;
                    const isCurrentMonth = date.getMonth() === currentMonth;
                    return (
                      <button
                        key={value}
                        type="button"
                        className={`${styles.recordDateCalendarDay}${isSelected ? ` ${styles.recordDateCalendarDaySelected}` : ''}${isCurrentMonth ? '' : ` ${styles.recordDateCalendarDayMuted}`}`}
                        onClick={() => handleSelectDate(date)}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
