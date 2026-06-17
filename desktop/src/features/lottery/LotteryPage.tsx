import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSelect, type AppSelectOption } from '@/components/AppSelect';
import { ConfirmModal } from '@/components/ConfirmModal';
import { MATCHING_TYPE_CODES_SELECTABLE, MATCHING_TYPE_LABELS } from '@/features/matching/types/matching-type-codes';
import { LotteryValidationPanel } from './components/LotteryValidationPanel';
import { useLotteryValidation } from './hooks/useLotteryValidation';
import { useAppContext } from '@/stores/AppContext';
import {
  getSavedLotteryResults,
  getLotteryResults,
  listSavedLotteryRuns,
  replaceLotteryResults,
  saveLotteryRun,
  type SavedLotteryRunRow,
} from '@/db/repositories/lotteryRepository';
import { getSessionDb } from '@/db/database';
import type { UserBean } from '@/common/types/entities';
import styles from './LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

function shuffle<T>(items: readonly T[]): T[] {
  const copied = [...items];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copied[index], copied[swapIndex]] = [copied[swapIndex], copied[index]];
  }
  return copied;
}

interface ApplicantIdRow {
  id: number;
  x_id: string;
}

interface LotteryPersistenceRow {
  applicant_id: number;
  is_guaranteed: boolean;
}

interface LotteryRestoreRow {
  applicant_id: number;
  is_guaranteed: number;
}

async function getApplicantIdRows(): Promise<ApplicantIdRow[]> {
  const db = getSessionDb();
  return db.select<ApplicantIdRow[]>('SELECT id, x_id FROM applicants');
}

async function buildLotteryPersistenceRows(winners: UserBean[]): Promise<LotteryPersistenceRow[]> {
  const applicantRows = await getApplicantIdRows();
  const xIdToId = new Map(applicantRows.map((row) => [row.x_id, row.id]));
  return winners
    .map((winner) => {
      const id = xIdToId.get(winner.x_id);
      return id == null ? null : { applicant_id: id, is_guaranteed: !!winner.is_guaranteed };
    })
    .filter((row): row is LotteryPersistenceRow => row !== null);
}

async function restoreLotteryWinners(rows: LotteryRestoreRow[], applicants: UserBean[]): Promise<UserBean[]> {
  const applicantRows = await getApplicantIdRows();
  const idToXId = new Map(applicantRows.map((row) => [row.id, row.x_id]));
  const xIdToUser = new Map(applicants.map((user) => [user.x_id, user]));
  const restored: UserBean[] = [];
  for (const row of rows) {
    const xId = idToXId.get(row.applicant_id);
    if (!xId) continue;
    const user = xIdToUser.get(xId);
    if (!user) continue;
    restored.push({ ...user, is_guaranteed: row.is_guaranteed === 1 });
  }
  return restored;
}

function formatSavedLotteryLabel(winnerCount: number): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `抽選結果 ${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}（${winnerCount}名）`;
}

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

  // ──────────────────────────────────────────────────────────────────────────
  // Why we persist lottery results but NOT matching results:
  //   Lottery is stochastic — re-running produces a different winner set, and
  //   the user re-running is a deliberate destructive action they should opt
  //   into (the existing "上書き" modal handles that). To survive a session
  //   re-open we therefore round-trip the active winners through
  //   `lottery_results`. Saved runs are explicit snapshots that the user can
  //   choose again later.
  //   Matching, by contrast, is deterministic from (winners, casts,
  //   matching settings) so we just recompute it whenever the user lands on
  //   the matching page — no need to store, no risk of stale results.
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentSessionTimestamp) return;
    if (currentWinners.length > 0) return; // local state already populated
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

  const guaranteedIds = useMemo(
    () => new Set(guaranteedWinners.map((winner) => winner.x_id)),
    [guaranteedWinners],
  );

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

  const resultRows = currentWinners.map((winner) => ({
    ...winner,
    lotteryType: guaranteedIds.has(winner.x_id) || winner.is_guaranteed ? '確定当選' : '抽選当選',
  }));

  const handleSaveLotteryRun = useCallback(async () => {
    if (currentWinners.length === 0 || savingLotteryRun) return;
    setSavingLotteryRun(true);
    try {
      const rows = await buildLotteryPersistenceRows(currentWinners);
      if (rows.length === 0) {
        setLotteryMessage('保存できる抽選結果がありません。');
        return;
      }
      const runId = await saveLotteryRun({
        label: formatSavedLotteryLabel(rows.length),
        matchingTypeCode,
        lotteryCount,
        guaranteedCount: currentWinners.filter((winner) => winner.is_guaranteed).length,
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
    lotteryCount,
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
  ]);

  return (
    <div className={styles.lotteryScreen}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>抽選</h1>
        <p className={shared.pageHeaderSubtitle}>
          確定当選者と当選人数を設定し、抽選結果を確認してからマッチングへ進みます。
        </p>
      </header>

      <div className={styles.workflowTwoPane}>
        <section className={`${shared.sectionBlock} ${styles.workflowTwoPane__main}`}>
          <div className={styles.workflowSectionHeader}>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>抽選設定</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>
              memo.md の画面フローに合わせて、抽選設定と結果確認を分離しています。
            </p>
          </div>

          <div className={styles.workflowFormGrid}>
            <label className={shared.formGroup}>
              <span className={shared.formLabel}>当選人数</span>
              <input
                type="number"
                min={1}
                className={shared.formInput}
                value={lotteryCount}
                onChange={(event) => setLotteryCount(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>

            <label className={shared.formGroup}>
              <span className={shared.formLabel}>マッチング方式</span>
              <div className={styles.matchingTypeOptions}>
                {MATCHING_TYPE_CODES_SELECTABLE.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={`${styles.matchingTypeOption}${matchingTypeCode === code ? ` ${styles.matchingTypeOptionSelected}` : ''}`}
                    onClick={() => setMatchingTypeCode(code)}
                  >
                    {MATCHING_TYPE_LABELS[code]}
                  </button>
                ))}
              </div>
            </label>

            <label className={shared.formGroup}>
              <span className={shared.formLabel}>ラウンド数</span>
              <input
                type="number"
                min={1}
                className={shared.formInput}
                value={rotationCount}
                onChange={(event) => setRotationCount(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>

            <label className={shared.formGroup}>
              <span className={shared.formLabel}>総テーブル数</span>
              <input
                type="number"
                min={1}
                className={shared.formInput}
                value={totalTables}
                onChange={(event) => setTotalTables(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>

            <div className={`${styles.m003SettingsSlot}${matchingTypeCode === 'M003' ? '' : ` ${styles.m003SettingsSlotInactive}`}`}>
              {matchingTypeCode === 'M003' ? (
                <>
                  <label className={shared.formGroup}>
                    <span className={shared.formLabel}>1テーブルあたりのゲスト数</span>
                    <input
                      type="number"
                      min={1}
                      className={shared.formInput}
                      value={usersPerTable}
                      onChange={(event) => setUsersPerTable(Math.max(1, Number(event.target.value) || 1))}
                    />
                  </label>

                  <label className={shared.formGroup}>
                    <span className={shared.formLabel}>1ローテあたりのキャスト数</span>
                    <input
                      type="number"
                      min={1}
                      className={shared.formInput}
                      value={castsPerRotation}
                      onChange={(event) => setCastsPerRotation(Math.max(1, Number(event.target.value) || 1))}
                    />
                  </label>

                  <div className={shared.formGroup}>
                    <span className={shared.formLabel}>当日枠を含める</span>
                    <button
                      type="button"
                      className={`${styles.workflowSwitch}${allowM003EmptySeats ? ` ${styles.workflowSwitchOn}` : ''}`}
                      role="switch"
                      aria-checked={allowM003EmptySeats}
                      onClick={() => {
                        const next = !allowM003EmptySeats;
                        setAllowM003EmptySeats(next);
                        if (next && m003SameDaySlotCount < 1) {
                          setM003SameDaySlotCount(1);
                        }
                      }}
                    >
                      <span className={styles.workflowSwitch__knob} />
                      <span>{allowM003EmptySeats ? '含める' : '含めない'}</span>
                    </button>
                    <label className={`${styles.sameDaySlotControl}${allowM003EmptySeats ? '' : ` ${styles.sameDaySlotControlDisabled}`}`}>
                      <span>当日枠数</span>
                      <input
                        type="number"
                        min={1}
                        className={shared.formInput}
                        value={m003SameDaySlotCount}
                        disabled={!allowM003EmptySeats}
                        onChange={(event) => setM003SameDaySlotCount(Math.max(1, Number(event.target.value) || 1))}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <div className={styles.m003SettingsPlaceholder}>
                  M003 テーブル制を選択すると、テーブル単位の詳細条件を編集できます。
                </div>
              )}
            </div>

            <div className={styles.workflowInlineCard}>
              <div className={styles.workflowInlineCard__header}>
                <strong>確定当選者</strong>
                <span className={styles.workflowInlineCard__meta}>合計当選者 {totalWinners} 名</span>
                <button type="button" className={shared.btnSecondary} onClick={() => setShowGuaranteedSelect(true)}>
                  選択
                </button>
              </div>
              <div className={styles.workflowInlineCard__body}>
                {guaranteedWinners.length > 0
                  ? guaranteedWinners.map((winner) => winner.name || winner.x_id).join(', ')
                  : '未設定'}
              </div>
            </div>
          </div>
        </section>

        <aside className={styles.workflowTwoPane__side}>
          <LotteryValidationPanel
            validation={validation}
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

      <section className={`${shared.sectionBlock} ${styles.workflowResultSection}`}>
        <div className={`${styles.workflowSectionHeader} ${styles.workflowSectionHeaderRow}`}>
          <div>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>当選者リスト</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>
              抽選結果はDBに保存できます。保存済みの結果は後から選択し直せます。
            </p>
          </div>
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
            <button
              type="button"
              className={shared.btnPrimary}
              disabled={resultRows.length === 0}
              onClick={() => setActivePage('matching')}
            >
              マッチングへ
            </button>
          </div>
        </div>

        <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--discord-bg-secondary)' }}>
                <th className={shared.tableHeaderCell}>ユーザー</th>
                <th className={shared.tableHeaderCell}>X ID</th>
                <th className={shared.tableHeaderCell}>区分</th>
                <th className={shared.tableHeaderCell}>希望キャスト</th>
              </tr>
            </thead>
            <tbody>
              {resultRows.length === 0 && (
                <tr>
                  <td className={shared.tableCell} colSpan={4} style={{ textAlign: 'center' }}>
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
                return (
                  <button
                    key={user.x_id}
                    type="button"
                    className={`${styles.guaranteedSelectModalList__item}${isSelected ? ` ${styles.guaranteedSelectModalList__itemSelected}` : ''}`}
                    onClick={() => {
                        const nextGuaranteed = isSelected
                          ? guaranteedWinners.filter((winner) => winner.x_id !== user.x_id)
                          : [...guaranteedWinners, user];
                        setGuaranteedWinners(nextGuaranteed);
                    }}
                  >
                    <span className={styles.guaranteedSelectModalList__check}>{isSelected ? '選択中' : '未選択'}</span>
                    <span className={styles.guaranteedSelectModalList__name}>{user.name || user.x_id}</span>
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
