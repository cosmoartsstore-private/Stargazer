import type { CastBean } from '@/common/types/entities';
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
  onTogglePresence: (castName: string, isPresent: boolean) => Promise<void>;
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
  const absentCount = casts.length - presentCount;
  const waitingGroups = groupCastsByGroupName(casts);

  return (
    <div className={styles.setupTab}>
      <div className={styles.setupHeader}>
        <div className={styles.setupCounter}>
          <span className={styles.setupCountPresent}>{presentCount}名 出席中</span>
          <span className={styles.setupCountAbsent}>{absentCount}名 待機</span>
        </div>
        <div className={styles.setupActions}>
          <div className={styles.setupBulkBtns}>
            <button type="button" className={styles.setupBulkPresent} onClick={() => { void onSetAll(true); }}>
              全員出席
            </button>
            <button type="button" className={styles.setupBulkAbsent} onClick={() => { void onSetAll(false); }}>
              全員待機
            </button>
          </div>
          <div className={styles.setupRecordWrap}>
            <button
              type="button"
              className={shared.btnPrimary}
              disabled={saving || casts.length === 0}
              onClick={onOpenSaveModal}
            >
              保存
            </button>
          </div>
        </div>
      </div>

      {casts.length === 0 ? (
        <div className={styles.attendanceEmpty}>キャストが登録されていません。</div>
      ) : (
        <div className={styles.setupColumns}>
          <AttendanceSetupColumn
            title="出席中"
            count={presentCount}
            groups={groupedPresent}
            getChipClassName={() => styles.setupChipPresent}
            badgeClassName={styles.setupColBadgePresent}
            emptyLabel="なし"
            getChipTitle={() => 'クリックで待機に移動'}
            onSelect={(cast) => onTogglePresence(cast.name, false)}
          />
          <AttendanceSetupColumn
            title="待機"
            count={absentCount}
            groups={waitingGroups}
            getChipClassName={(cast) => `${styles.setupChipWait}${!cast.is_present ? ` ${styles.setupChipWaitSelected}` : ''}`}
            badgeClassName={styles.setupColBadgeAbsent}
            emptyLabel="なし"
            getChipTitle={(cast) => (cast.is_present ? 'クリックで待機にする' : 'クリックで出席に戻す')}
            onSelect={(cast) => onTogglePresence(cast.name, !cast.is_present)}
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
  getChipClassName: (cast: CastBean) => string;
  badgeClassName: string;
  emptyLabel: string;
  getChipTitle: (cast: CastBean) => string;
  onSelect: (cast: CastBean) => Promise<void>;
}

function AttendanceSetupColumn({
  title,
  count,
  groups,
  getChipClassName,
  badgeClassName,
  emptyLabel,
  getChipTitle,
  onSelect,
}: AttendanceSetupColumnProps) {
  return (
    <div className={styles.setupCol}>
      <div className={styles.setupColHeader}>
        <span className={styles.setupColTitle}>{title}</span>
        <span className={`${styles.setupColBadge} ${badgeClassName}`}>{count}</span>
      </div>
      <div className={styles.setupColBody}>
        {groups.length === 0 ? (
          <p className={styles.setupColEmpty}>{emptyLabel}</p>
        ) : (
          groups.map(({ groupName, casts }) => (
            <div key={groupName ?? '__none__'} className={styles.setupGroup}>
              <div className={styles.setupGroupLabel}>{groupName ?? '未所属'}</div>
              <div className={styles.setupChipWrap}>
                {casts.map((cast) => (
                  <button
                    key={cast.name}
                    type="button"
                    className={`${styles.setupChip} ${getChipClassName(cast)}`}
                    title={getChipTitle(cast)}
                    onClick={() => { void onSelect(cast); }}
                  >
                    {cast.name}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
