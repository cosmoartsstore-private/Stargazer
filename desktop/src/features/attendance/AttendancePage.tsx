// 出欠管理の設定画面と記録画面を切り替え、出欠記録の保存を制御するページ。

import type { KeyboardEvent } from 'react';
import { NoticeDialog } from '@/components/ConfirmModal';
import { getMsg } from '@/messages/getMsg';
import { useAppContext } from '@/stores/AppContext';
import shared from '@/styles/shared.module.css';
import styles from './AttendancePage.module.css';
import type { AttendanceTab } from './models/types';
import { useAttendanceState } from './viewmodels/useAttendanceState';
import { AttendancePeriodDialog } from './views/AttendancePeriodDialog';
import { AttendanceRecordsView } from './views/AttendanceRecordsView';
import { AttendanceSetupView } from './views/AttendanceSetupView';
import { SaveAttendanceModal } from './views/SaveAttendanceModal';

// 出欠管理ページで切り替える表示区分。
const ATTENDANCE_TABS: { id: AttendanceTab; label: string }[] = [
  { id: 'setup', label: getMsg('AttendancePage.setupTab') },
  { id: 'records', label: getMsg('AttendancePage.recordsTab') },
];

interface AttendanceTabButtonProps {
  id: AttendanceTab;
  label: string;
  selected: boolean;
  onSelect: (tab: AttendanceTab) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, tab: AttendanceTab) => void;
}

function AttendanceTabButton({ id, label, selected, onSelect, onKeyDown }: AttendanceTabButtonProps) {
  const handleClick = () => onSelect(id);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, id);
  const className = `${styles.attendanceTab}${selected ? ` ${styles.attendanceTabActive}` : ''}`;

  return <button id={`attendance-tab-${id}`} type="button" role="tab" aria-controls="attendance-tabpanel" aria-selected={selected} tabIndex={selected ? 0 : -1} className={className} onClick={handleClick} onKeyDown={handleKeyDown}>{label}</button>;
}

export function AttendancePage() {
  // 画面表示と保存処理は、出欠管理用ViewModelの同一スナップショットを使う。
  const { currentEventName, casts, setCasts } = useAppContext();
  const attendance = useAttendanceState({ currentEventName, casts, setCasts });

  // モーダルからViewModelへ入力を渡すUIイベント。
  const handleCloseSaveModal = () => attendance.setConfirmSave(false);
  const handleDismissAlert = () => attendance.setAlertMessage(null);
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: AttendanceTab) => {
    const currentIndex = ATTENDANCE_TABS.findIndex((item) => item.id === tab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % ATTENDANCE_TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + ATTENDANCE_TABS.length) % ATTENDANCE_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = ATTENDANCE_TABS.length - 1;
    else return;

    event.preventDefault();
    const nextTab = ATTENDANCE_TABS[nextIndex];
    attendance.setActiveTab(nextTab.id);
    document.getElementById(`attendance-tab-${nextTab.id}`)?.focus();
  };

  if (currentEventName === null) {
    return (
      <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
        <div className={styles.attendanceEmpty}>{getMsg('common.eventNotOpen')}</div>
      </div>
    );
  }

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner} ${styles.attendancePage}`}>
      <div className={styles.attendanceTabs} role="tablist" aria-label={getMsg('AttendancePage.tabListLabel')}>
        {ATTENDANCE_TABS.map((tab) => (
          <AttendanceTabButton key={tab.id} id={tab.id} label={tab.label} selected={attendance.activeTab === tab.id} onSelect={attendance.setActiveTab} onKeyDown={handleTabKeyDown} />
        ))}
      </div>

      <div id="attendance-tabpanel" className={styles.attendanceTabContent} role="tabpanel" aria-labelledby={`attendance-tab-${attendance.activeTab}`} tabIndex={0}>
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
            attendancePeriod={attendance.attendancePeriod}
            periodDialogOpen={attendance.attendancePeriodDialogOpen}
            loadStatus={attendance.historyLoadStatus}
            onOpenPeriodDialog={attendance.handleOpenAttendancePeriodDialog}
          />
        )}
      </div>

      {attendance.attendancePeriodDialogOpen && (
        <AttendancePeriodDialog
          period={attendance.attendancePeriod}
          onApply={attendance.handleApplyAttendancePeriod}
          onClose={attendance.handleCloseAttendancePeriodDialog}
        />
      )}

      {attendance.confirmSave && (
        <SaveAttendanceModal
          presentCasts={attendance.presentCasts}
          presentCount={attendance.presentCount}
          saving={attendance.saving}
          recordDate={attendance.recordDate}
          dateRecordStatus={attendance.dateRecordStatus}
          onClose={handleCloseSaveModal}
          onRecordDateChange={attendance.handleRecordDateChange}
          onSave={attendance.handleSave}
        />
      )}

      {attendance.alertMessage && (
        <NoticeDialog
          title={getMsg('AttendancePage.tabListLabel')}
          message={attendance.alertMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleDismissAlert}
        />
      )}
    </div>
  );
}
