import React, { useMemo, useRef, useState } from 'react';
import type { CastBean, UserBean } from '@/common/types/entities';
import { downloadTsv } from '@/common/downloadTsv';
import { NoticeDialog } from '@/components/ConfirmModal';
import type {
  MatchedCast,
  MatchingScoreSummary,
  TableSlot,
} from '@/features/matching/logics/matching-io';
import { CastAssignmentList } from '@/features/matching/components/MatchingResultCells';
import { MatchingTableRows } from '@/features/matching/components/MatchingTableRows';
import {
  buildCastMatchingTsvRows,
  exportElementAsPng,
} from '@/features/matching/presenters/matching-result-export';
import {
  buildCastResultRows,
  buildResultRows,
  getAssignmentsForColumn,
  getCastResultColumnKeys,
  getCastResultColumnLabel,
  groupTableSlots,
} from '@/features/matching/presenters/matching-result-view';
import { getMsg } from '@/messages/getMsg';
import styles from '../MatchingPage.module.css';
import shared from '@/styles/shared.module.css';

const DEFAULT_BACKUP_FILE_NAME = getMsg('MatchingPage.defaultBackupFileName');
const CAST_RESULT_IMAGE_FILE_NAME = getMsg('MatchingPage.castResultImageFileName');
const TABLE_RESULT_IMAGE_FILE_NAME = getMsg('MatchingPage.tableResultImageFileName');

type PngExportTarget = 'cast' | 'table';

interface ExportError {
  title: string;
  message: string;
}

interface MatchingResultsViewProps {
  winners: UserBean[];
  casts: CastBean[];
  result: Map<string, MatchedCast[]> | null;
  tableSlots: TableSlot[] | undefined;
  scoreSummary: MatchingScoreSummary | null;
  showExportActions: boolean;
}

/** 現行結果と保存済み履歴で共通の、キャスト別・テーブル別結果を表示する。 */
export const MatchingResultsView: React.FC<MatchingResultsViewProps> = ({
  winners,
  casts,
  result,
  tableSlots,
  scoreSummary,
  showExportActions,
}) => {
  const castResultTableRef = useRef<HTMLDivElement>(null);
  const tableResultTableRef = useRef<HTMLDivElement>(null);
  // 再描画前の連続クリックと、二つの結果表の同時出力を同じロックで抑止する。
  const pngExportInProgressRef = useRef(false);
  const [pngExportTarget, setPngExportTarget] = useState<PngExportTarget | null>(null);
  const [exportError, setExportError] = useState<ExportError | null>(null);
  const [backupFileName, setBackupFileName] = useState(DEFAULT_BACKUP_FILE_NAME);
  const resultRows = useMemo(
    () => buildResultRows(winners, result),
    [result, winners],
  );
  const castResultRows = useMemo(
    () => buildCastResultRows(resultRows, casts),
    [casts, resultRows],
  );
  const castResultColumnKeys = useMemo(
    () => getCastResultColumnKeys(resultRows),
    [resultRows],
  );
  const groupedTables = useMemo(() => groupTableSlots(tableSlots), [tableSlots]);
  const castResultTableMinWidth = Math.max(760, 220 + castResultColumnKeys.length * 260);
  const totalAssignmentCount = scoreSummary
    ? scoreSummary.firstChoiceCount
      + scoreSummary.secondChoiceCount
      + scoreSummary.thirdChoiceCount
      + scoreSummary.flatPreferenceCount
      + scoreSummary.unpreferredCount
    : 0;

  const exportPng = async (
    target: PngExportTarget,
    node: HTMLElement | null,
    filename: string,
  ) => {
    if (pngExportInProgressRef.current) return;
    if (!node) {
      setExportError({
        title: getMsg('MatchingPage.pngExportFailedTitle'),
        message: getMsg('MatchingPage.pngExportFailed'),
      });
      return;
    }

    pngExportInProgressRef.current = true;
    setPngExportTarget(target);
    try {
      await exportElementAsPng(node, filename);
    } catch {
      setExportError({
        title: getMsg('MatchingPage.pngExportFailedTitle'),
        message: getMsg('MatchingPage.pngExportFailed'),
      });
    } finally {
      pngExportInProgressRef.current = false;
      setPngExportTarget(null);
    }
  };

  const handleExportCastResults = () => {
    void exportPng('cast', castResultTableRef.current, CAST_RESULT_IMAGE_FILE_NAME);
  };

  const handleExportTableResults = () => {
    void exportPng('table', tableResultTableRef.current, TABLE_RESULT_IMAGE_FILE_NAME);
  };

  const handleExportCastResultsAsTsv = () => {
    try {
      downloadTsv(
        buildCastMatchingTsvRows(castResultRows, castResultColumnKeys),
        backupFileName || DEFAULT_BACKUP_FILE_NAME,
      );
    } catch {
      setExportError({
        title: getMsg('MatchingPage.tsvExportFailedTitle'),
        message: getMsg('MatchingPage.tsvExportFailed'),
      });
    }
  };

  return (
    <>
      {scoreSummary && (
        <section className={`${shared.sectionBlock} ${styles.scoreSummarySection}`}>
          <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>{getMsg('MatchingPage.scoreSummaryHeading')}</h2>
          <p className={`${shared.pageHeaderSubtitle} ${styles.scoreSummaryDescription}`}>{getMsg('MatchingPage.scoreSummaryDescription')}</p>
          <dl className={styles.scoreSummaryList}>
            <div className={styles.scoreSummaryItem}>
              <dt className={styles.scoreSummaryTerm}>{getMsg('MatchingPage.scoreSummaryTotalAssignments')}</dt>
              <dd className={styles.scoreSummaryCount}>{getMsg('MatchingPage.scoreSummaryCount', { count: totalAssignmentCount })}</dd>
            </div>
            <div className={styles.scoreSummaryItem}>
              <dt className={styles.scoreSummaryTerm}>{getMsg('MatchingPage.scoreSummaryFirstChoice')}</dt>
              <dd className={styles.scoreSummaryCount}>{getMsg('MatchingPage.scoreSummaryCount', { count: scoreSummary.firstChoiceCount })}</dd>
            </div>
            <div className={styles.scoreSummaryItem}>
              <dt className={styles.scoreSummaryTerm}>{getMsg('MatchingPage.scoreSummarySecondChoice')}</dt>
              <dd className={styles.scoreSummaryCount}>{getMsg('MatchingPage.scoreSummaryCount', { count: scoreSummary.secondChoiceCount })}</dd>
            </div>
            <div className={styles.scoreSummaryItem}>
              <dt className={styles.scoreSummaryTerm}>{getMsg('MatchingPage.scoreSummaryThirdChoice')}</dt>
              <dd className={styles.scoreSummaryCount}>{getMsg('MatchingPage.scoreSummaryCount', { count: scoreSummary.thirdChoiceCount })}</dd>
            </div>
            <div className={styles.scoreSummaryItem}>
              <dt className={styles.scoreSummaryTerm}>{getMsg('MatchingPage.scoreSummaryFlatPreference')}</dt>
              <dd className={styles.scoreSummaryCount}>{getMsg('MatchingPage.scoreSummaryCount', { count: scoreSummary.flatPreferenceCount })}</dd>
            </div>
            <div className={styles.scoreSummaryItem}>
              <dt className={styles.scoreSummaryTerm}>{getMsg('MatchingPage.scoreSummaryUnpreferred')}</dt>
              <dd className={styles.scoreSummaryCount}>{getMsg('MatchingPage.scoreSummaryCount', { count: scoreSummary.unpreferredCount })}</dd>
            </div>
          </dl>
          {scoreSummary.ngWarningCount > 0 && <p className={styles.scoreWarning} role="alert">{getMsg('MatchingPage.ngWarning', { count: scoreSummary.ngWarningCount })}</p>}
        </section>
      )}

      <section className={shared.sectionBlock} style={{ marginTop: 24 }}>
        <div className={`${styles.workflowSectionHeader} ${styles.workflowSectionHeaderRow}`}>
          <div>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>{getMsg('MatchingPage.castResultsHeading')}</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>{getMsg('MatchingPage.castResultsDescription')}</p>
          </div>
          {showExportActions && (
            <button type="button" className={shared.btnExportSecondary} aria-label={getMsg('MatchingPage.exportCastPngAriaLabel')} aria-busy={pngExportTarget === 'cast'} disabled={pngExportTarget !== null} onClick={handleExportCastResults}>{getMsg(pngExportTarget === 'cast' ? 'MatchingPage.exportingPng' : 'MatchingPage.exportPng')}</button>
          )}
        </div>

        <div ref={castResultTableRef} className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 16 }}>
          <table className={styles.matchingResultTable} style={{ minWidth: castResultTableMinWidth }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surface-panel-muted)' }}>
                <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__cast}`}>{getMsg('MatchingPage.castHeader')}</th>
                {castResultColumnKeys.map((columnKey) => (
                  <th key={columnKey ?? 'none'} className={shared.tableHeaderCell}>{getCastResultColumnLabel(columnKey)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {castResultRows.length === 0 && (
                <tr><td className={shared.tableCell} colSpan={castResultColumnKeys.length + 1} style={{ textAlign: 'center' }}>{getMsg('MatchingPage.noMatchingResults')}</td></tr>
              )}
              {castResultRows.map((row) => (
                <tr key={row.cast.id}>
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

        {showExportActions && castResultRows.length > 0 && (
          <div className={styles.workflowResultToolbar} style={{ marginTop: 24 }}>
            <label className={`${shared.formGroup} ${styles.workflowResultToolbar__filename}`}>
              <span className={shared.formLabel}>{getMsg('MatchingPage.backupFileName')}</span>
              <input type="text" className={shared.formInput} value={backupFileName} onChange={(event) => setBackupFileName(event.target.value)} placeholder={DEFAULT_BACKUP_FILE_NAME} />
            </label>
            <button type="button" className={shared.btnExportPrimary} onClick={handleExportCastResultsAsTsv}>{getMsg('MatchingPage.saveTsv')}</button>
          </div>
        )}
      </section>

      <section className={shared.sectionBlock} style={{ marginTop: 24 }}>
        <div className={`${styles.workflowSectionHeader} ${styles.workflowSectionHeaderRow}`}>
          <div>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>{getMsg('MatchingPage.tableResultsHeading')}</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>{getMsg('MatchingPage.tableResultsDescription')}</p>
          </div>
          {showExportActions && groupedTables.length > 0 && (
            <button type="button" className={shared.btnExportSecondary} aria-label={getMsg('MatchingPage.exportTablePngAriaLabel')} aria-busy={pngExportTarget === 'table'} disabled={pngExportTarget !== null} onClick={handleExportTableResults}>{getMsg(pngExportTarget === 'table' ? 'MatchingPage.exportingPng' : 'MatchingPage.exportPng')}</button>
          )}
        </div>

        {groupedTables.length === 0 ? (
          <div className={shared.pageCardNarrow} style={{ marginTop: 16, padding: 16 }}>{getMsg('MatchingPage.noTableResults')}</div>
        ) : (
          <div ref={tableResultTableRef} className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 16 }}>
            <table className={`${styles.matchingResultTable} ${styles.matchingTableResultTable}`}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-panel-muted)' }}>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__table}`}>{getMsg('MatchingPage.tableHeader')}</th>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__seat}`}>{getMsg('MatchingPage.seatHeader')}</th>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__guest}`}>{getMsg('MatchingPage.applicantHeader')}</th>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__id}`}>{getMsg('MatchingPage.xIdHeader')}</th>
                  <th className={`${shared.tableHeaderCell} ${styles.matchingResultTable__matches}`}>{getMsg('MatchingPage.assignedCastsHeader')}</th>
                </tr>
              </thead>
              <tbody><MatchingTableRows groups={groupedTables} /></tbody>
            </table>
          </div>
        )}
      </section>

      {exportError && (
        <NoticeDialog
          title={exportError.title}
          message={exportError.message}
          closeLabel={getMsg('common.close')}
          onClose={() => setExportError(null)}
        />
      )}
    </>
  );
};
