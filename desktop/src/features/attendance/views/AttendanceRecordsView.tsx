// キャスト別の出欠履歴を日付ごとの一覧表として表示する。

import { Check, Minus } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import type { AttendanceHistoryLoadStatus, AttendanceMatrixRow } from '../models/types';
import styles from '../AttendancePage.module.css';

interface AttendanceRecordsViewProps {
  attendanceDates: string[];
  attendanceRows: AttendanceMatrixRow[];
  loadStatus: AttendanceHistoryLoadStatus;
}

export function AttendanceRecordsView({ attendanceDates, attendanceRows, loadStatus }: AttendanceRecordsViewProps) {
  return (
    <div className={styles.recordsTab}>
      <div className={styles.recordsSection}>
        <div className={styles.recordsSectionHeader}>
          <span className={styles.recordsTitle}>{getMsg('AttendanceRecordsView.title')}</span>
          {loadStatus === 'ready' && <span className={styles.recordsSummary}>{getMsg('AttendanceRecordsView.summary', { castCount: attendanceRows.length, dayCount: attendanceDates.length })}</span>}
        </div>
        {loadStatus === 'idle' || loadStatus === 'loading' ? (
          <div className={styles.attendanceEmpty}>{getMsg('common.loading')}</div>
        ) : loadStatus === 'failed' ? (
          <div className={styles.attendanceEmpty}>{getMsg('AttendanceRecordsView.loadFailed')}</div>
        ) : attendanceRows.length === 0 || attendanceDates.length === 0 ? (
          /* 出欠履歴がない場合 */
          <div className={styles.attendanceEmpty}>{getMsg('AttendanceRecordsView.empty')}</div>
        ) : (
          /* 出欠マトリクスを表示する場合 */
          <div className={`${styles.attendanceMatrixWrap} ${shared.customScrollbar}`}>
            <table className={styles.attendanceMatrix}>
              <thead>
                <tr>
                  <th className={styles.attendanceMatrixCastHead}>{getMsg('AttendanceRecordsView.castNameHeader')}</th>
                  <th className={styles.attendanceMatrixCountHead}>{getMsg('AttendanceRecordsView.attendanceCountHeader')}</th>
                  {attendanceDates.map((date) => (
                    <th key={date} className={styles.attendanceMatrixDateHead}>{date}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendanceRows.map((row) => (
                  <tr key={row.castName}>
                    <td className={styles.attendanceMatrixCastName}>{row.castName}</td>
                    <td className={styles.attendanceMatrixCountCell}><span className={styles.attendanceCountText}>{row.totalCount}</span></td>
                    {attendanceDates.map((date) => (
                      <AttendanceMatrixCell key={`${row.castName}-${date}`} castName={row.castName} date={date} isPresent={row.dates.has(date)} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
      className={`${styles.attendanceMatrixCell}${isPresent ? ` ${styles.attendanceMatrixCellPresent}` : ''}`}
      aria-label={getMsg('AttendanceRecordsView.cellLabel', { date, castName, status })}
    >
      {isPresent ? (
        /* 出席の場合 */
        <span className={styles.attendanceCheckMark} aria-hidden="true"><Check size={13} strokeWidth={3} aria-hidden="true" /></span>
      ) : (
        /* 欠席の場合 */
        <span className={styles.attendanceEmptyMark} aria-hidden="true"><Minus size={12} strokeWidth={2.5} aria-hidden="true" /></span>
      )}
    </td>
  );
}
