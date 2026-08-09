// キャスト別の出欠履歴を日付ごとの一覧表として表示する。

import { CalendarDays, Circle, X } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import type { AttendanceHistoryLoadStatus, AttendanceMatrixRow, AttendancePeriod } from '../models/types';
import styles from '../AttendancePage.module.css';

interface AttendanceRecordsViewProps {
  attendanceDates: string[];
  attendanceRows: AttendanceMatrixRow[];
  attendancePeriod: AttendancePeriod;
  periodDialogOpen: boolean;
  loadStatus: AttendanceHistoryLoadStatus;
  onOpenPeriodDialog: () => void;
}

function getAttendancePeriodLabel(period: AttendancePeriod): string {
  if (period.startDate && period.endDate) {
    return getMsg('AttendanceRecordsView.periodRange', {
      startDate: period.startDate,
      endDate: period.endDate,
    });
  }
  if (period.startDate) {
    return getMsg('AttendanceRecordsView.periodFrom', { startDate: period.startDate });
  }
  if (period.endDate) {
    return getMsg('AttendanceRecordsView.periodUntil', { endDate: period.endDate });
  }
  return getMsg('AttendanceRecordsView.allPeriod');
}

export function AttendanceRecordsView({
  attendanceDates,
  attendanceRows,
  attendancePeriod,
  periodDialogOpen,
  loadStatus,
  onOpenPeriodDialog,
}: AttendanceRecordsViewProps) {
  const hasPeriodFilter = Boolean(attendancePeriod.startDate || attendancePeriod.endDate);
  const periodStatus = getMsg(
    hasPeriodFilter
      ? 'AttendanceRecordsView.customPeriod'
      : 'AttendanceRecordsView.allPeriod',
  );
  const periodButtonLabel = getMsg('AttendanceRecordsView.openPeriodDialog', {
    period: getAttendancePeriodLabel(attendancePeriod),
  });
  const periodButtonClassName = `${styles.attendanceMatrixCountButton}${
    hasPeriodFilter ? ` ${styles.attendanceMatrixCountButtonActive}` : ''
  }`;
  const showEmpty = attendanceRows.length === 0
    || (!hasPeriodFilter && attendanceDates.length === 0);

  return (
    <div className={styles.recordsTab}>
      <section className={styles.recordsSection} aria-labelledby="attendance-records-title">
        <div className={styles.recordsSectionHeader}>
          <h2 id="attendance-records-title" className={styles.recordsTitle}>{getMsg('AttendanceRecordsView.title')}</h2>
          {loadStatus === 'ready' && <span className={styles.recordsSummary} role="status">{getMsg('AttendanceRecordsView.summary', { castCount: attendanceRows.length, dayCount: attendanceDates.length })}</span>}
        </div>
        {loadStatus === 'idle' || loadStatus === 'loading' ? (
          <div className={styles.attendanceEmpty}>{getMsg('common.loading')}</div>
        ) : loadStatus === 'failed' ? (
          <div className={styles.attendanceEmpty}>{getMsg('AttendanceRecordsView.loadFailed')}</div>
        ) : showEmpty ? (
          /* 出欠履歴がない場合 */
          <div className={styles.attendanceEmpty}>{getMsg('AttendanceRecordsView.empty')}</div>
        ) : (
          /* 出欠マトリクスを表示する場合 */
          <div className={styles.attendanceMatrixFrame}>
            <table className={`${styles.attendanceMatrix} ${styles.attendanceMatrixSummary}`}>
              <thead>
                <tr>
                  <th scope="col" className={styles.attendanceMatrixCastHead}>{getMsg('AttendanceRecordsView.castNameHeader')}</th>
                  <th scope="col" className={styles.attendanceMatrixCountHead}>
                    <button type="button" className={periodButtonClassName} aria-label={periodButtonLabel} aria-haspopup="dialog" aria-expanded={periodDialogOpen} onClick={onOpenPeriodDialog}>
                      <span>{getMsg('AttendanceRecordsView.attendanceCountHeader')}</span>
                      <span className={styles.attendanceMatrixCountPeriod}><CalendarDays size={11} aria-hidden />{periodStatus}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {attendanceRows.map((row) => (
                  <tr key={row.castName}>
                    <th scope="row" className={styles.attendanceMatrixCastName}>{row.castName}</th>
                    <td className={styles.attendanceMatrixCountCell}><span className={styles.attendanceCountText}>{row.totalCount}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={`${styles.attendanceMatrixWrap} ${shared.customScrollbar}`}>
              <table className={`${styles.attendanceMatrix} ${styles.attendanceMatrixDates}`}>
                <thead>
                  <tr>
                    {attendanceDates.map((date) => (
                      <th key={date} scope="col" className={styles.attendanceMatrixDateHead}>{date}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.map((row) => (
                    <tr key={row.castName}>
                      {attendanceDates.map((date) => (
                        <AttendanceMatrixCell key={`${row.castName}-${date}`} castName={row.castName} date={date} isPresent={row.dates.has(date)} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

interface AttendanceMatrixCellProps {
  castName: string;
  date: string;
  isPresent: boolean;
}

function AttendanceMatrixCell({ castName, date, isPresent }: AttendanceMatrixCellProps) {
  const status = isPresent
    ? getMsg('AttendanceRecordsView.present')
    : getMsg('AttendanceRecordsView.absent');

  return (
    <td
      className={styles.attendanceMatrixCell}
      aria-label={getMsg('AttendanceRecordsView.cellLabel', { date, castName, status })}
    >
      {isPresent ? (
        /* 出席の場合 */
        <span className={styles.attendancePresentMark} aria-hidden="true"><Circle size={24} strokeWidth={3.25} /></span>
      ) : (
        /* 欠席の場合 */
        <span className={styles.attendanceAbsentMark} aria-hidden="true"><X size={23} strokeWidth={3} /></span>
      )}
    </td>
  );
}
