import React, { useMemo, useState } from 'react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { downloadTsv } from '@/common/downloadCsv';
import { MATCHING_TYPE_CODES_SELECTABLE, MATCHING_TYPE_LABELS } from '@/features/matching/types/matching-type-codes';
import { LotteryValidationPanel } from './components/LotteryValidationPanel';
import { useLotteryValidation } from './hooks/useLotteryValidation';
import { useAppContext } from '@/stores/AppContext';
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
  } = useAppContext();

  const allUsers = applicants;
  const activeCastCount = casts.filter((cast) => cast.is_present).length;

  const [lotteryCount, setLotteryCount] = useState(1);
  const [backupFileName, setBackupFileName] = useState('lottery-result');
  const [showGuaranteedSelect, setShowGuaranteedSelect] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const totalWinners = lotteryCount + guaranteedWinners.length;
  const validation = useLotteryValidation({
    matchingTypeCode,
    totalWinners,
    totalTables,
    activeCastCount,
    castsPerRotation,
    usersPerTable,
    allowM003EmptySeats,
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
  };

  const resultRows = currentWinners.map((winner) => ({
    ...winner,
    lotteryType: guaranteedIds.has(winner.x_id) || winner.is_guaranteed ? '確定当選' : '抽選当選',
  }));

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
              <select
                className={shared.formInput}
                value={matchingTypeCode}
                onChange={(event) => setMatchingTypeCode(event.target.value as typeof matchingTypeCode)}
              >
                {MATCHING_TYPE_CODES_SELECTABLE.map((code) => (
                  <option key={code} value={code}>
                    {MATCHING_TYPE_LABELS[code]}
                  </option>
                ))}
              </select>
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

            {matchingTypeCode === 'M003' && (
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

                <label className={styles.workflowCheckbox}>
                  <input
                    type="checkbox"
                    checked={allowM003EmptySeats}
                    onChange={(event) => setAllowM003EmptySeats(event.target.checked)}
                  />
                  <span>空席を許容する</span>
                </label>
              </>
            )}

            <div className={styles.workflowInlineCard}>
              <div className={styles.workflowInlineCard__header}>
                <strong>確定当選者</strong>
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
              抽選結果を TSV で保存し、必要ならそのままマッチング画面へ遷移します。
            </p>
          </div>
        </div>

        <div className={styles.workflowResultToolbar}>
          <label className={`${shared.formGroup} ${styles.workflowResultToolbar__filename}`}>
            <span className={shared.formLabel}>バックアップファイル名</span>
            <input
              type="text"
              className={shared.formInput}
              value={backupFileName}
              onChange={(event) => setBackupFileName(event.target.value)}
              placeholder="lottery-result"
            />
          </label>
          <div className={styles.workflowResultToolbar__actions}>
            <button
              type="button"
              className={shared.btnExportPrimary}
              disabled={resultRows.length === 0}
              onClick={() =>
                downloadTsv(
                  [
                    ['ユーザー', 'X ID', '区分', '希望キャスト'],
                    ...resultRows.map((row) => [
                      row.name,
                      row.x_id,
                      row.lotteryType,
                      row.casts.join(', '),
                    ]),
                  ],
                  `${backupFileName || 'lottery-result'}.tsv`,
                )
              }
            >
              TSV保存
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
          message={`現在 ${guaranteedWinners.length} 名を確定当選者として設定しています。`}
          confirmLabel="閉じる"
          onConfirm={() => setShowGuaranteedSelect(false)}
        >
          <div className={styles.guaranteedSelectModalList}>
            <div className={`${styles.guaranteedSelectModalList__scroll} ${shared.customScrollbar}`}>
              {allUsers.map((user) => {
                const isSelected = guaranteedIds.has(user.x_id);
                return (
                  <label key={user.x_id} className={styles.guaranteedSelectModalList__item}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const nextGuaranteed = isSelected
                          ? guaranteedWinners.filter((winner) => winner.x_id !== user.x_id)
                          : [...guaranteedWinners, user];
                        setGuaranteedWinners(nextGuaranteed);
                      }}
                    />
                    <span className={styles.guaranteedSelectModalList__name}>{user.name || user.x_id}</span>
                    <span className={styles.guaranteedSelectModalList__id}>{user.x_id}</span>
                  </label>
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
    </div>
  );
};
