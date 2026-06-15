import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { ConfirmModal } from '@/components/ConfirmModal';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { downloadTsv } from '@/common/downloadCsv';
import { LotteryValidationPanel } from '@/features/lottery/components/LotteryValidationPanel';
import { useLotteryValidation } from '@/features/lottery/hooks/useLotteryValidation';
import { MatchingConditionPanel } from '@/features/matching/components/MatchingConditionPanel';
import type { MatchedCast, MatchingFailureReason, MatchingScoreSummary, TableSlot } from '@/features/matching/logics/matching-io';
import { MATCHING_TYPE_LABELS } from '@/features/matching/types/matching-type-codes';
import { useAppContext, type UserBean } from '@/stores/AppContext';
import styles from './MatchingPage.module.css';
import shared from '@/styles/shared.module.css';

interface ResultRow {
  user: UserBean;
  matches: MatchedCast[];
}

interface MatchingWorkerResult {
  userMapEntries: Array<[string, MatchedCast[]]>;
  tableSlots?: TableSlot[];
  ngConflict?: boolean;
  failureReason?: MatchingFailureReason;
  scoreSummary?: MatchingScoreSummary;
}

type MatchingWorkerMessage =
  | { type: 'complete'; id: string; result: MatchingWorkerResult }
  | { type: 'error'; id: string; message: string };

const MATCHING_SEARCH_TIME_LIMIT_MS = 30_000;
const MATCHING_RELAXED_AFTER_MS = 10_000;

function buildResultRows(winners: UserBean[], resultMap: Map<string, MatchedCast[]> | null): ResultRow[] {
  if (!resultMap) {
    return [];
  }
  return winners.map((winner) => ({
    user: winner,
    matches: resultMap.get(winner.x_id) ?? [],
  }));
}

function formatFailureMessage(reason: MatchingFailureReason | undefined): string {
  switch (reason) {
    case 'time-limit':
      return 'マッチングが見つかりませんでした。30秒以内に、NGなしで成立する組み合わせを作成できませんでした。';
    case 'insufficient-capacity':
      return '出勤キャスト数またはテーブル数が不足しているため、有効な割り当てを作れませんでした。';
    case 'invalid-settings':
      return 'マッチング設定に不整合があるため、有効な割り当てを作れませんでした。';
    case 'ng-conflict':
    default:
      return 'NG 条件により有効な割り当てを作れませんでした。設定か対象データを見直してください。';
  }
}

function formatMatch(match: MatchedCast): string {
  const rankLabel = match.rank > 0 ? `${match.rank}位` : (typeof match.score === 'number' && match.score > 0 ? '希望' : '希望外');
  const scoreLabel = typeof match.score === 'number' ? ` / ${match.score}点` : '';
  return `${match.cast.name}（${rankLabel}${scoreLabel}${match.isNGWarning ? ' / NG' : ''}）`;
}

function groupTableSlots(tableSlots: TableSlot[] | undefined): Array<{ tableIndex: number; slots: TableSlot[] }> {
  if (!tableSlots || tableSlots.length === 0) {
    return [];
  }

  const grouped = new Map<number, TableSlot[]>();
  tableSlots.forEach((slot, index) => {
    const tableIndex = slot.tableIndex ?? index + 1;
    const current = grouped.get(tableIndex) ?? [];
    current.push(slot);
    grouped.set(tableIndex, current);
  });

  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([tableIndex, slots]) => ({ tableIndex, slots }));
}

async function exportElementAsPng(node: HTMLElement | null, filename: string): Promise<void> {
  if (!node) {
    return;
  }
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  anchor.click();
}

export const MatchingPage: React.FC = () => {
  const {
    currentWinners: winners,
    casts,
    globalMatchingResult,
    globalTableSlots,
    globalMatchingError,
    setGlobalMatchingResult,
    setGlobalTableSlots,
    setGlobalMatchingError,
    isMatchingLocked,
    setIsMatchingLocked,
    resetMatching,
    matchingTypeCode,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    allowM003EmptySeats,
    matchingSettings,
  } = useAppContext();

  const [alertMessage, setAlertMessage] = useState<string | null>(globalMatchingError);
  const [scoreSummary, setScoreSummary] = useState<MatchingScoreSummary | null>(null);
  const [backupFileName, setBackupFileName] = useState('matching-result');
  const resultRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    setAlertMessage(globalMatchingError);
  }, [globalMatchingError]);

  const validation = useLotteryValidation({
    matchingTypeCode,
    totalWinners: winners.length,
    totalTables,
    activeCastCount: casts.filter((cast) => cast.is_present).length,
    castsPerRotation,
    usersPerTable,
    allowM003EmptySeats,
  });

  const [isComputing, setIsComputing] = useState(false);

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    workerRequestIdRef.current = null;
  }, []);

  const handleCancelMatching = useCallback(() => {
    stopWorker();
    setIsComputing(false);
    setGlobalMatchingError('マッチングをキャンセルしました。');
    setIsMatchingLocked(false);
  }, [setGlobalMatchingError, setIsMatchingLocked, stopWorker]);

  useEffect(() => () => stopWorker(), [stopWorker]);

  const handleRun = useCallback(() => {
    stopWorker();
    setIsComputing(true);
    setGlobalMatchingError(null);

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    workerRequestIdRef.current = requestId;
    const worker = new Worker(new URL('./matching.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<MatchingWorkerMessage>) => {
      const message = event.data;
      if (message.id !== workerRequestIdRef.current) return;

      stopWorker();
      setIsComputing(false);

      if (message.type === 'error') {
        setGlobalMatchingResult(null);
        setGlobalTableSlots(undefined);
        setScoreSummary(null);
        setGlobalMatchingError(message.message);
        setIsMatchingLocked(false);
        return;
      }

      const result = message.result;
      if (result.ngConflict) {
        setGlobalMatchingResult(null);
        setGlobalTableSlots(undefined);
        setScoreSummary(null);
        setGlobalMatchingError(formatFailureMessage(result.failureReason));
        setIsMatchingLocked(false);
      } else {
        setGlobalMatchingResult(new Map(result.userMapEntries));
        setGlobalTableSlots(result.tableSlots);
        setScoreSummary(result.scoreSummary ?? null);
        setGlobalMatchingError(null);
        setIsMatchingLocked(true);
      }
    };

    worker.onerror = () => {
      if (requestId !== workerRequestIdRef.current) return;
      stopWorker();
      setIsComputing(false);
      setGlobalMatchingResult(null);
      setGlobalTableSlots(undefined);
      setScoreSummary(null);
      setGlobalMatchingError('マッチング中に予期しないエラーが発生しました。');
      setIsMatchingLocked(false);
    };

    worker.postMessage({
      id: requestId,
      winners,
      casts,
      matchingTypeCode,
      options: {
        rotationCount,
        totalTables,
        usersPerTable: matchingTypeCode === 'M003' ? usersPerTable : undefined,
        castsPerRotation: matchingTypeCode === 'M003' ? castsPerRotation : undefined,
        searchTimeLimitMs: MATCHING_SEARCH_TIME_LIMIT_MS,
        relaxedAfterMs: MATCHING_RELAXED_AFTER_MS,
        searchMode: matchingSettings.searchMode,
      },
      ngJudgmentType: matchingSettings.ngJudgmentType,
      ngMatchingBehavior: 'exclude',
    });
  }, [winners, casts, matchingTypeCode, rotationCount, totalTables, usersPerTable, castsPerRotation, matchingSettings, setGlobalMatchingError, setGlobalMatchingResult, setGlobalTableSlots, setIsMatchingLocked, stopWorker]);

  const resultRows = useMemo(
    () => buildResultRows(winners, globalMatchingResult),
    [globalMatchingResult, winners],
  );

  const groupedTables = useMemo(
    () => groupTableSlots(globalTableSlots),
    [globalTableSlots],
  );

  return (
    <div className={styles.matchingScreen} style={{ paddingBottom: 80, position: 'relative' }}>
      {isComputing && <LoadingOverlay message="マッチング計算中…（最大30秒）" onCancel={handleCancelMatching} />}
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>マッチング</h1>
        <p className={shared.pageHeaderSubtitle}>
          memo.md の仕様に合わせて、設定確認、結果表示、PNG・TSV出力を分けています。
        </p>
      </header>

      <div className={styles.workflowTwoPane}>
        <div className={styles.workflowTwoPane__main}>
          <section className={shared.sectionBlock}>
            <div className={styles.workflowSectionHeader}>
              <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>マッチング設定</h2>
              <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>
                必要な設定だけを上段に集約し、実行後の確認領域とは分離しています。
              </p>
            </div>

            <div className={styles.workflowMetaGrid}>
              <div className={styles.workflowMetaCard}>
                <span className={styles.workflowMetaCard__label}>方式</span>
                <strong>{MATCHING_TYPE_LABELS[matchingTypeCode]}</strong>
              </div>
              <div className={styles.workflowMetaCard}>
                <span className={styles.workflowMetaCard__label}>当選者数</span>
                <strong>{winners.length} 名</strong>
              </div>
              <div className={styles.workflowMetaCard}>
                <span className={styles.workflowMetaCard__label}>ラウンド数</span>
                <strong>{rotationCount}</strong>
              </div>
              <div className={styles.workflowMetaCard}>
                <span className={styles.workflowMetaCard__label}>総テーブル数</span>
                <strong>{totalTables}</strong>
              </div>
            </div>

            <MatchingConditionPanel disabled={isMatchingLocked} />
          </section>

          {scoreSummary && (
            <section className={shared.sectionBlock} style={{ marginTop: 16 }}>
              <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>スコアサマリー</h2>
              <p className={shared.pageHeaderSubtitle}>
                総スコア {scoreSummary.totalScore} 点 / 平均 {scoreSummary.averageScore.toFixed(1)} 点 / 1位 {scoreSummary.firstChoiceCount} 件 / 2位 {scoreSummary.secondChoiceCount} 件 / 3位 {scoreSummary.thirdChoiceCount} 件 / 希望外 {scoreSummary.unpreferredCount} 件
              </p>
              {scoreSummary.ngWarningCount > 0 && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(237, 66, 69, 0.14)', color: 'var(--discord-danger)' }}>
                  ※NGのマッチングがあります。可能な限り修正してください。
                </div>
              )}
            </section>
          )}
        </div>

        <aside className={styles.workflowTwoPane__side}>
          <LotteryValidationPanel validation={validation} onRunClick={handleRun} />
          {isMatchingLocked && (
            <button type="button" className={shared.btnDanger} style={{ width: '100%', marginTop: 12 }} onClick={resetMatching}>
              結果を解除して再実行
            </button>
          )}
        </aside>
      </div>

      <section ref={resultRef} className={`${shared.sectionBlock} ${styles.workflowResultSection}`} style={{ marginTop: 24 }}>
        <div className={`${styles.workflowSectionHeader} ${styles.workflowSectionHeaderRow}`}>
          <div>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>ユーザー別結果</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>
              抽選当選者ごとの割り当て結果を一覧で確認できます。
            </p>
          </div>
          {isMatchingLocked && (
            <button type="button" className={shared.btnExportSecondary} onClick={() => { void exportElementAsPng(resultRef.current, 'matching-users'); }}>
              PNG出力
            </button>
          )}
        </div>

        <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--discord-bg-secondary)' }}>
                <th className={shared.tableHeaderCell}>ユーザー</th>
                <th className={shared.tableHeaderCell}>X ID</th>
                <th className={shared.tableHeaderCell}>区分</th>
                <th className={shared.tableHeaderCell}>割り当てキャスト</th>
              </tr>
            </thead>
            <tbody>
              {resultRows.length === 0 && (
                <tr>
                  <td className={shared.tableCell} colSpan={4} style={{ textAlign: 'center' }}>マッチング結果はまだありません</td>
                </tr>
              )}
              {resultRows.map(({ user, matches }) => (
                <tr key={user.x_id}>
                  <td className={shared.tableCell}>{user.name}</td>
                  <td className={shared.tableCell}>{user.x_id}</td>
                  <td className={shared.tableCell}>{user.is_guaranteed ? '確定当選' : '抽選当選'}</td>
                  <td className={shared.tableCell}>
                    {matches.length === 0 ? '未割り当て' : matches.map((match) => (
                      <span key={`${user.x_id}-${match.cast.name}`} style={match.isNGWarning ? { color: 'var(--discord-danger)', fontWeight: 700 } : undefined} title={match.ngReason}>
                        {formatMatch(match)}{' '}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section ref={tableRef} className={`${shared.sectionBlock} ${styles.workflowResultSection}`} style={{ marginTop: 24 }}>
        <div className={`${styles.workflowSectionHeader} ${styles.workflowSectionHeaderRow}`}>
          <div>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>テーブル別結果</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>
              ローテーションとテーブル配置をカードで確認できます。
            </p>
          </div>
          {isMatchingLocked && (
            <button type="button" className={shared.btnExportSecondary} onClick={() => { void exportElementAsPng(tableRef.current, 'matching-tables'); }}>
              PNG出力
            </button>
          )}
        </div>

        {groupedTables.length === 0 ? (
          <div className={shared.pageCardNarrow} style={{ marginTop: 16, padding: 16 }}>テーブル結果はまだありません</div>
        ) : (
          <div className={styles.matchingTableGrid}>
            {groupedTables.map(({ tableIndex, slots }) => (
              <article key={tableIndex} className={styles.matchingTableCard}>
                <h3 className={styles.matchingTableCard__title}>テーブル {tableIndex}</h3>
                <div className={styles.matchingTableCard__list}>
                  {slots.map((slot, index) => (
                    <div key={`${tableIndex}-${index}`} className={styles.matchingTableCard__item}>
                      <div className={styles.matchingTableCard__guest}>{slot.user?.name ?? `空席 ${index + 1}`}</div>
                      <div className={styles.matchingTableCard__id}>{slot.user?.x_id ?? '未割り当て'}</div>
                      <div className={styles.matchingTableCard__casts}>
                        {slot.matches.length === 0 ? 'キャスト未割り当て' : slot.matches.map((match) => (
                          <span key={`${tableIndex}-${index}-${match.cast.name}`} style={match.isNGWarning ? { color: 'var(--discord-danger)', fontWeight: 700 } : undefined} title={match.ngReason}>
                            {formatMatch(match)}{' '}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {isMatchingLocked && resultRows.length > 0 && (
        <div className={styles.workflowResultToolbar} style={{ marginTop: 24 }}>
          <label className={`${shared.formGroup} ${styles.workflowResultToolbar__filename}`}>
            <span className={shared.formLabel}>バックアップファイル名</span>
            <input
              type="text"
              className={shared.formInput}
              value={backupFileName}
              onChange={(event) => setBackupFileName(event.target.value)}
              placeholder="matching-result"
            />
          </label>
          <button
            type="button"
            className={shared.btnExportPrimary}
            onClick={() =>
              downloadTsv(
                [
                  ['ユーザー', 'X ID', '区分', '割り当てキャスト', 'NG警告'],
                  ...resultRows.map(({ user, matches }) => [
                    user.name,
                    user.x_id,
                    user.is_guaranteed ? '確定当選' : '抽選当選',
                    matches.map(formatMatch).join(', '),
                    matches.filter((match) => match.isNGWarning).map((match) => match.ngReason ?? `${match.cast.name} はNG対象です`).join(', '),
                  ]),
                ],
                `${backupFileName || 'matching-result'}.tsv`,
              )
            }
          >
            TSV保存
          </button>
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
