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
import { useAppContext, type CastBean, type UserBean } from '@/stores/AppContext';
import styles from './MatchingPage.module.css';
import shared from '@/styles/shared.module.css';

interface ResultRow {
  user: UserBean;
  matches: MatchedCast[];
}

interface CastResultAssignment {
  user: UserBean;
  match: MatchedCast;
}

interface CastResultRow {
  cast: CastBean;
  assignments: CastResultAssignment[];
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
const UNGROUPED_ROTATION_KEY = -1;
type MatchPreferenceTone = 'First' | 'Second' | 'Third' | 'Flat' | 'Outside';
interface RotationMatchGroup {
  rotationIndex: number | null;
  matches: MatchedCast[];
}

function buildResultRows(winners: UserBean[], resultMap: Map<string, MatchedCast[]> | null): ResultRow[] {
  if (!resultMap) {
    return [];
  }
  return winners.map((winner) => ({
    user: winner,
    matches: resultMap.get(winner.x_id) ?? [],
  }));
}

function buildCastResultRows(rows: ResultRow[], casts: CastBean[]): CastResultRow[] {
  if (rows.length === 0) {
    return [];
  }

  const castByName = new Map(casts.map((cast) => [cast.name, cast]));
  const castOrder = new Map(casts.map((cast, index) => [cast.name, index]));
  const assignmentsByCast = new Map<string, CastResultAssignment[]>();

  rows.forEach(({ user, matches }) => {
    matches.forEach((match) => {
      const current = assignmentsByCast.get(match.cast.name) ?? [];
      current.push({ user, match });
      assignmentsByCast.set(match.cast.name, current);
      if (!castByName.has(match.cast.name)) {
        castByName.set(match.cast.name, match.cast);
      }
    });
  });

  const castNames = new Set<string>();
  casts.filter((cast) => cast.is_present).forEach((cast) => castNames.add(cast.name));
  assignmentsByCast.forEach((_, castName) => castNames.add(castName));

  return [...castNames]
    .sort((left, right) => {
      const leftOrder = castOrder.get(left);
      const rightOrder = castOrder.get(right);
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return left.localeCompare(right, 'ja');
    })
    .map((castName) => ({
      cast: castByName.get(castName) ?? { name: castName, is_present: true },
      assignments: assignmentsByCast.get(castName) ?? [],
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

function getMatchPreference(match: MatchedCast): { label: string; tone: MatchPreferenceTone } {
  if (match.rank === 1) return { label: '第一希望', tone: 'First' };
  if (match.rank === 2) return { label: '第二希望', tone: 'Second' };
  if (match.rank === 3) return { label: '第三希望', tone: 'Third' };
  if (typeof match.score === 'number' && match.score > 0) return { label: '希望', tone: 'Flat' };
  return { label: '希望外', tone: 'Outside' };
}

function getRotationLabel(rotationIndex: number | null | undefined): string {
  if (typeof rotationIndex !== 'number' || rotationIndex < 0) {
    return 'ローテ未設定';
  }
  return `第${rotationIndex + 1}ローテ`;
}

function groupMatchesByRotation(matches: MatchedCast[]): RotationMatchGroup[] {
  const grouped = new Map<number, MatchedCast[]>();
  matches.forEach((match) => {
    const key = typeof match.rotationIndex === 'number' ? match.rotationIndex : UNGROUPED_ROTATION_KEY;
    const current = grouped.get(key) ?? [];
    current.push(match);
    grouped.set(key, current);
  });

  return [...grouped.entries()]
    .sort((left, right) => {
      if (left[0] === UNGROUPED_ROTATION_KEY) return 1;
      if (right[0] === UNGROUPED_ROTATION_KEY) return -1;
      return left[0] - right[0];
    })
    .map(([rotationIndex, groupMatches]) => ({
      rotationIndex: rotationIndex === UNGROUPED_ROTATION_KEY ? null : rotationIndex,
      matches: groupMatches,
    }));
}

function collectRotationIndexes(rows: ResultRow[]): number[] {
  const indexes = new Set<number>();
  rows.forEach(({ matches }) => {
    matches.forEach((match) => {
      if (typeof match.rotationIndex === 'number') {
        indexes.add(match.rotationIndex);
      }
    });
  });
  return [...indexes].sort((left, right) => left - right);
}

function getCastResultColumnKeys(rows: ResultRow[]): Array<number | null> {
  const rotationIndexes = collectRotationIndexes(rows);
  return rotationIndexes.length > 0 ? rotationIndexes : [null];
}

function getCastResultColumnLabel(columnKey: number | null): string {
  return columnKey === null ? '応対する応募者' : getRotationLabel(columnKey);
}

function getAssignmentsForColumn(row: CastResultRow, columnKey: number | null): CastResultAssignment[] {
  if (columnKey === null) {
    return row.assignments;
  }
  return row.assignments.filter((assignment) => assignment.match.rotationIndex === columnKey);
}

function formatCastAssignmentForTsv(assignment: CastResultAssignment): string {
  const preference = getMatchPreference(assignment.match);
  const warning = assignment.match.isNGWarning ? ' / NG' : '';
  return `${assignment.user.name} (${assignment.user.x_id} / ${preference.label}${warning})`;
}

function buildCastMatchingTsvRows(rows: CastResultRow[], columnKeys: Array<number | null>): (string | number)[][] {
  return [
    ['キャスト名', ...columnKeys.map(getCastResultColumnLabel)],
    ...rows.map((row) => [
      row.cast.name,
      ...columnKeys.map((columnKey) =>
        getAssignmentsForColumn(row, columnKey)
          .map(formatCastAssignmentForTsv)
          .join(', '),
      ),
    ]),
  ];
}

function getMatchChipClassName(match: MatchedCast): string {
  const preference = getMatchPreference(match);
  const toneClassMap: Record<MatchPreferenceTone, string> = {
    First: styles.matchChipFirst,
    Second: styles.matchChipSecond,
    Third: styles.matchChipThird,
    Flat: styles.matchChipFlat,
    Outside: styles.matchChipOutside,
  };
  return [
    styles.matchChip,
    toneClassMap[preference.tone],
    match.isNGWarning ? styles.matchChipNg : '',
  ].filter(Boolean).join(' ');
}

function getApplicantAssignmentClassName(match: MatchedCast): string {
  const preference = getMatchPreference(match);
  const toneClassMap: Record<MatchPreferenceTone, string> = {
    First: styles.applicantAssignmentFirst,
    Second: styles.applicantAssignmentSecond,
    Third: styles.applicantAssignmentThird,
    Flat: styles.applicantAssignmentFlat,
    Outside: styles.applicantAssignmentOutside,
  };
  return [
    styles.applicantAssignment,
    toneClassMap[preference.tone],
    match.isNGWarning ? styles.applicantAssignmentNg : '',
  ].filter(Boolean).join(' ');
}

const MatchChip: React.FC<{ match: MatchedCast }> = ({ match }) => {
  const preference = getMatchPreference(match);
  return (
    <span className={getMatchChipClassName(match)} title={match.ngReason ?? `${match.cast.name}: ${preference.label}`}>
      <span className={styles.matchChipName}>{match.cast.name}</span>
      <span className={styles.matchChipRank}>{preference.label}</span>
    </span>
  );
};

const RotationMatchList: React.FC<{ matches: MatchedCast[] }> = ({ matches }) => {
  const groups = groupMatchesByRotation(matches);
  return (
    <div className={styles.matchRotationStack}>
      {groups.map((group) => (
        <div key={group.rotationIndex ?? 'ungrouped'} className={styles.matchRotationGroup}>
          <span className={styles.matchRotationLabel}>{getRotationLabel(group.rotationIndex)}</span>
          <div className={styles.matchChipList}>
            {group.matches.map((match, index) => (
              <MatchChip key={`${group.rotationIndex ?? 'ungrouped'}-${match.cast.name}-${index}`} match={match} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const CastAssignmentList: React.FC<{ assignments: CastResultAssignment[] }> = ({ assignments }) => {
  if (assignments.length === 0) {
    return <span className={styles.castResultEmpty}>なし</span>;
  }

  return (
    <div className={styles.applicantAssignmentList}>
      {assignments.map((assignment) => {
        const preference = getMatchPreference(assignment.match);
        return (
          <div
            key={`${assignment.user.x_id}-${assignment.match.cast.name}-${assignment.match.rotationIndex ?? 'none'}`}
            className={getApplicantAssignmentClassName(assignment.match)}
            title={assignment.match.ngReason ?? `${assignment.user.name}: ${preference.label}`}
          >
            <span className={styles.applicantAssignmentName}>{assignment.user.name}</span>
            <span className={styles.applicantAssignmentId}>{assignment.user.x_id}</span>
            <span className={styles.applicantAssignmentRank}>{preference.label}</span>
          </div>
        );
      })}
    </div>
  );
};

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
      ngJudgmentType: matchingSettings.ngJudgmentType,
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
                <span className={styles.workflowMetaCard__label}>{matchingTypeCode === 'M003' ? '合計席数' : '総テーブル数'}</span>
                <strong>{matchingTypeCode === 'M003' ? `${totalSeatCount} 席` : totalTables}</strong>
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
