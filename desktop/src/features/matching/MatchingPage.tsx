// マッチングを実行し、キャスト別・テーブル別の結果を表示・出力します。

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NoticeDialog } from '@/components/ConfirmModal';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { downloadTsv } from '@/common/downloadTsv';
import { LotteryValidationPanel } from '@/features/lottery/components/LotteryValidationPanel';
import { validateLotteryConditions } from '@/features/lottery/services/lottery-validation';
import { MatchingConditionPanel } from '@/features/matching/components/MatchingConditionPanel';
import { CastAssignmentList } from '@/features/matching/components/MatchingResultCells';
import { MatchingTableRows } from '@/features/matching/components/MatchingTableRows';
import { buildCastMatchingTsvRows, exportElementAsPng } from '@/features/matching/presenters/matching-result-export';
import { useMatchingExecution } from '@/features/matching/hooks/useMatchingExecution';
import {
  buildCastResultRows,
  buildResultRows,
  getAssignmentsForColumn,
  getCastResultColumnKeys,
  getCastResultColumnLabel,
  groupTableSlots,
} from '@/features/matching/presenters/matching-result-view';
import { useAppContext } from '@/stores/AppContext';
import { getMsg } from '@/messages/getMsg';
import styles from './MatchingPage.module.css';
import shared from '@/styles/shared.module.css';

// 利用者が保存・出力するときに使用する既定ファイル名。
const DEFAULT_BACKUP_FILE_NAME = getMsg('MatchingPage.defaultBackupFileName');
const CAST_RESULT_IMAGE_FILE_NAME = getMsg('MatchingPage.castResultImageFileName');
const TABLE_RESULT_IMAGE_FILE_NAME = getMsg('MatchingPage.tableResultImageFileName');

export const MatchingPage: React.FC = () => {
  // 実行条件、抽選結果、表示中のマッチング結果を同じContextスナップショットから取得する。
  const {
    currentWinners: winners,
    casts,
    matchingResultState: {
      result: globalMatchingResult,
      tableSlots: globalTableSlots,
      error: globalMatchingError,
      isLocked: isMatchingLocked,
    },
    resetMatching,
    isLotteryResultCurrent,
    sessionWorkflow,
  } = useAppContext();
  const {
    matchingTypeCode,
    totalTables,
    usersPerTable,
    castsPerRotation,
    allowM003EmptySeats,
    m003SameDaySlotCount,
  } = sessionWorkflow;

  // ダイアログ、出力名、PNG化対象の要素を画面側で管理する。
  const [alertMessage, setAlertMessage] = useState<string | null>(globalMatchingError);
  const [backupFileName, setBackupFileName] = useState(DEFAULT_BACKUP_FILE_NAME);
  const resultRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const { isComputing, scoreSummary, runMatching, cancelMatching } = useMatchingExecution();

  useEffect(() => {
    setAlertMessage(globalMatchingError);
  }, [globalMatchingError]);

  // 抽選結果とマッチング条件から、実行可否の表示内容を組み立てる。
  const guaranteedWinnerCount = winners.filter((winner) => winner.is_guaranteed).length;
  const validation = validateLotteryConditions({
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
  // 抽選結果が古い場合は再抽選要求を優先し、マッチングを開始できない状態にする。
  const effectiveValidation = isLotteryResultCurrent
    ? validation
    : {
        errors: [getMsg('MatchingPage.staleLotteryResult')],
        warnings: [],
        info: validation.info,
      };

  // Context結果を、キャスト別・テーブル別の表示モデルへ変換する。
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
  const scoreSummaryText = scoreSummary
    ? getMsg('MatchingPage.scoreSummary', {
        totalScore: scoreSummary.totalScore,
        averageScore: scoreSummary.averageScore.toFixed(1),
        firstChoiceCount: scoreSummary.firstChoiceCount,
        secondChoiceCount: scoreSummary.secondChoiceCount,
        thirdChoiceCount: scoreSummary.thirdChoiceCount,
        flatPreferenceCount: scoreSummary.flatPreferenceCount,
        unpreferredCount: scoreSummary.unpreferredCount,
      })
    : '';

  const handleExportCastResults = () => {
    void exportElementAsPng(resultRef.current, CAST_RESULT_IMAGE_FILE_NAME);
  };

  const handleExportTableResults = () => {
    void exportElementAsPng(tableRef.current, TABLE_RESULT_IMAGE_FILE_NAME);
  };

  const handleBackupFileNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBackupFileName(event.target.value);
  };

  const handleSaveTsv = () => {
    downloadTsv(
      buildCastMatchingTsvRows(castResultRows, castResultColumnKeys),
      backupFileName || DEFAULT_BACKUP_FILE_NAME,
    );
  };

  const handleAlertConfirm = () => {
    setAlertMessage(null);
  };

  return (
    <div className={styles.matchingScreen} style={{ paddingBottom: 80, position: 'relative' }}>
      {isComputing && <LoadingOverlay message={getMsg('MatchingPage.computing')} onCancel={cancelMatching} />}
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('MatchingPage.pageTitle')}</h1>
        <p className={shared.pageHeaderSubtitle}>{getMsg('MatchingPage.pageDescription')}</p>
      </header>

      <div className={styles.workflowTwoPane}>
        <div className={styles.workflowTwoPane__main}>
          <section className={shared.sectionBlock}>
            <div className={styles.workflowSectionHeader}>
              <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>{getMsg('MatchingPage.executionHeading')}</h2>
              <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>{getMsg('MatchingPage.executionDescription')}</p>
            </div>

            <MatchingConditionPanel disabled={isMatchingLocked} />
          </section>

          {scoreSummary && (
            <section className={shared.sectionBlock} style={{ marginTop: 16 }}>
              <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>{getMsg('MatchingPage.scoreSummaryHeading')}</h2>
              <p className={shared.pageHeaderSubtitle}>{scoreSummaryText}</p>
              {scoreSummary.ngWarningCount > 0 && <div className={styles.scoreWarning}>{getMsg('MatchingPage.ngWarning')}</div>}
            </section>
          )}
        </div>

        <aside className={styles.workflowTwoPane__side}>
          <LotteryValidationPanel
            validation={effectiveValidation}
            onRunClick={runMatching}
            title={getMsg('MatchingPage.statusTitle')}
            description={getMsg('MatchingPage.statusDescription')}
            readySubtext={getMsg('MatchingPage.readySubtext')}
            runLabel={getMsg('MatchingPage.runLabel')}
            runDisabled={!isLotteryResultCurrent}
          />
          {isMatchingLocked && (
            <button type="button" className={shared.btnDanger} style={{ width: '100%', marginTop: 12 }} onClick={resetMatching}>{getMsg('MatchingPage.unlockAndRerun')}</button>
          )}
        </aside>
      </div>

      <section ref={resultRef} className={shared.sectionBlock} style={{ marginTop: 24 }}>
        <div className={`${styles.workflowSectionHeader} ${styles.workflowSectionHeaderRow}`}>
          <div>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>{getMsg('MatchingPage.castResultsHeading')}</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>{getMsg('MatchingPage.castResultsDescription')}</p>
          </div>
          {isMatchingLocked && (
            <button type="button" className={shared.btnExportSecondary} aria-label={getMsg('MatchingPage.exportCastPngAriaLabel')} onClick={handleExportCastResults}>{getMsg('MatchingPage.exportPng')}</button>
          )}
        </div>

        <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 16 }}>
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
                <tr>
                  <td className={shared.tableCell} colSpan={castResultColumnKeys.length + 1} style={{ textAlign: 'center' }}>{getMsg('MatchingPage.noMatchingResults')}</td>
                </tr>
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
      </section>

      <section ref={tableRef} className={shared.sectionBlock} style={{ marginTop: 24 }}>
        <div className={`${styles.workflowSectionHeader} ${styles.workflowSectionHeaderRow}`}>
          <div>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>{getMsg('MatchingPage.tableResultsHeading')}</h2>
            <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>{getMsg('MatchingPage.tableResultsDescription')}</p>
          </div>
          {isMatchingLocked && (
            <button type="button" className={shared.btnExportSecondary} aria-label={getMsg('MatchingPage.exportTablePngAriaLabel')} onClick={handleExportTableResults}>{getMsg('MatchingPage.exportPng')}</button>
          )}
        </div>

        {groupedTables.length === 0 ? (
          /* テーブル別結果がない場合 */
          <div className={shared.pageCardNarrow} style={{ marginTop: 16, padding: 16 }}>{getMsg('MatchingPage.noTableResults')}</div>
        ) : (
          /* テーブル別結果の一覧 */
          <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 16 }}>
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

      {isMatchingLocked && castResultRows.length > 0 && (
        <div className={styles.workflowResultToolbar} style={{ marginTop: 24 }}>
          <label className={`${shared.formGroup} ${styles.workflowResultToolbar__filename}`}>
            <span className={shared.formLabel}>{getMsg('MatchingPage.backupFileName')}</span>
            <input type="text" className={shared.formInput} value={backupFileName} onChange={handleBackupFileNameChange} placeholder={DEFAULT_BACKUP_FILE_NAME} />
          </label>
          <button type="button" className={shared.btnExportPrimary} onClick={handleSaveTsv}>{getMsg('MatchingPage.saveTsv')}</button>
        </div>
      )}

      {alertMessage && (
        <NoticeDialog
          title={getMsg('MatchingPage.pageTitle')}
          message={alertMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleAlertConfirm}
        />
      )}
    </div>
  );
};
