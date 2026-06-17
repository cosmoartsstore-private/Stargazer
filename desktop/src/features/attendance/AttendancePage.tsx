import { ConfirmModal } from '@/components/ConfirmModal';
import { useAppContext } from '@/stores/AppContext';
import shared from '@/styles/shared.module.css';
import styles from './AttendancePage.module.css';
import type { AttendanceTab } from './models/types';
import { useAttendanceState } from './viewmodels/useAttendanceState';
import { AttendanceRecordsView } from './views/AttendanceRecordsView';
import { AttendanceSetupView } from './views/AttendanceSetupView';
import { SaveAttendanceModal } from './views/SaveAttendanceModal';

const tabs: { id: AttendanceTab; label: string }[] = [
  { id: 'setup', label: '出席設定' },
  { id: 'records', label: '出席履歴' },
];

export function AttendancePage() {
  const { currentEventName, casts, setCasts } = useAppContext();
  const attendance = useAttendanceState({ currentEventName, casts, setCasts });

  if (currentEventName === null) {
    return (
      <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
        <div className={styles.attendanceEmpty}>イベントが開かれていません。</div>
      </div>
    );
  }

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner} ${styles.attendancePage}`}>
      <div className={styles.attendanceTabs} role="tablist" aria-label="出席管理">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={attendance.activeTab === tab.id}
            className={`${styles.attendanceTab}${attendance.activeTab === tab.id ? ` ${styles.attendanceTabActive}` : ''}`}
            onClick={() => attendance.setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.attendanceTabContent}>
        {attendance.activeTab === 'setup' && (
          <AttendanceSetupView
            casts={casts}
            presentCount={attendance.presentCount}
            groupedPresent={attendance.groupedPresent}
            saving={attendance.saving}
            onOpenSaveModal={attendance.handleOpenSaveModal}
            onSetAll={attendance.handleSetAll}
            onTogglePresence={attendance.handleTogglePresence}
          />
        )}

        {attendance.activeTab === 'records' && (
          <AttendanceRecordsView
            attendanceDates={attendance.attendanceDates}
            attendanceRows={attendance.attendanceRows}
          />
        )}
      </div>

      {attendance.confirmSave && (
        <SaveAttendanceModal
          presentCasts={attendance.presentCasts}
          presentCount={attendance.presentCount}
          saving={attendance.saving}
          recordDate={attendance.recordDate}
          dateHasRecord={attendance.dateHasRecord}
          onClose={() => attendance.setConfirmSave(false)}
          onRecordDateChange={attendance.setRecordDate}
          onSave={attendance.handleSave}
        />
      )}

      {attendance.alertMessage && (
        <ConfirmModal
          type="alert"
          message={attendance.alertMessage}
          confirmLabel="OK"
          onConfirm={() => attendance.setAlertMessage(null)}
        />
      )}
    </div>
  );
}
