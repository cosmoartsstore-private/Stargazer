import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSelect, type AppSelectOption } from '@/components/AppSelect';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CounterControl } from '@/components/CounterControl';
import { getCautionNGCastNames } from '@/features/matching/logics/caution-user';
import { FIXED_NG_JUDGMENT_TYPE } from '@/features/matching/types/matching-system-types';
import { MATCHING_TYPE_CODES_SELECTABLE, MATCHING_TYPE_LABELS, type MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
import { NgCastResultCell } from './components/NgCastResultCell';
import { LotteryValidationPanel } from './components/LotteryValidationPanel';
import { useLotteryValidation } from './hooks/useLotteryValidation';
import {
  formatSavedLotteryLabel,
  shuffle,
} from './services/lottery-draw';
import {
  buildLotteryPersistenceRows,
  restoreLotteryWinners,
  summarizeLotteryPersistenceRows,
} from './services/lottery-result-persistence';
import { useAppContext } from '@/stores/AppContext';
import {
  getSavedLotteryResults,
  getLotteryResults,
  listSavedLotteryRuns,
  replaceLotteryResults,
  saveLotteryRun,
  type SavedLotteryRunRow,
} from '@/db/repositories/lotteryRepository';
import styles from './LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

const GUARANTEED_WINNER_PREVIEW_LIMIT = 1;

export const LotteryPage: React.FC = () => {
  const {
    setActivePage,
    applicants,
    casts,
    currentWinners,
    setCurrentWinners,
    guaranteedWinners,
    setGuaranteedWinners,
    setGlobalMatchingResult,
    setGlobalTableSlots,
    setGlobalMatchingError,
    setIsMatchingLocked,
    matchingTypeCode,
    setMatchingTypeCode,
    rotationCount,
    setRotationCount,
    totalTables,
    setTotalTables,
    usersPerTable,
    setUsersPerTable,
    castsPerRotation,
    setCastsPerRotation,
    allowM003EmptySeats,
    setAllowM003EmptySeats,
    m003SameDaySlotCount,
    setM003SameDaySlotCount,
    currentSessionTimestamp,
  } = useAppContext();

  useEffect(() => {
    if (!currentSessionTimestamp) return;
    if (currentWinners.length > 0) return;
    (async () => {
      try {
        const rows = await getLotteryResults();
        if (rows.length === 0) return;
        const restored = await restoreLotteryWinners(rows, applicants);
        if (restored.length > 0) {
          setCurrentWinners(restored);
          setGuaranteedWinners(restored.filter((winner) => winner.is_guaranteed));
        }
      } catch (e) {
        console.warn('抽選結果の読み込みに失敗しました:', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionTimestamp, applicants.length]);

  const allUsers = applicants;
  const activeCastCount = casts.filter((cast) => cast.is_present).length;

  const [lotteryCount, setLotteryCount] = useState(1);
  const [showGuaranteedSelect, setShowGuaranteedSelect] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [savedRuns, setSavedRuns] = useState<SavedLotteryRunRow[]>([]);
  const [selectedSavedRunId, setSelectedSavedRunId] = useState('');
  const [savingLotteryRun, setSavingLotteryRun] = useState(false);
  const [lotteryMessage, setLotteryMessage] = useState<string | null>(null);

  const refreshSavedRuns = useCallback(async () => {
    if (!currentSessionTimestamp) {
      setSavedRuns([]);
      setSelectedSavedRunId('');
      return;
    }
    try {
      const runs = await listSavedLotteryRuns();
      setSavedRuns(runs);
      setSelectedSavedRunId((current) => {
        if (!current) return '';
        return runs.some((run) => String(run.id) === current) ? current : '';
      });
    } catch (e) {
      console.warn('保存済み抽選結果の読み込みに失敗しました:', e);
    }
  }, [currentSessionTimestamp]);

  useEffect(() => {
    void refreshSavedRuns();
  }, [refreshSavedRuns]);

  const guaranteedCount = guaranteedWinners.length;
  const totalWinners = lotteryCount + guaranteedCount;
  const savedRunOptions: AppSelectOption[] = useMemo(
    () => savedRuns.map((run) => ({
      value: String(run.id),
      label: `${run.label} / 合計 ${run.winner_count}名 / ${run.created_at}`,
    })),
    [savedRuns],
  );
  const validation = useLotteryValidation({
    matchingTypeCode,
    totalWinners,
    lotteryCount,
    guaranteedCount,
    totalTables,
    activeCastCount,
    castsPerRotation,
    usersPerTable,
    allowM003EmptySeats,
    sameDaySlotCount: m003SameDaySlotCount,
  });
  const isLotteryOnlyMode = matchingTypeCode === 'M000';

  const clearMatchingForConditionChange = useCallback(() => {
    setGlobalMatchingResult(null);
    setGlobalTableSlots(undefined);
    setGlobalMatchingError(null);
    setIsMatchingLocked(false);
  }, [
    setGlobalMatchingError,
    setGlobalMatchingResult,
    setGlobalTableSlots,
    setIsMatchingLocked,
  ]);

  const handleMatchingTypeChange = useCallback((code: MatchingTypeCode) => {
    if (matchingTypeCode === code) return;
    setMatchingTypeCode(code);
    clearMatchingForConditionChange();
  }, [clearMatchingForConditionChange, matchingTypeCode, setMatchingTypeCode]);

  const handleRotationCountChange = useCallback((value: number) => {
    if (rotationCount === value) return;
    setRotationCount(value);
    clearMatchingForConditionChange();
  }, [clearMatchingForConditionChange, rotationCount, setRotationCount]);

  const handleTotalTablesChange = useCallback((value: number) => {
    if (totalTables === value) return;
    setTotalTables(value);
    clearMatchingForConditionChange();
  }, [clearMatchingForConditionChange, setTotalTables, totalTables]);

  const handleUsersPerTableChange = useCallback((value: number) => {
    if (usersPerTable === value) return;
    setUsersPerTable(value);
    clearMatchingForConditionChange();
  }, [clearMatchingForConditionChange, setUsersPerTable, usersPerTable]);

  const handleCastsPerRotationChange = useCallback((value: number) => {
    if (castsPerRotation === value) return;
    setCastsPerRotation(value);
    clearMatchingForConditionChange();
  }, [castsPerRotation, clearMatchingForConditionChange, setCastsPerRotation]);

  const handleSameDaySlotCountChange = useCallback((value: number) => {
    if (m003SameDaySlotCount === value) return;
    setM003SameDaySlotCount(value);
    clearMatchingForConditionChange();
  }, [clearMatchingForConditionChange, m003SameDaySlotCount, setM003SameDaySlotCount]);

  const handleAllowM003EmptySeatsToggle = useCallback(() => {
    const next = !allowM003EmptySeats;
    setAllowM003EmptySeats(next);
    if (next && m003SameDaySlotCount < 1) {
      setM003SameDaySlotCount(1);
    }
    clearMatchingForConditionChange();
  }, [
    allowM003EmptySeats,
    clearMatchingForConditionChange,
    m003SameDaySlotCount,
    setAllowM003EmptySeats,
    setM003SameDaySlotCount,
  ]);

  const guaranteedIds = useMemo(
    () => new Set(guaranteedWinners.map((winner) => winner.x_id)),
    [guaranteedWinners],
  );
  const guaranteedWinnerSummary = useMemo(
    () => guaranteedWinners.map((winner) => winner.name || winner.x_id).join(', '),
    [guaranteedWinners],
  );
  const visibleGuaranteedWinners = guaranteedWinners.slice(0, GUARANTEED_WINNER_PREVIEW_LIMIT);
  const hiddenGuaranteedWinnerCount = Math.max(0, guaranteedWinners.length - visibleGuaranteedWinners.length);

  const runLottery = () => {
    const guaranteedIdSet = new Set(guaranteedWinners.map((winner) => winner.x_id));
    const candidates = allUsers.filter((user) => !guaranteedIdSet.has(user.x_id));
    const winners = shuffle(candidates).slice(0, lotteryCount);
    const nextWinners = [
      ...guaranteedWinners.map((winner) => ({ ...winner, is_guaranteed: true })),
      ...winners.map((winner) => ({ ...winner, is_guaranteed: false })),
    ];

    setCurrentWinners(nextWinners);
    setGlobalMatchingResult(null);
    setGlobalTableSlots(undefined);
    setGlobalMatchingError(null);
    setIsMatchingLocked(false);
    setConfirmReplace(false);

    // Persist to the session DB. Re-running the lottery is intentionally a
    // destructive replace; matching has nothing to persist because it is
    // recomputed every time from this winner set + casts + settings.
    if (currentSessionTimestamp) {
      (async () => {
        try {
          const rows = await buildLotteryPersistenceRows(nextWinners);
          await replaceLotteryResults(rows);
        } catch (e) {
          console.error('抽選結果の保存に失敗しました:', e);
        }
      })();
    }
  };

  const resultRows = useMemo(
    () => currentWinners.map((winner) => ({
      ...winner,
      lotteryType: guaranteedIds.has(winner.x_id) || winner.is_guaranteed ? '確定当選' : '抽選当選',
      ngCastNames: getCautionNGCastNames(winner, casts, FIXED_NG_JUDGMENT_TYPE),
    })),
    [casts, currentWinners, guaranteedIds],
  );
  const ngWinnerCount = resultRows.filter((row) => row.ngCastNames.length > 0).length;

  const handleSaveLotteryRun = useCallback(async () => {
    if (currentWinners.length === 0 || savingLotteryRun) return;
    setSavingLotteryRun(true);
    try {
      const rows = await buildLotteryPersistenceRows(currentWinners);
      if (rows.length === 0) {
        setLotteryMessage('保存できる抽選結果がありません。');
        return;
      }
      const summary = summarizeLotteryPersistenceRows(rows);
      const runId = await saveLotteryRun({
        label: formatSavedLotteryLabel(summary.winnerCount),
        matchingTypeCode,
        lotteryCount: summary.lotteryCount,
        guaranteedCount: summary.guaranteedCount,
        rows,
      });
      await replaceLotteryResults(rows);
      await refreshSavedRuns();
      setSelectedSavedRunId(String(runId));
      setLotteryMessage('抽選結果をDBに保存しました。');
    } catch (e) {
      console.error('抽選結果の保存に失敗しました:', e);
      setLotteryMessage('抽選結果の保存に失敗しました。');
    } finally {
      setSavingLotteryRun(false);
    }
  }, [
    currentWinners,
    matchingTypeCode,
    refreshSavedRuns,
    savingLotteryRun,
  ]);

  const handleLoadSavedLotteryRun = useCallback(async () => {
    const runId = Number(selectedSavedRunId);
    if (!Number.isFinite(runId) || runId <= 0) return;
    try {
      const rows = await getSavedLotteryResults(runId);
      const restored = await restoreLotteryWinners(rows, applicants);
      if (restored.length === 0) {
        setLotteryMessage('選択した抽選結果を復元できませんでした。');
        return;
      }
      setCurrentWinners(restored);
      setGuaranteedWinners(restored.filter((winner) => winner.is_guaranteed));
      setGlobalMatchingResult(null);
      setGlobalTableSlots(undefined);
      setGlobalMatchingError(null);
      setIsMatchingLocked(false);
      await replaceLotteryResults(await buildLotteryPersistenceRows(restored));
      const selected = savedRuns.find((run) => run.id === runId);
      setLotteryMessage(`${selected?.label ?? '保存済み抽選結果'}を選択しました。`);
    } catch (e) {
      console.error('保存済み抽選結果の選択に失敗しました:', e);
      setLotteryMessage('保存済み抽選結果の選択に失敗しました。');
    }
  }, [
    applicants,
    savedRuns,
    selectedSavedRunId,
    setCurrentWinners,
    setGlobalMatchingError,
    setGlobalMatchingResult,
    setGlobalTableSlots,
    setIsMatchingLocked,
  ]);

  return (
    <div className={styles.lotteryScreen}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>抽選</h1>
        <p className={shared.pageHeaderSubtitle}>
          確定当選者と当選人数を設定し、抽選結果を確認してからマッチングへ進みます。
        </p>
      </header>

      <section className={`${shared.sectionBlock} ${styles.workflowConditionBlock}`}>
        <div className={styles.workflowSectionHeader}>
          <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>抽選設定</h2>
          <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>
            当選者数とマッチング条件をまとめて設定し、右側のステータスで実行可否を確認します。
          </p>
        </div>

        <div className={styles.workflowConditionLayout}>
          <div className={styles.workflowConditionForm}>
            <div className={styles.workflowColumnHeader}>
              <strong>条件入力</strong>
              <span>抽選人数とマッチングに使う前提条件を設定します。</span>
            </div>
            <div className={styles.workflowFormGrid}>
              <label className={shared.formGroup}>
                <span className={shared.formLabel}>当選人数</span>
                <CounterControl
                  label="当選人数"
                  value={lotteryCount}
                  min={1}
                  onChange={setLotteryCount}
                />
              </label>

              <div className={styles.workflowInlineCard}>
                <div className={styles.workflowInlineCard__header}>
                  <strong>確定当選者</strong>
                  <span className={styles.workflowInlineCard__meta}>合計当選者 {totalWinners} 名</span>
                  <button type="button" className={shared.btnSecondary} onClick={() => setShowGuaranteedSelect(true)}>
                    選択
                  </button>
                </div>
                <div className={styles.workflowInlineCard__body}>
                  <div className={styles.workflowInlineCard__winnerList} title={guaranteedWinnerSummary || undefined}>
                    {guaranteedWinners.length > 0
                      ? visibleGuaranteedWinners.map((winner) => {
                          const label = winner.name || winner.x_id;
                          return (
                            <span
                              key={winner.x_id}
                              className={styles.workflowInlineCard__winnerChip}
                              title={`${label} (${winner.x_id})`}
                            >
                              {label}
                            </span>
                          );
                        })
                      : '未設定'}
                  </div>
                  {hiddenGuaranteedWinnerCount > 0 && (
                    <button
                      type="button"
                      className={`${styles.workflowInlineCard__winnerChip} ${styles.workflowInlineCard__winnerChipMore}`}
                      title={guaranteedWinnerSummary}
                      aria-label={`非表示の確定当選者 ${hiddenGuaranteedWinnerCount} 名を確認する`}
                      onClick={() => setShowGuaranteedSelect(true)}
                    >
                      +{hiddenGuaranteedWinnerCount}
                    </button>
                  )}
                </div>
              </div>

              <label className={`${shared.formGroup} ${styles.workflowFormWide}`}>
                <span className={shared.formLabel}>マッチング方式</span>
                <div className={styles.matchingTypeOptions}>
                  {MATCHING_TYPE_CODES_SELECTABLE.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={`${styles.matchingTypeOption}${matchingTypeCode === code ? ` ${styles.matchingTypeOptionSelected}` : ''}`}
                      onClick={() => handleMatchingTypeChange(code)}
                    >
                      {MATCHING_TYPE_LABELS[code]}
                    </button>
                  ))}
                </div>
              </label>

              {isLotteryOnlyMode ? (
                <div className={`${styles.m003SettingsSlot} ${styles.m003SettingsSlotInactive} ${styles.workflowFormWide} ${styles.workflowLotteryOnlySlot}`}>
                  <div className={styles.m003SettingsPlaceholder}>
                    抽選のみ行うため、ラウンド数・テーブル数・キャスト割り当て条件は使用しません。
                  </div>
                </div>
              ) : (
                <>
                  <label className={shared.formGroup}>
                    <span className={shared.formLabel}>ラウンド数</span>
                    <CounterControl
                      label="ラウンド数"
                      value={rotationCount}
                      min={1}
                      onChange={handleRotationCountChange}
                    />
                  </label>

                  <label className={shared.formGroup}>
                    <span className={shared.formLabel}>総テーブル数</span>
                    <CounterControl
                      label="総テーブル数"
                      value={totalTables}
                      min={1}
                      onChange={handleTotalTablesChange}
                    />
                  </label>

                  <div className={`${styles.m003SettingsSlot} ${styles.workflowFormWide}${matchingTypeCode === 'M003' ? '' : ` ${styles.m003SettingsSlotInactive}`}`}>
                    {matchingTypeCode === 'M003' ? (
                      <>
                        <div className={styles.m003SettingsGrid}>
                          <label className={shared.formGroup}>
                            <span className={shared.formLabel}>1テーブルあたりのゲスト数</span>
                            <CounterControl
                              label="1テーブルあたりのゲスト数"
                              value={usersPerTable}
                              min={1}
                              onChange={handleUsersPerTableChange}
                            />
                          </label>

                          <label className={shared.formGroup}>
                            <span className={shared.formLabel}>1ローテあたりのキャスト数</span>
                            <CounterControl
                              label="1ローテあたりのキャスト数"
                              value={castsPerRotation}
                              min={1}
                              onChange={handleCastsPerRotationChange}
                            />
                          </label>
                        </div>

                        <div className={styles.sameDaySlotPanel}>
                          <div className={shared.formGroup}>
                            <span className={shared.formLabel}>当日枠を含める</span>
                            <button
                              type="button"
                              className={`${styles.workflowSwitch}${allowM003EmptySeats ? ` ${styles.workflowSwitchOn}` : ''}`}
                              role="switch"
                              aria-checked={allowM003EmptySeats}
                              onClick={handleAllowM003EmptySeatsToggle}
                            >
                              <span className={styles.workflowSwitch__knob} />
                              <span>{allowM003EmptySeats ? '含める' : '含めない'}</span>
                            </button>
                          </div>

                          <label className={`${styles.sameDaySlotControl}${allowM003EmptySeats ? '' : ` ${styles.sameDaySlotControlDisabled}`}`}>
                            <span>当日枠数</span>
                            <CounterControl
                              label="当日枠数"
                              value={m003SameDaySlotCount}
                              min={allowM003EmptySeats ? 1 : 0}
                              disabled={!allowM003EmptySeats}
                              className={styles.sameDaySlotCounter}
                              onChange={handleSameDaySlotCountChange}
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <div className={styles.m003SettingsPlaceholder}>
                        グループ制マッチングを選択すると、テーブル単位の詳細条件を編集できます。
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <aside className={styles.workflowConditionStatus}>
            <LotteryValidationPanel
              validation={validation}
              title="設定ステータス"
              description="この条件で抽選を実行できるかを確認します。"
              onRunClick={() => {
                if (currentWinners.length > 0) {
                  setConfirmReplace(true);
                  return;
                }
                runLottery();
              }}
            />
          </aside>
        </div>
      </section>

      <section className={`${shared.sectionBlock} ${styles.workflowResultSection}`}>
        <div className={`${styles.workflowSectionHeader} ${styles.workflowSectionHeaderRow}`}>
          <div>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>当選者リスト</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>
              抽選結果はDBに保存できます。保存済みの結果は後から選択し直せます。
            </p>
          </div>
          {ngWinnerCount > 0 && (
            <span className={styles.workflowResultNgSummary}>
              NGキャストあり {ngWinnerCount} 名
            </span>
          )}
        </div>

        <div className={styles.workflowResultToolbar}>
          <div className={styles.workflowSavedResultControl}>
            <label className={`${shared.formGroup} ${styles.workflowSavedResultSelect}`}>
              <span className={shared.formLabel}>保存済み抽選結果</span>
              <AppSelect
                value={selectedSavedRunId}
                onValueChange={setSelectedSavedRunId}
                options={savedRunOptions}
                placeholder={savedRuns.length === 0 ? '保存済み結果はありません' : '保存済み結果を選択'}
                disabled={savedRuns.length === 0}
              />
            </label>
            <button
              type="button"
              className={shared.btnSecondary}
              disabled={!selectedSavedRunId}
              onClick={() => { void handleLoadSavedLotteryRun(); }}
            >
              保存済み結果を開く
            </button>
          </div>
          <div className={styles.workflowResultToolbar__actions}>
            <button
              type="button"
              className={shared.btnPrimary}
              disabled={resultRows.length === 0 || savingLotteryRun}
              onClick={() => { void handleSaveLotteryRun(); }}
            >
              {savingLotteryRun ? '保存中...' : '抽選結果保存'}
            </button>
            {!isLotteryOnlyMode && (
              <button
                type="button"
                className={shared.btnPrimary}
                disabled={resultRows.length === 0}
                onClick={() => setActivePage('matching')}
              >
                マッチングへ
              </button>
            )}
          </div>
        </div>

        <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 840 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--discord-bg-secondary)' }}>
                <th className={shared.tableHeaderCell}>ユーザー</th>
                <th className={shared.tableHeaderCell}>X ID</th>
                <th className={shared.tableHeaderCell}>区分</th>
                <th className={shared.tableHeaderCell}>希望キャスト</th>
                <th className={shared.tableHeaderCell}>NGキャスト</th>
              </tr>
            </thead>
            <tbody>
              {resultRows.length === 0 && (
                <tr>
                  <td className={shared.tableCell} colSpan={5} style={{ textAlign: 'center' }}>
                    抽選結果はまだありません
                  </td>
                </tr>
              )}
              {resultRows.map((row) => (
                <tr key={row.x_id}>
                  <td className={shared.tableCell}>{row.name}</td>
                  <td className={shared.tableCell}>{row.x_id}</td>
                  <td className={shared.tableCell}>{row.lotteryType}</td>
                  <td className={shared.tableCell}>{row.casts.join(', ') || '未設定'}</td>
                  <td className={shared.tableCell}>
                    <NgCastResultCell ngCastNames={row.ngCastNames} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showGuaranteedSelect && (
        <ConfirmModal
          type="alert"
          title="確定当選者の選択"
          message={`現在 ${guaranteedWinners.length} 名を確定当選者として設定しています。合計当選者数は ${totalWinners} 名です。`}
          confirmLabel="閉じる"
          size="wide"
          onConfirm={() => setShowGuaranteedSelect(false)}
        >
          <div className={styles.guaranteedSelectModalList}>
            <div className={`${styles.guaranteedSelectModalList__scroll} ${shared.customScrollbar}`}>
              {allUsers.map((user) => {
                const isSelected = guaranteedIds.has(user.x_id);
                const displayName = user.name || user.x_id;
                return (
                  <button
                    key={user.x_id}
                    type="button"
                    className={`${styles.guaranteedSelectModalList__item}${isSelected ? ` ${styles.guaranteedSelectModalList__itemSelected}` : ''}`}
                    title={`${displayName}\n${user.x_id}`}
                    onClick={() => {
                        const nextGuaranteed = isSelected
                          ? guaranteedWinners.filter((winner) => winner.x_id !== user.x_id)
                          : [...guaranteedWinners, user];
                        setGuaranteedWinners(nextGuaranteed);
                    }}
                  >
                    <span className={styles.guaranteedSelectModalList__check}>{isSelected ? '選択中' : '未選択'}</span>
                    <span className={styles.guaranteedSelectModalList__name}>{displayName}</span>
                    <span className={styles.guaranteedSelectModalList__id}>{user.x_id}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </ConfirmModal>
      )}

      {confirmReplace && (
        <ConfirmModal
          type="confirm"
          title="抽選結果の上書き"
          message="現在の抽選結果を上書きします。よろしいですか。"
          confirmLabel="上書きする"
          cancelLabel="キャンセル"
          onConfirm={runLottery}
          onCancel={() => setConfirmReplace(false)}
        />
      )}
      {lotteryMessage && (
        <ConfirmModal
          type="alert"
          title="抽選結果"
          message={lotteryMessage}
          confirmLabel="閉じる"
          onConfirm={() => setLotteryMessage(null)}
        />
      )}
    </div>
  );
};
