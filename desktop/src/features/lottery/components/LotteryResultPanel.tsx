// 抽選結果と明示保存操作を表示する。

import React, { useState } from 'react';
import { getApplicantDisplayColumnValue } from '@/common/applicantDisplayColumns';
import type { UserBean } from '@/common/types/entities';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import { ApplicantDisplayColumnDialog } from '@/components/ApplicantDisplayColumnDialog';
import { NoticeDialog } from '@/components/ConfirmModal';
import { getMsg } from '@/messages/getMsg';
import { useAppContext } from '@/stores/AppContext';
import { NgCastResultCell } from './NgCastResultCell';
import styles from '../LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

type LotteryResultViewRow = Pick<UserBean, 'name' | 'x_id' | 'vrc_url' | 'casts' | 'raw_extra'> & {
  lotteryType: string;
  ngCastNames: string[];
};

const LOTTERY_RESULT_BASE_TABLE_WIDTH = 920;
const LOTTERY_RESULT_OPTIONAL_COLUMN_WIDTH = 240;

interface LotteryResultPanelProps {
  resultRows: LotteryResultViewRow[];
  ngWinnerCount: number;
  savingLotteryResult: boolean;
  hasStaleLotteryResult: boolean;
  readOnly?: boolean;
  onSaveLotteryResult: () => void;
}

export const LotteryResultPanel: React.FC<LotteryResultPanelProps> = ({ resultRows, ngWinnerCount, savingLotteryResult, hasStaleLotteryResult, readOnly = false, onSaveLotteryResult }) => {
  const { applicantDisplayColumns, selectedApplicantDisplayColumnIds, selectedApplicantDisplayColumns, setSelectedApplicantDisplayColumnIds } = useAppContext();
  const saveResultDisabled = readOnly || resultRows.length === 0 || savingLotteryResult || hasStaleLotteryResult;
  const saveResultLabel = savingLotteryResult ? getMsg('common.saving') : getMsg('LotteryPage.saveResult');
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [displayColumnAlertMessage, setDisplayColumnAlertMessage] = useState<string | null>(null);
  const handleOpenColumnDialog = () => setColumnDialogOpen(true);
  const handleCloseColumnDialog = () => setColumnDialogOpen(false);
  const handleApplyColumnSelection = (columnIds: readonly string[]) => {
    const saved = setSelectedApplicantDisplayColumnIds(columnIds);
    setColumnDialogOpen(false);
    if (!saved) setDisplayColumnAlertMessage(getMsg('ApplicantDisplayColumns.saveFailed'));
  };
  const displayColumnButtonLabel = selectedApplicantDisplayColumns.length === 0
    ? getMsg('ApplicantDisplayColumns.addButton')
    : getMsg('ApplicantDisplayColumns.changeButton');
  const resultTableMinWidth = LOTTERY_RESULT_BASE_TABLE_WIDTH
    + selectedApplicantDisplayColumns.length * LOTTERY_RESULT_OPTIONAL_COLUMN_WIDTH;

  return (
    <section className={`${shared.sectionBlock} ${styles.workflowResultSection}`}>
      <div className={`${styles.workflowSectionHeader} ${styles.workflowSectionHeaderRow}`}>
        <div>
          <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd}`}>{getMsg('LotteryPage.winnerListHeading')}</h2>
          <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>{getMsg('LotteryPage.winnerListDescription')}</p>
        </div>
        {ngWinnerCount > 0 && (
          <span className={styles.workflowResultNgSummary}>{getMsg('LotteryPage.ngWinnerCount', { count: ngWinnerCount })}</span>
        )}
      </div>

      <div className={styles.workflowResultToolbar}>
        <div className={styles.workflowResultColumnControl}>
          <button type="button" className={shared.btnSecondary} aria-haspopup="dialog" disabled={applicantDisplayColumns.length === 0} onClick={handleOpenColumnDialog}>{displayColumnButtonLabel}</button>
          <span className={styles.workflowResultColumnSummary} aria-live="polite">{getMsg('ApplicantDisplayColumns.selectedCount', { count: selectedApplicantDisplayColumns.length })}</span>
        </div>
        <div className={styles.workflowResultToolbar__actions}>
          <button type="button" className={shared.btnPrimary} disabled={saveResultDisabled} onClick={onSaveLotteryResult}>{saveResultLabel}</button>
        </div>
      </div>
      {hasStaleLotteryResult && <p className={styles.workflowResultNotice}>{getMsg('LotteryPage.staleResultNotice')}</p>}

      <div className={`${shared.tableContainer} ${shared.customScrollbar} ${styles.workflowResultTableContainer}`}>
        <table className={styles.workflowResultTable} style={{ minWidth: resultTableMinWidth }}>
          <colgroup>
            <col className={styles.workflowResultUserColumn} />
            <col className={styles.workflowResultXIdColumn} />
            <col className={styles.workflowResultTypeColumn} />
            <col className={styles.workflowResultPreferredColumn} />
            <col className={styles.workflowResultNgColumn} />
            {selectedApplicantDisplayColumns.map((column) => (<col key={column.id} className={styles.workflowResultOptionalColumn} />))}
          </colgroup>
          <thead>
            <tr className={styles.workflowResultTableHeader}>
              <th scope="col" className={`${shared.tableHeaderCell} ${styles.workflowResultBaseHeader} ${styles.workflowResultUserHeader}`}>{getMsg('LotteryPage.userHeader')}</th>
              <th scope="col" className={`${shared.tableHeaderCell} ${styles.workflowResultBaseHeader}`}>{getMsg('LotteryPage.xIdHeader')}</th>
              <th scope="col" className={`${shared.tableHeaderCell} ${styles.workflowResultBaseHeader}`}>{getMsg('LotteryPage.typeHeader')}</th>
              <th scope="col" className={`${shared.tableHeaderCell} ${styles.workflowResultBaseHeader}`}>{getMsg('LotteryPage.preferredCastsHeader')}</th>
              <th scope="col" className={`${shared.tableHeaderCell} ${styles.workflowResultBaseHeader}`}>{getMsg('LotteryPage.ngCastsHeader')}</th>
              {selectedApplicantDisplayColumns.map((column) => (
                <th key={column.id} scope="col" className={`${shared.tableHeaderCell} ${styles.workflowResultOptionalHeader}`}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resultRows.length === 0 && (
              <tr><td className={`${shared.tableCell} ${styles.workflowResultEmptyCell}`} colSpan={5 + selectedApplicantDisplayColumns.length}>{getMsg('LotteryPage.noResults')}</td></tr>
            )}
            {resultRows.map((row) => (
              <tr key={row.x_id}>
                <td className={`${shared.tableCell} ${styles.workflowResultTextCell} ${styles.workflowResultUserCell}`}>{row.name}</td>
                <td className={`${shared.tableCell} ${styles.workflowResultNoWrapCell}`}>{formatXAccountIdForDisplay(row.x_id)}</td>
                <td className={`${shared.tableCell} ${styles.workflowResultNoWrapCell}`}>{row.lotteryType}</td>
                <td className={`${shared.tableCell} ${styles.workflowResultTextCell}`}>{row.casts.join(', ') || getMsg('LotteryPage.noPreferredCasts')}</td>
                <td className={`${shared.tableCell} ${styles.workflowResultTextCell}`}><NgCastResultCell ngCastNames={row.ngCastNames} /></td>
                {selectedApplicantDisplayColumns.map((column) => {
                  const value = getApplicantDisplayColumnValue(row, column);
                  return (
                    <td key={column.id} className={`${shared.tableCell} ${styles.workflowResultOptionalCell}`}>
                      {value.trim() ? value : getMsg('common.emptyMarker')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {columnDialogOpen && (
        <ApplicantDisplayColumnDialog columns={applicantDisplayColumns} selectedColumnIds={selectedApplicantDisplayColumnIds} onApply={handleApplyColumnSelection} onClose={handleCloseColumnDialog} />
      )}
      {displayColumnAlertMessage && (
        <NoticeDialog title={getMsg('ApplicantDisplayColumns.saveFailedTitle')} message={displayColumnAlertMessage} closeLabel={getMsg('common.close')} onClose={() => setDisplayColumnAlertMessage(null)} />
      )}
    </section>
  );
};
