import { Check, Minus } from 'lucide-react';
import shared from '@/styles/shared.module.css';
import type { AttendanceMatrixRow } from '../models/types';
import styles from '../AttendancePage.module.css';

interface AttendanceRecordsViewProps {
  attendanceDates: string[];
  attendanceRows: AttendanceMatrixRow[];
}

export function AttendanceRecordsView({ attendanceDates, attendanceRows }: AttendanceRecordsViewProps) {
  return (
    <div className={styles.recordsTab}>
      <div className={styles.recordsSection}>
        <div className={styles.recordsSectionHeader}>
          <span className={styles.recordsTitle}>出席履歴</span>
          <span className={styles.recordsSummary}>
            {attendanceRows.length}名 / {attendanceDates.length}日
          </span>
        </div>
        {attendanceRows.length === 0 || attendanceDates.length === 0 ? (
          <div className={styles.attendanceEmpty}>まだ出席記録がありません。出席設定で保存してください。</div>
        ) : (
          <div className={`${styles.attendanceMatrixWrap} ${shared.customScrollbar}`}>
            <table className={styles.attendanceMatrix}>
              <thead>
                <tr>
                  <th className={styles.attendanceMatrixCastHead}>キャスト名</th>
                  <th className={styles.attendanceMatrixCountHead}>出席回数</th>
                  {attendanceDates.map((date) => (
                    <th key={date} className={styles.attendanceMatrixDateHead}>{date}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendanceRows.map((row) => (
                  <tr key={row.castName}>
                    <td className={styles.attendanceMatrixCastName}>{row.castName}</td>
                    <td className={styles.attendanceMatrixCountCell}>
                      <span className={styles.attendanceCountText}>{row.totalCount}</span>
                    </td>
                    {attendanceDates.map((date) => (
                      <AttendanceMatrixCell
                        key={`${row.castName}-${date}`}
                        castName={row.castName}
                        date={date}
                        isPresent={row.dates.has(date)}
                      />
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
  return (
    <td
      className={`${styles.attendanceMatrixCell}${isPresent ? ` ${styles.attendanceMatrixCellPresent}` : ''}`}
      title={`${date} ${castName} ${isPresent ? '出席' : '未出席'}`}
    >
      {isPresent ? (
        <span className={styles.attendanceCheckMark} aria-label="出席">
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </span>
      ) : (
        <span className={styles.attendanceEmptyMark} aria-label="未出席">
          <Minus size={12} strokeWidth={2.5} aria-hidden="true" />
        </span>
      )}
    </td>
  );
}
