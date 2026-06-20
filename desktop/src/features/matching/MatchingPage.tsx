import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { ConfirmModal } from '@/components/ConfirmModal';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { downloadTsv } from '@/common/downloadCsv';
import { LotteryValidationPanel } from '@/features/lottery/components/LotteryValidationPanel';
import { useLotteryValidation } from '@/features/lottery/hooks/useLotteryValidation';
import { MatchingConditionPanel } from '@/features/matching/components/MatchingConditionPanel';
import { CastAssignmentList, RotationMatchList } from '@/features/matching/components/MatchingResultCells';
import type { MatchedCast, MatchingFailureReason, MatchingScoreSummary, TableSlot } from '@/features/matching/logics/matching-io';
import { buildCastMatchingTsvRows } from '@/features/matching/presenters/matching-result-export';
import {
  buildCastResultRows,
  buildResultRows,
  formatFailureMessage,
  getAssignmentsForColumn,
  getCastResultColumnKeys,
  getCastResultColumnLabel,
  groupTableSlots,
} from '@/features/matching/presenters/matching-result-view';
import { FIXED_NG_JUDGMENT_TYPE } from '@/features/matching/types/matching-system-types';
import { useAppContext } from '@/stores/AppContext';
import styles from './MatchingPage.module.css';
import shared from '@/styles/shared.module.css';

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
    m003SameDaySlotCount,
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

  const guaranteedWinnerCount = winners.filter((winner) => winner.is_guaranteed).length;
  const totalSeatCount = matchingTypeCode === 'M003'
    ? totalTables * usersPerTable + (allowM003EmptySeats ? m003SameDaySlotCount : 0)
    : totalTables;
  const effectiveMatchingTableCount = matchingTypeCode === 'M003'
    ? Math.max(1, Math.ceil(totalSeatCount / usersPerTable))
    : totalTables;

  const validation = useLotteryValidation({
    matchingTypeCode,
    totalWinners: winners.length,
    lotteryCount: Math.max(0, winners.length - guaranteedWinnerCount),
    guaranteedCount: guaranteedWinnerCount,
    totalTables,
    activeCastCount: casts.filter((cast) => cast.is_present).length,
    castsPerRotation,
    usersPerTable,
    allowM003EmptySeats,
    sameDaySlotCount: m003SameDaySlotCount,
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
        totalTables: matchingTypeCode === 'M003' ? effectiveMatchingTableCount : totalTables,
        usersPerTable: matchingTypeCode === 'M003' ? usersPerTable : undefined,
        castsPerRotation: matchingTypeCode === 'M003' ? castsPerRotation : undefined,
        searchTimeLimitMs: MATCHING_SEARCH_TIME_LIMIT_MS,
        relaxedAfterMs: MATCHING_RELAXED_AFTER_MS,
        searchMode: matchingSettings.searchMode,
      },
      ngJudgmentType: FIXED_NG_JUDGMENT_TYPE,
      ngMatchingBehavior: 'exclude',
    });
  }, [winners, casts, matchingTypeCode, rotationCount, totalTables, usersPerTable, castsPerRotation, allowM003EmptySeats, m003SameDaySlotCount, effectiveMatchingTableCount, matchingSettings, setGlobalMatchingError, setGlobalMatchingResult, setGlobalTableSlots, setIsMatchingLocked, stopWorker]);

  const resultRows = useMemo(
    () => buildResultRows(winners, globalMatchingResult),
    [globalMatchingResult, winners],
  );

  const castResultRows = useMemo(
    () => buildCastResultRows(resultRows, casts),
    [casts, resultRows],
  );

  const castResultColumnKeys = useMemo(
    () => getCastResultColumnKeys(resultRows),
    [resultRows],
  );

  const groupedTables = useMemo(
    () => groupTableSlots(globalTableSlots),
    [globalTableSlots],
  );
  const castResultTableMinWidth = Math.max(760, 220 + castResultColumnKeys.length * 260);

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
              <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>マッチング実行</h2>
              <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>
                抽選設定で確定した条件を確認し、探索モードだけを選択して実行します。
              </p>
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
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(237, 66, 69, 0.14)', color: 'var(--discord-text-danger)' }}>
                  ※NGのマッチングがあります。可能な限り修正してください。
                </div>
              )}
            </section>
          )}
        </div>

        <aside className={styles.workflowTwoPane__side}>
          <LotteryValidationPanel
            validation={validation}
            onRunClick={handleRun}
            title="マッチングステータス"
            description="読み取り専用条件と出席状態をもとに実行可否を確認します。"
            readySubtext="マッチングを行う準備が完了しています"
            runLabel="マッチング開始"
          />
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
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>キャスト別結果</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>
              各キャストが応対する応募者をローテーション別に確認できます。
            </p>
          </div>
          {isMatchingLocked && (
            <button type="button" className={shared.btnExportSecondary} onClick={() => { void exportElementAsPng(resultRef.current, 'matching-casts'); }}>
              PNG出力
            </button>
          )}
        </div>

        <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 16 }}>
          <table className={styles.matchingResultTable} style={{ minWidth: castResultTableMinWidth }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--discord-bg-secondary)' }}>
                <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__cast}`}>キャスト</th>
                {castResultColumnKeys.map((columnKey) => (
                  <th key={columnKey ?? 'none'} className={shared.tableHeaderCell}>{getCastResultColumnLabel(columnKey)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {castResultRows.length === 0 && (
                <tr>
                  <td className={shared.tableCell} colSpan={castResultColumnKeys.length + 1} style={{ textAlign: 'center' }}>マッチング結果はまだありません</td>
                </tr>
              )}
              {castResultRows.map((row) => (
                <tr key={row.cast.name}>
                  <td className={`${shared.tableCell} ${styles.matchingResultTable__cast}`}>{row.cast.name}</td>
                  {castResultColumnKeys.map((columnKey) => (
                    <td key={columnKey ?? 'none'} className={`${shared.tableCell} ${styles.matchingResultTable__matches}`}>
                      <CastAssignmentList assignments={getAssignmentsForColumn(row, columnKey)} />
                    </td>
                  ))}
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
              テーブルごとの座席と担当キャストを表で確認できます。
            </p>
          </div>
          {isMatchingLocked && (
            <button type="button" className={shared.btnExportSecondary} onClick={() => { void exportElementAsPng(tableRef.current, 'matching-tables'); }}>
              PNG出力
            </button>
          )}
        </div>

        {groupedTables.length === 0 ? (
          <div className={shared.pageCardNarrow} style={{ marginTop: 16, padding: 16 }}>テーブル別結果はまだありません</div>
        ) : (
          <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 16 }}>
            <table className={`${styles.matchingResultTable} ${styles.matchingTableResultTable}`}>
              <thead>
                <tr style={{ backgroundColor: 'var(--discord-bg-secondary)' }}>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__table}`}>テーブル</th>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__seat}`}>席</th>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__guest}`}>応募者</th>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__id}`}>X ID</th>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__matches}`}>担当キャスト</th>
                </tr>
              </thead>
              <tbody>
                {groupedTables.flatMap(({ tableIndex, slots }) =>
                  slots.map((slot, index) => (
                    <tr key={`${tableIndex}-${index}`}>
                      <td className={`${shared.tableCell} ${styles.matchingResultTable__table}`}>テーブル {tableIndex}</td>
                      <td className={`${shared.tableCell} ${styles.matchingResultTable__seat}`}>{index + 1}</td>
                      <td className={`${shared.tableCell} ${styles.matchingResultTable__guest}`}>
                        {slot.user?.name ?? '空席'}
                      </td>
                      <td className={`${shared.tableCell} ${styles.matchingResultTable__id}`}>
                        {slot.user?.x_id ?? '未割り当て'}
                      </td>
                      <td className={`${shared.tableCell} ${styles.matchingResultTable__matches}`}>
                        {slot.matches.length === 0 ? (
                          <span className={styles.castResultEmpty}>キャスト未割り当て</span>
                        ) : (
                          <RotationMatchList matches={slot.matches} />
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isMatchingLocked && castResultRows.length > 0 && (
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
                buildCastMatchingTsvRows(castResultRows, castResultColumnKeys),
                backupFileName || 'matching-result',
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
