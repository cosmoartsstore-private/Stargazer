// 抽選結果、保存済み結果の選択、保存・マッチング遷移を表示する。

import React from 'react';
import type { UserBean } from '@/common/types/entities';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import { AppSelect, type AppSelectOption } from '@/components/AppSelect';
import { getMsg } from '@/messages/getMsg';
import { NgCastResultCell } from './NgCastResultCell';
import styles from '../LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

type LotteryResultViewRow = Pick<UserBean, 'name' | 'x_id' | 'casts'> & {
  lotteryType: string;
  ngCastNames: string[];
};

interface LotteryResultPanelProps {
  resultRows: LotteryResultViewRow[];
  ngWinnerCount: number;
  selectedSavedRunId: string;
  onSelectedSavedRunIdChange: (value: string) => void;
  savedRunOptions: AppSelectOption[];
  hasSavedRuns: boolean;
  savingLotteryRun: boolean;
  hasStaleLotteryResult: boolean;
  readOnly?: boolean;
  isLotteryOnlyMode: boolean;
  canProceedToMatching: boolean;
  onLoadSavedLotteryRun: () => void;
  onSaveLotteryRun: () => void;
  onNavigateToMatching: () => void;
}

export const LotteryResultPanel: React.FC<LotteryResultPanelProps> = ({
  resultRows,
  ngWinnerCount,
  selectedSavedRunId,
  onSelectedSavedRunIdChange,
  savedRunOptions,
  hasSavedRuns,
  savingLotteryRun,
  hasStaleLotteryResult,
  readOnly = false,
  isLotteryOnlyMode,
  canProceedToMatching,
  onLoadSavedLotteryRun,
  onSaveLotteryRun,
  onNavigateToMatching,
}) => {
  const savedResultPlaceholder = hasSavedRuns
    ? getMsg('LotteryPage.selectSavedResult')
    : getMsg('LotteryPage.noSavedResults');
  const saveResultDisabled = readOnly || resultRows.length === 0 || savingLotteryRun || hasStaleLotteryResult;
  const saveResultLabel = savingLotteryRun ? getMsg('common.saving') : getMsg('LotteryPage.saveResult');
  const savedResultsLabelId = 'lottery-saved-results-label';

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
        <div className={styles.workflowSavedResultControl}>
          <div className={`${shared.formGroup} ${styles.workflowSavedResultSelect}`}>
            <span id={savedResultsLabelId} className={shared.formLabel}>{getMsg('LotteryPage.savedResults')}</span>
            <AppSelect value={selectedSavedRunId} onValueChange={onSelectedSavedRunIdChange} options={savedRunOptions} placeholder={savedResultPlaceholder} disabled={!hasSavedRuns} ariaLabelledBy={savedResultsLabelId} />
          </div>
          <button type="button" className={shared.btnSecondary} disabled={!selectedSavedRunId} onClick={onLoadSavedLotteryRun}>{getMsg('LotteryPage.openSavedResult')}</button>
        </div>
        <div className={styles.workflowResultToolbar__actions}>
          <button type="button" className={shared.btnPrimary} disabled={saveResultDisabled} onClick={onSaveLotteryRun}>{saveResultLabel}</button>
          {!isLotteryOnlyMode && (
            <button type="button" className={shared.btnPrimary} disabled={!canProceedToMatching} onClick={onNavigateToMatching}>{getMsg('LotteryPage.goToMatching')}</button>
          )}
        </div>
      </div>
      {hasStaleLotteryResult && <p className={styles.workflowResultNotice}>{getMsg('LotteryPage.staleResultNotice')}</p>}

      <div className={`${shared.tableContainer} ${shared.customScrollbar} ${styles.workflowResultTableContainer}`}>
        <table className={styles.workflowResultTable}>
          <thead>
            <tr className={styles.workflowResultTableHeader}>
              <th className={shared.tableHeaderCell}>{getMsg('LotteryPage.userHeader')}</th>
              <th className={shared.tableHeaderCell}>{getMsg('LotteryPage.xIdHeader')}</th>
              <th className={shared.tableHeaderCell}>{getMsg('LotteryPage.typeHeader')}</th>
              <th className={shared.tableHeaderCell}>{getMsg('LotteryPage.preferredCastsHeader')}</th>
              <th className={shared.tableHeaderCell}>{getMsg('LotteryPage.ngCastsHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {resultRows.length === 0 && (
              <tr><td className={`${shared.tableCell} ${styles.workflowResultEmptyCell}`} colSpan={5}>{getMsg('LotteryPage.noResults')}</td></tr>
            )}
            {resultRows.map((row) => (
              <tr key={row.x_id}>
                <td className={shared.tableCell}>{row.name}</td>
                <td className={shared.tableCell}>{formatXAccountIdForDisplay(row.x_id)}</td>
                <td className={shared.tableCell}>{row.lotteryType}</td>
                <td className={shared.tableCell}>{row.casts.join(', ') || getMsg('LotteryPage.noPreferredCasts')}</td>
                <td className={shared.tableCell}><NgCastResultCell ngCastNames={row.ngCastNames} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
