// キャストの出席・未出席状態をグループ別に操作する画面を表示する。

import type { CastBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import type { GroupedCasts } from '../models/types';
import { groupCastsByGroupName } from '../models/attendanceMatrix';
import styles from '../AttendancePage.module.css';

interface AttendanceSetupViewProps {
  casts: CastBean[];
  presentCount: number;
  groupedPresent: GroupedCasts;
  saving: boolean;
  onOpenSaveModal: () => void;
  onSetAll: (isPresent: boolean) => Promise<void>;
  onTogglePresence: (castId: number, isPresent: boolean) => Promise<void>;
}

export function AttendanceSetupView({
  casts,
  presentCount,
  groupedPresent,
  saving,
  onOpenSaveModal,
  onSetAll,
  onTogglePresence,
}: AttendanceSetupViewProps) {
  // 現在の出欠状態を、件数とグループ別表示へ変換する。
  const absentCount = casts.length - presentCount;
  const absentGroups = groupCastsByGroupName(casts.filter((cast) => !cast.is_present));

  // 一括操作を保存処理へ接続する。
  const handleSetAllPresent = () => { void onSetAll(true); };
  const handleSetAllAbsent = () => { void onSetAll(false); };

  return (
    <div className={styles.setupTab}>
      <div className={styles.setupHeader}>
        <div className={styles.setupCounter}>
          <span className={styles.setupCountPresent}>{getMsg('AttendanceSetupView.presentCount', { count: presentCount })}</span>
          <span className={styles.setupCountAbsent}>{getMsg('AttendanceSetupView.absentCount', { count: absentCount })}</span>
        </div>
        <div className={styles.setupActions}>
          <div className={styles.setupBulkBtns}>
            <button type="button" className={styles.setupBulkPresent} onClick={handleSetAllPresent}>{getMsg('AttendanceSetupView.allPresent')}</button>
            <button type="button" className={styles.setupBulkAbsent} onClick={handleSetAllAbsent}>{getMsg('AttendanceSetupView.allAbsent')}</button>
          </div>
          <div className={styles.setupRecordWrap}>
            <button type="button" className={`${shared.btnPrimary} ${styles.attendanceRecordButton}`} disabled={saving || casts.length === 0} onClick={onOpenSaveModal}>{getMsg('AttendanceSetupView.recordAttendance')}</button>
          </div>
        </div>
      </div>

      {casts.length === 0 ? (
        /* キャストがいない場合 */
        <div className={styles.attendanceEmpty}>{getMsg('AttendanceSetupView.noCasts')}</div>
      ) : (
        /* 出欠設定列を表示する場合 */
        <div className={styles.setupColumns}>
          <AttendanceSetupColumn
            title={getMsg('AttendanceSetupView.presentTitle')}
            count={presentCount}
            groups={groupedPresent}
            variant="present"
            badgeClassName={styles.setupColBadgePresent}
            emptyLabel={getMsg('common.none')}
            onSelect={onTogglePresence}
          />
          <AttendanceSetupColumn
            title={getMsg('AttendanceSetupView.absentTitle')}
            count={absentCount}
            groups={absentGroups}
            variant="absent"
            badgeClassName={styles.setupColBadgeAbsent}
            emptyLabel={getMsg('common.none')}
            onSelect={onTogglePresence}
          />
        </div>
      )}
    </div>
  );
}

interface AttendanceSetupColumnProps {
  title: string;
  count: number;
  groups: GroupedCasts;
  variant: 'present' | 'absent';
  badgeClassName: string;
  emptyLabel: string;
  onSelect: (castId: number, isPresent: boolean) => Promise<void>;
}

interface AttendanceCastChipProps {
  castId: number;
  name: string;
  className: string;
  ariaLabel: string;
  statusLabel?: string;
  nextPresence: boolean;
  onSelect: (castId: number, isPresent: boolean) => Promise<void>;
}

function AttendanceCastChip({
  castId,
  name,
  className,
  ariaLabel,
  statusLabel,
  nextPresence,
  onSelect,
}: AttendanceCastChipProps) {
  const handleClick = () => { void onSelect(castId, nextPresence); };

  return <button type="button" className={className} aria-label={ariaLabel} data-status-label={statusLabel} onClick={handleClick}>{name}</button>;
}

function AttendanceSetupColumn({
  title,
  count,
  groups,
  variant,
  badgeClassName,
  emptyLabel,
  onSelect,
}: AttendanceSetupColumnProps) {
  const isAbsentColumn = variant === 'absent';

  return (
    <div className={styles.setupCol}>
      <div className={styles.setupColHeader}>
        <span className={styles.setupColTitle}>{title}</span>
        <span className={`${styles.setupColBadge} ${badgeClassName}`}>{count}</span>
      </div>
      <div className={styles.setupColBody}>
        {groups.length === 0 ? (
          /* 表示対象のキャストがいない場合 */
          <p className={styles.setupColEmpty}>{emptyLabel}</p>
        ) : (
          /* グループ一覧を表示する場合 */
          groups.map(({ groupName, casts }) => (
            <div key={groupName ?? '__none__'} className={styles.setupGroup}>
              <div className={styles.setupGroupLabel}>{groupName ?? getMsg('AttendanceSetupView.unassigned')}</div>
              <div className={styles.setupChipWrap}>
                {casts.map((cast) => {
                  // 列種別と現在の出欠状態から、表示と次の操作状態をまとめて確定する。
                  const variantClassName = isAbsentColumn
                    ? `${styles.setupChipWait} ${styles.setupChipWaitSelected}`
                    : styles.setupChipPresent;
                  const ariaLabel = getMsg(
                    isAbsentColumn
                      ? 'AttendanceSetupView.markPresent'
                      : 'AttendanceSetupView.markAbsent',
                    { castName: cast.name },
                  );
                  const statusLabel = isAbsentColumn
                    ? getMsg('AttendanceSetupView.absentStatus')
                    : undefined;
                  const nextPresence = isAbsentColumn;

                  return <AttendanceCastChip key={cast.id} className={`${styles.setupChip} ${variantClassName}`} castId={cast.id} name={cast.name} ariaLabel={ariaLabel} statusLabel={statusLabel} nextPresence={nextPresence} onSelect={onSelect} />;
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
