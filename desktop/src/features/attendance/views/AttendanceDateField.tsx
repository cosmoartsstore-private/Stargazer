// 出席記録と履歴期間で共用する、手入力対応のカレンダー付き日付欄。

import { CalendarDays } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { getMsg } from '@/messages/getMsg';
import styles from '../AttendancePage.module.css';
import {
  buildCalendarDays,
  formatRecordDateInput,
  formatRecordDateValue,
  parseRecordDate,
} from '../models/recordDate';

const FIRST_RECORD_DATE = '0001-01-01';
const LAST_RECORD_DATE = '9999-12-31';

function clampCalendarDate(date: Date, min?: string, max?: string): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  const firstDate = parseRecordDate(min ?? '') ?? parseRecordDate(FIRST_RECORD_DATE)!;
  const lastDate = parseRecordDate(max ?? '') ?? parseRecordDate(LAST_RECORD_DATE)!;
  if (normalized.getTime() < firstDate.getTime()) return firstDate;
  if (normalized.getTime() > lastDate.getTime()) return lastDate;
  return normalized;
}

function shiftCalendarDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + delta);
  return next;
}

function shiftCalendarMonths(date: Date, delta: number): Date {
  const day = date.getDate();
  const next = new Date(date);
  next.setDate(1);
  // setFullYear を使い、1〜99年を1900年代へ補正するDateコンストラクタの挙動を避ける。
  next.setFullYear(date.getFullYear(), date.getMonth() + delta, 1);
  const lastDay = new Date(next);
  lastDay.setFullYear(next.getFullYear(), next.getMonth() + 1, 0);
  next.setDate(Math.min(day, lastDay.getDate()));
  return next;
}

interface CalendarDayButtonProps {
  date: Date;
  className: string;
  ariaLabel: string;
  selected: boolean;
  disabled: boolean;
  focused: boolean;
  onSelect: (date: Date) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, date: Date) => void;
}

function CalendarDayButton({
  date,
  className,
  ariaLabel,
  selected,
  disabled,
  focused,
  onSelect,
  onKeyDown,
}: CalendarDayButtonProps) {
  const dateValue = formatRecordDateValue(date);
  const handleClick = () => onSelect(date);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, date);

  return (
    <div className={styles.recordDateCalendarCell} role="gridcell" aria-selected={selected} aria-disabled={disabled || undefined}>
      <button
        type="button"
        className={className}
        data-calendar-date={dateValue}
        aria-label={ariaLabel}
        tabIndex={focused ? 0 : -1}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {date.getDate()}
      </button>
    </div>
  );
}

interface AttendanceDateFieldProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  autoFocus?: boolean;
  min?: string;
  max?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  calendarOpen?: boolean;
  onCalendarOpenChange?: (open: boolean) => void;
}

export function AttendanceDateField({
  id,
  value,
  onValueChange,
  autoFocus = false,
  min,
  max,
  ariaInvalid,
  ariaDescribedBy,
  calendarOpen,
  onCalendarOpenChange,
}: AttendanceDateFieldProps) {
  const parsedDate = parseRecordDate(value);
  const [internalCalendarOpen, setInternalCalendarOpen] = useState(false);
  const initialCalendarDate = clampCalendarDate(parsedDate ?? new Date(), min, max);
  const [viewDate, setViewDate] = useState(() => initialCalendarDate);
  const [focusedDateValue, setFocusedDateValue] = useState(() => formatRecordDateValue(initialCalendarDate));
  const calendarPanelId = useId();
  const calendarHeadingId = useId();
  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const calendarWeeks = useMemo(() => Array.from(
    { length: 6 },
    (_, weekIndex) => calendarDays.slice(weekIndex * 7, weekIndex * 7 + 7),
  ), [calendarDays]);
  const selectedDateValue = parsedDate ? formatRecordDateValue(parsedDate) : '';
  const currentMonth = viewDate.getMonth();
  const weekdayLabels = getMsg('SaveAttendanceModal.weekdays').split(',');
  const isCalendarOpen = calendarOpen ?? internalCalendarOpen;
  const fieldRef = useRef<HTMLDivElement>(null);
  const calendarPanelRef = useRef<HTMLDivElement>(null);
  const calendarTriggerRef = useRef<HTMLButtonElement>(null);
  const initialFocusDateRef = useRef(initialCalendarDate);
  const pendingFocusDateRef = useRef<string | null>(null);
  const restoreFocusOnCloseRef = useRef(false);
  const previousCalendarOpenRef = useRef(isCalendarOpen);
  initialFocusDateRef.current = initialCalendarDate;

  const setCalendarOpen = useCallback((open: boolean) => {
    if (onCalendarOpenChange) {
      onCalendarOpenChange(open);
      return;
    }
    setInternalCalendarOpen(open);
  }, [onCalendarOpenChange]);

  const closeCalendar = useCallback((restoreFocus: boolean) => {
    restoreFocusOnCloseRef.current = restoreFocus;
    setCalendarOpen(false);
  }, [setCalendarOpen]);

  // 開いた時点の入力値に対応する日へ移動し、roving tabindexの起点へフォーカスする。
  useEffect(() => {
    if (!isCalendarOpen) return;
    restoreFocusOnCloseRef.current = false;
    const initialDate = initialFocusDateRef.current;
    const initialDateValue = formatRecordDateValue(initialDate);
    pendingFocusDateRef.current = initialDateValue;
    setViewDate(initialDate);
    setFocusedDateValue(initialDateValue);
  }, [isCalendarOpen]);

  useEffect(() => {
    if (!isCalendarOpen || pendingFocusDateRef.current === null) return;
    const dateValue = pendingFocusDateRef.current;
    const dayButton = calendarPanelRef.current?.querySelector<HTMLButtonElement>(
      `[data-calendar-date="${dateValue}"]`,
    );
    if (!dayButton) return;
    dayButton.focus();
    pendingFocusDateRef.current = null;
  }, [calendarDays, focusedDateValue, isCalendarOpen]);

  useEffect(() => {
    const wasOpen = previousCalendarOpenRef.current;
    previousCalendarOpenRef.current = isCalendarOpen;
    if (!wasOpen || isCalendarOpen) return;
    pendingFocusDateRef.current = null;
    if (restoreFocusOnCloseRef.current) {
      calendarTriggerRef.current?.focus();
    }
    restoreFocusOnCloseRef.current = false;
  }, [isCalendarOpen]);

  // ポインター操作とキーボード移動のどちらでも、欄の外へ移った時に閉じる。
  useEffect(() => {
    if (!isCalendarOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (fieldRef.current && !event.composedPath().includes(fieldRef.current)) {
        closeCalendar(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (fieldRef.current && !event.composedPath().includes(fieldRef.current)) {
        closeCalendar(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [closeCalendar, isCalendarOpen]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(formatRecordDateInput(event.target.value));
  };

  const handleSelectDate = (date: Date) => {
    const dateValue = formatRecordDateValue(date);
    onValueChange(dateValue);
    setViewDate(date);
    setFocusedDateValue(dateValue);
    closeCalendar(true);
  };

  const shiftMonth = (delta: number) => {
    const focusedDate = parseRecordDate(focusedDateValue) ?? viewDate;
    const nextDate = clampCalendarDate(shiftCalendarMonths(focusedDate, delta), min, max);
    pendingFocusDateRef.current = null;
    setViewDate(nextDate);
    setFocusedDateValue(formatRecordDateValue(nextDate));
  };

  const handleToggleCalendar = () => {
    if (isCalendarOpen) {
      closeCalendar(true);
      return;
    }
    setCalendarOpen(true);
  };

  const moveCalendarFocus = (date: Date) => {
    const nextDate = clampCalendarDate(date, min, max);
    const nextDateValue = formatRecordDateValue(nextDate);
    pendingFocusDateRef.current = nextDateValue;
    setViewDate(nextDate);
    setFocusedDateValue(nextDateValue);
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    let nextDate: Date | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        nextDate = shiftCalendarDays(date, -1);
        break;
      case 'ArrowRight':
        nextDate = shiftCalendarDays(date, 1);
        break;
      case 'ArrowUp':
        nextDate = shiftCalendarDays(date, -7);
        break;
      case 'ArrowDown':
        nextDate = shiftCalendarDays(date, 7);
        break;
      case 'Home':
        nextDate = shiftCalendarDays(date, -date.getDay());
        break;
      case 'End':
        nextDate = shiftCalendarDays(date, 6 - date.getDay());
        break;
      case 'PageUp':
        nextDate = shiftCalendarMonths(date, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        nextDate = shiftCalendarMonths(date, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    moveCalendarFocus(nextDate);
  };

  const handleCalendarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isCalendarOpen || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeCalendar(true);
  };

  const handlePreviousMonth = () => shiftMonth(-1);
  const handleNextMonth = () => shiftMonth(1);

  return (
    <div ref={fieldRef} className={styles.recordDateField} onKeyDown={handleCalendarKeyDown}>
      <CalendarDays size={16} className={styles.recordDateIcon} aria-hidden />
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className={styles.recordDateInput}
        placeholder={getMsg('SaveAttendanceModal.datePlaceholder')}
        maxLength={10}
        value={value}
        autoFocus={autoFocus}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        onChange={handleInputChange}
      />
      <button
        ref={calendarTriggerRef}
        type="button"
        className={styles.recordDateCalendarButton}
        aria-label={getMsg('SaveAttendanceModal.openCalendar')}
        aria-haspopup="dialog"
        aria-expanded={isCalendarOpen}
        aria-controls={calendarPanelId}
        onClick={handleToggleCalendar}
      >
        <CalendarDays size={15} />
      </button>
      {isCalendarOpen && (
        <div
          ref={calendarPanelRef}
          id={calendarPanelId}
          className={styles.recordDateCalendarPanel}
          role="dialog"
          aria-modal="false"
          aria-labelledby={calendarHeadingId}
        >
          <div className={styles.recordDateCalendarHeader}>
            <button type="button" onClick={handlePreviousMonth} aria-label={getMsg('SaveAttendanceModal.previousMonth')}>‹</button>
            <strong id={calendarHeadingId} aria-live="polite">{getMsg('SaveAttendanceModal.calendarMonth', { year: viewDate.getFullYear(), month: viewDate.getMonth() + 1 })}</strong>
            <button type="button" onClick={handleNextMonth} aria-label={getMsg('SaveAttendanceModal.nextMonth')}>›</button>
          </div>
          <div className={styles.recordDateCalendarGrid} role="grid" aria-labelledby={calendarHeadingId}>
            <div className={styles.recordDateCalendarWeekdays} role="row">{weekdayLabels.map((weekday, index) => <span key={`${weekday}-${index}`} role="columnheader">{weekday}</span>)}</div>
            {calendarWeeks.map((week) => (
              <div key={formatRecordDateValue(week[0])} className={styles.recordDateCalendarWeek} role="row">
                {week.map((date) => {
                  const dateValue = formatRecordDateValue(date);
                  const isSelected = dateValue === selectedDateValue;
                  const isCurrentMonth = date.getMonth() === currentMonth;
                  const isDisabled = date.getFullYear() < 1
                    || date.getFullYear() > 9999
                    || Boolean((min && dateValue < min) || (max && dateValue > max));
                  const className = [
                    styles.recordDateCalendarDay,
                    isSelected ? styles.recordDateCalendarDaySelected : '',
                    isCurrentMonth ? '' : styles.recordDateCalendarDayMuted,
                    isDisabled ? styles.recordDateCalendarDayDisabled : '',
                  ].filter(Boolean).join(' ');
                  const ariaLabel = getMsg('SaveAttendanceModal.calendarDate', { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
                  return (
                    <CalendarDayButton
                      key={dateValue}
                      date={date}
                      className={className}
                      ariaLabel={ariaLabel}
                      selected={isSelected}
                      disabled={isDisabled}
                      focused={dateValue === focusedDateValue}
                      onSelect={handleSelectDate}
                      onKeyDown={handleDayKeyDown}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
