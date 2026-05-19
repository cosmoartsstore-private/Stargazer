import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CastBean } from '@/common/types/entities';
import { useAppContext } from '@/stores/AppContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import styles from './AttendancePage.module.css';
import shared from '@/styles/shared.module.css';
import {
  recordCastAttendance,
  getCastAttendance,
  getCastAttendanceHistory,
  getCastAttendanceSummary,
  hasCastAttendanceForDate,
  updateCastAttend,
  type CastAttendanceRecord,
  type CastAttendanceEvent,
  type CastAttendanceSummary,
} from '@/db';

type AttendanceTab = 'setup' | 'records';

type GroupedCasts = { groupName: string | null; casts: CastBean[] }[];

function groupByGroupName(castList: CastBean[]): GroupedCasts {
  const map = new Map<string, CastBean[]>();
  const ungrouped: CastBean[] = [];
  for (const cast of castList) {
    if (cast.group_name) {
      if (!map.has(cast.group_name)) map.set(cast.group_name, []);
      map.get(cast.group_name)!.push(cast);
    } else {
      ungrouped.push(cast);
    }
  }
  const result: GroupedCasts = [...map.entries()].map(([groupName, casts]) => ({ groupName, casts }));
  if (ungrouped.length > 0) result.push({ groupName: null, casts: ungrouped });
  return result;
}

export const AttendancePage: React.FC = () => {
  const { currentEventName, casts, setCasts } = useAppContext();
  const [activeTab, setActiveTab] = useState<AttendanceTab>('setup');
  const [castRecords, setCastRecords] = useState<CastAttendanceRecord[]>([]);
  const [history, setHistory] = useState<CastAttendanceEvent[]>([]);
  const [summary, setSummary] = useState<CastAttendanceSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [recordDate, setRecordDate] = useState('');
  const [dateHasRecord, setDateHasRecord] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const loadData = useCallback(async () => {
    if (currentEventName === null) return;
    const [records, hist, sum] = await Promise.all([
      getCastAttendance(),
      getCastAttendanceHistory(),
      getCastAttendanceSummary(),
    ]);
    setCastRecords(records);
    setHistory(hist);
    setSummary(sum);
  }, [currentEventName]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!confirmSave || !currentEventName || !recordDate) { setDateHasRecord(false); return; }
    void hasCastAttendanceForDate(recordDate).then(setDateHasRecord);
  }, [confirmSave, currentEventName, recordDate]);

  const handleSave = async () => {
    if (!currentEventName || !recordDate) return;
    setSaving(true);
    try {
      const presentNames = casts.filter((c) => c.is_present).map((c) => c.name);
      await recordCastAttendance(presentNames, recordDate);
      await loadData();
      setAlertMessage('出席記録を保存しました。');
    } catch (e) {
      setAlertMessage(`保存に失敗しました: ${e}`);
    } finally {
      setSaving(false);
      setConfirmSave(false);
    }
  };

  const handleOpenSaveModal = () => {
    setRecordDate(new Date().toLocaleDateString('sv'));
    setConfirmSave(true);
  };

  const handleTogglePresence = async (castName: string, isPresent: boolean) => {
    if (currentEventName === null) return;
    setCasts((prev) => prev.map((c) => c.name === castName ? { ...c, is_present: isPresent } : c));
    await updateCastAttend(castName, isPresent);
  };

  const handleSetAll = async (isPresent: boolean) => {
    if (currentEventName === null) return;
    setCasts((prev) => prev.map((c) => ({ ...c, is_present: isPresent })));
    await Promise.all(casts.map((c) => updateCastAttend(c.name, isPresent)));
  };

  if (currentEventName === null) {
    return (
      <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
        <div className={styles.attendanceEmpty}>イベントが開かれていません。</div>
      </div>
    );
  }

  const presentCount  = casts.filter((c) => c.is_present).length;
  const groupedPresent = useMemo(() => groupByGroupName(casts.filter((c) => c.is_present)), [casts]);
  const groupedAbsent  = useMemo(() => groupByGroupName(casts.filter((c) => !c.is_present)), [casts]);

  const tabs: { id: AttendanceTab; label: string }[] = [
    { id: 'setup',   label: '出席設定' },
    { id: 'records', label: '出席記録' },
  ];

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
      <div className={shared.pageTabs}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${shared.pageTab}${activeTab === t.id ? ` ${shared.pageTabActive}` : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={shared.pageTabContent}>
        {activeTab === 'setup' && (
          <div className={styles.setupTab}>
            {/* ヘッダー：カウンター + 一括ボタン + 記録ボタン */}
            <div className={styles.setupHeader}>
              <div className={styles.setupCounter}>
                <span className={styles.setupCountPresent}>{presentCount}名 出席中</span>
                <span className={styles.setupCountAbsent}>{casts.length - presentCount}名 待機</span>
              </div>
              <div className={styles.setupActions}>
                <div className={styles.setupBulkBtns}>
                  <button type="button" className={styles.setupBulkPresent} onClick={() => { void handleSetAll(true); }}>
                    全員出席
                  </button>
                  <button type="button" className={styles.setupBulkAbsent} onClick={() => { void handleSetAll(false); }}>
                    全員待機
                  </button>
                </div>
                <div className={styles.setupRecordWrap}>
                  <button
                    type="button"
                    className={shared.btnPrimary}
                    disabled={saving || casts.length === 0}
                    onClick={handleOpenSaveModal}
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
                {/* 左：出席中 */}
                <div className={styles.setupCol}>
                  <div className={styles.setupColHeader}>
                    <span className={styles.setupColTitle}>出席中</span>
                    <span className={`${styles.setupColBadge} ${styles.setupColBadgePresent}`}>{presentCount}</span>
                  </div>
                  <div className={styles.setupColBody}>
                    {groupedPresent.length === 0
                      ? <p className={styles.setupColEmpty}>なし</p>
                      : groupedPresent.map(({ groupName, casts: gc }) => (
                        <div key={groupName ?? '__none__'} className={styles.setupGroup}>
                          <div className={styles.setupGroupLabel}>{groupName ?? '未所属'}</div>
                          <div className={styles.setupChipWrap}>
                            {gc.map((cast) => (
                              <button
                                key={cast.name}
                                type="button"
                                className={`${styles.setupChip} ${styles.setupChipPresent}`}
                                title="クリックで待機に移動"
                                onClick={() => { void handleTogglePresence(cast.name, false); }}
                              >
                                {cast.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* 右：待機 */}
                <div className={styles.setupCol}>
                  <div className={styles.setupColHeader}>
                    <span className={styles.setupColTitle}>待機</span>
                    <span className={`${styles.setupColBadge} ${styles.setupColBadgeAbsent}`}>{casts.length - presentCount}</span>
                  </div>
                  <div className={styles.setupColBody}>
                    {groupedAbsent.length === 0
                      ? <p className={styles.setupColEmpty}>なし</p>
                      : groupedAbsent.map(({ groupName, casts: gc }) => (
                        <div key={groupName ?? '__none__'} className={styles.setupGroup}>
                          <div className={styles.setupGroupLabel}>{groupName ?? '未所属'}</div>
                          <div className={styles.setupChipWrap}>
                            {gc.map((cast) => (
                              <button
                                key={cast.name}
                                type="button"
                                className={`${styles.setupChip} ${styles.setupChipAbsent}`}
                                title="クリックで出席に移動"
                                onClick={() => { void handleTogglePresence(cast.name, true); }}
                              >
                                {cast.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'records' && (
          <div className={styles.recordsTab}>
            {/* このイベントの出席キャスト */}
            <div className={styles.recordsSection}>
              <span className={shared.castDetailLabel}>このイベントの出席キャスト</span>
              {castRecords.length > 0 ? (
                <div className={styles.castChipList}>
                  {castRecords.map((r) => (
                    <span key={r.cast_name} className={styles.castChip}>{r.cast_name}</span>
                  ))}
                </div>
              ) : (
                <div className={styles.attendanceEmpty}>まだ記録されていません。出席設定で「記録する」を押してください。</div>
              )}
            </div>

            {/* 出席履歴 → モーダルで表示 */}
            <div className={styles.recordsSection}>
              <div className={styles.recordsSectionHeader}>
                <span className={shared.castDetailLabel}>出席履歴</span>
                <button
                  type="button"
                  className={styles.historyBtn}
                  disabled={history.length === 0}
                  onClick={() => setShowHistoryModal(true)}
                >
                  {history.length === 0 ? '履歴なし' : `${history.length} 件の履歴を表示`}
                </button>
              </div>
            </div>

            {/* キャスト別累積出席回数 */}
            <div className={styles.recordsSection}>
              <span className={shared.castDetailLabel}>キャスト別累積出席回数</span>
              {summary.length === 0 ? (
                <div className={styles.attendanceEmpty}>累積データはありません。</div>
              ) : (
                <div className={`${shared.tableContainer} ${shared.customScrollbar}`}>
                  <table>
                    <thead>
                      <tr>
                        <th>キャスト名</th>
                        <th>出席回数</th>
                        <th>最終イベント</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((s) => (
                        <tr key={s.cast_name}>
                          <td>{s.cast_name}</td>
                          <td>
                            <span className={styles.attendanceCountBadge}>{s.total_count}</span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--discord-text-muted)' }}>
                            {s.last_event ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 出席履歴モーダル */}
      {showHistoryModal && (
        <div className={styles.modalOverlay} onClick={() => setShowHistoryModal(false)}>
          <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>出席履歴</span>
              <button type="button" className={styles.modalClose} onClick={() => setShowHistoryModal(false)}>✕</button>
            </div>
            <div className={styles.historyList}>
              {history.map((h) => {
                const castArr = h.cast_names ? h.cast_names.split(',') : [];
                return (
                  <div key={`${h.event_id}-${h.recorded_at}`} className={styles.historyCard}>
                    <div className={styles.historyCardLeft}>
                      <span className={styles.historyDate}>{h.recorded_at.slice(0, 10)}</span>
                      <span className={styles.historyEventName}>{h.event_name}</span>
                    </div>
                    <div className={styles.historyCardCenter}>
                      <span className={styles.historyCountNum}>{h.cast_count}</span>
                      <span className={styles.historyCountUnit}>名</span>
                    </div>
                    <div className={styles.historyCardRight}>
                      {castArr.map((name) => (
                        <span key={name} className={styles.historyCastChip}>{name.trim()}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {confirmSave && (
        <div className={styles.modalOverlay} onClick={() => setConfirmSave(false)}>
          <div className={styles.saveModalPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>出席を記録する</span>
              <button type="button" className={styles.modalClose} onClick={() => setConfirmSave(false)}>✕</button>
            </div>
            <div className={styles.saveModalBody}>
              {/* 左: 日付 */}
              <div className={styles.saveModalCol}>
                <span className={styles.saveModalColLabel}>記録日</span>
                <input
                  type="date"
                  className={styles.recordDateInput}
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                />
              </div>
              {/* 中: 出席人数 */}
              <div className={`${styles.saveModalCol} ${styles.saveModalColCenter}`}>
                <span className={styles.saveModalColLabel}>出席人数</span>
                <span className={styles.saveCountNum}>{presentCount}</span>
                <span className={styles.saveCountUnit}>名</span>
              </div>
              {/* 右: キャスト名一覧 */}
              <div className={`${styles.saveModalCol} ${styles.saveModalColCasts}`}>
                <span className={styles.saveModalColLabel}>出席キャスト</span>
                <div className={styles.saveCastList}>
                  {casts.filter((c) => c.is_present).map((c) => (
                    <span key={c.name} className={styles.saveCastItem}>{c.name}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              {dateHasRecord && (
                <span className={styles.overwriteNote}>この日付のデータが既に存在します。上書きされます。</span>
              )}
              <button type="button" className={shared.btnSecondary} onClick={() => setConfirmSave(false)}>
                キャンセル
              </button>
              <button type="button" className={shared.btnPrimary} disabled={saving || !recordDate} onClick={() => { void handleSave(); }}>
                {saving ? '保存中...' : dateHasRecord ? '上書きして保存' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
      {alertMessage && (
        <ConfirmModal
          type="alert"
          message={alertMessage}
          confirmLabel="OK"
          onConfirm={() => setAlertMessage(null)}
        />
      )}
    </div>
  );
};
