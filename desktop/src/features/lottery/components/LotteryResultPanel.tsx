// 抽選結果と明示保存操作を表示する。

import React, { useEffect, useMemo, useState } from 'react';
import type { UserBean } from '@/common/types/entities';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import { AppDialog } from '@/components/AppDialog';
import { getMsg } from '@/messages/getMsg';
import { NgCastResultCell } from './NgCastResultCell';
import styles from '../LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

type LotteryResultViewRow = Pick<UserBean, 'name' | 'x_id' | 'vrc_url' | 'casts' | 'raw_extra'> & {
  lotteryType: string;
  ngCastNames: string[];
};

interface LotteryResultOptionalColumn {
  id: string;
  label: string;
  rawExtraIndex: number | null;
}

const VRC_URL_COLUMN_ID = 'vrc_url';

/** 取込時の追加列順を保ち、重複見出しだけ画面上で判別できる名称へ整形する。 */
function buildOptionalColumns(resultRows: readonly LotteryResultViewRow[]): LotteryResultOptionalColumn[] {
  if (resultRows.length === 0) return [];
  const rawExtraFields = resultRows[0]?.raw_extra ?? [];
  const labelCounts = new Map<string, number>();
  rawExtraFields.forEach((field) => {
    labelCounts.set(field.key, (labelCounts.get(field.key) ?? 0) + 1);
  });
  const labelOccurrences = new Map<string, number>();
  return [
    {
      id: VRC_URL_COLUMN_ID,
      label: getMsg('LotteryPage.vrchatUrlHeader'),
      rawExtraIndex: null,
    },
    ...rawExtraFields.map((field, index) => {
      const occurrence = (labelOccurrences.get(field.key) ?? 0) + 1;
      labelOccurrences.set(field.key, occurrence);
      const baseLabel = field.key || getMsg('LotteryPage.additionalColumnFallback', { index: index + 1 });
      return {
        id: `raw_extra:${index}`,
        label: (labelCounts.get(field.key) ?? 0) > 1
          ? getMsg('LotteryPage.duplicateColumnLabel', { label: baseLabel, occurrence })
          : baseLabel,
        rawExtraIndex: index,
      };
    }),
  ];
}

/** 抽選データが切り替わったときに表示列選択を初期化するため、追加列構成を識別する。 */
function buildOptionalColumnSchemaKey(resultRows: readonly LotteryResultViewRow[]): string {
  if (resultRows.length === 0) return '';
  return JSON.stringify((resultRows[0]?.raw_extra ?? []).map((field) => field.key));
}

function getOptionalColumnValue(
  row: LotteryResultViewRow,
  column: LotteryResultOptionalColumn,
): string {
  return column.rawExtraIndex == null
    ? row.vrc_url ?? ''
    : row.raw_extra[column.rawExtraIndex]?.value ?? '';
}

interface LotteryResultPanelProps {
  resultRows: LotteryResultViewRow[];
  ngWinnerCount: number;
  savingLotteryResult: boolean;
  hasStaleLotteryResult: boolean;
  readOnly?: boolean;
  onSaveLotteryResult: () => void;
}

export const LotteryResultPanel: React.FC<LotteryResultPanelProps> = ({
  resultRows,
  ngWinnerCount,
  savingLotteryResult,
  hasStaleLotteryResult,
  readOnly = false,
  onSaveLotteryResult,
}) => {
  const saveResultDisabled = readOnly || resultRows.length === 0 || savingLotteryResult || hasStaleLotteryResult;
  const saveResultLabel = savingLotteryResult ? getMsg('common.saving') : getMsg('LotteryPage.saveResult');
  const optionalColumns = useMemo(() => buildOptionalColumns(resultRows), [resultRows]);
  const optionalColumnSchemaKey = useMemo(() => buildOptionalColumnSchemaKey(resultRows), [resultRows]);
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);
  const [draftColumnIds, setDraftColumnIds] = useState<string[]>([]);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);

  useEffect(() => {
    setSelectedColumnIds([]);
    setDraftColumnIds([]);
    setColumnDialogOpen(false);
  }, [optionalColumnSchemaKey]);

  const selectedColumns = optionalColumns.filter((column) => selectedColumnIds.includes(column.id));
  const handleColumnDialogOpenChange = (open: boolean) => {
    if (open) setDraftColumnIds(selectedColumnIds);
    setColumnDialogOpen(open);
  };
  const handleOpenColumnDialog = () => handleColumnDialogOpenChange(true);
  const handleColumnToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { checked, value } = event.currentTarget;
    setDraftColumnIds((current) => checked
      ? [...current, value]
      : current.filter((columnId) => columnId !== value));
  };
  const handleClearColumnSelection = () => setDraftColumnIds([]);
  const handleApplyColumnSelection = () => {
    const availableIds = new Set(optionalColumns.map((column) => column.id));
    const nextIds = draftColumnIds.filter((columnId) => availableIds.has(columnId));
    setSelectedColumnIds(nextIds);
    setColumnDialogOpen(false);
  };

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
          <button type="button" className={shared.btnSecondary} disabled={resultRows.length === 0} onClick={handleOpenColumnDialog}>{getMsg('LotteryPage.selectDisplayColumns')}</button>
          <span className={styles.workflowResultColumnSummary}>{getMsg('LotteryPage.selectedDisplayColumnCount', { count: selectedColumns.length })}</span>
        </div>
        <div className={styles.workflowResultToolbar__actions}>
          <button type="button" className={shared.btnPrimary} disabled={saveResultDisabled} onClick={onSaveLotteryResult}>{saveResultLabel}</button>
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
              {selectedColumns.map((column) => (
                <th key={column.id} className={`${shared.tableHeaderCell} ${styles.workflowResultOptionalHeader}`}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resultRows.length === 0 && (
              <tr><td className={`${shared.tableCell} ${styles.workflowResultEmptyCell}`} colSpan={5 + selectedColumns.length}>{getMsg('LotteryPage.noResults')}</td></tr>
            )}
            {resultRows.map((row) => (
              <tr key={row.x_id}>
                <td className={shared.tableCell}>{row.name}</td>
                <td className={shared.tableCell}>{formatXAccountIdForDisplay(row.x_id)}</td>
                <td className={shared.tableCell}>{row.lotteryType}</td>
                <td className={shared.tableCell}>{row.casts.join(', ') || getMsg('LotteryPage.noPreferredCasts')}</td>
                <td className={shared.tableCell}><NgCastResultCell ngCastNames={row.ngCastNames} /></td>
                {selectedColumns.map((column) => {
                  const value = getOptionalColumnValue(row, column);
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
        <AppDialog
          open={columnDialogOpen}
          onOpenChange={handleColumnDialogOpenChange}
          title={getMsg('LotteryPage.displayColumnsDialogTitle')}
          description={getMsg('LotteryPage.displayColumnsDialogDescription')}
          className={styles.workflowResultColumnDialog}
          descriptionClassName={styles.workflowResultColumnDialogDescription}
          showClose
        >
          <fieldset className={styles.workflowResultColumnFieldset}>
            <legend className={styles.workflowResultColumnLegend}>{getMsg('LotteryPage.additionalColumnsHeading')}</legend>
            <div className={`${styles.workflowResultColumnList} ${shared.customScrollbar}`}>
              {optionalColumns.map((column) => (
                <label key={column.id} className={styles.workflowResultColumnOption}>
                  <input type="checkbox" value={column.id} checked={draftColumnIds.includes(column.id)} onChange={handleColumnToggle} />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className={styles.workflowResultColumnDialogActions}>
            <button type="button" className={shared.btnSecondary} disabled={draftColumnIds.length === 0} onClick={handleClearColumnSelection}>{getMsg('LotteryPage.clearDisplayColumns')}</button>
            <button type="button" className={shared.btnPrimary} onClick={handleApplyColumnSelection}>{getMsg('LotteryPage.applyDisplayColumns')}</button>
          </div>
        </AppDialog>
      )}
    </section>
  );
};
