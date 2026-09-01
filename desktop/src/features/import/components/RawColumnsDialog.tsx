import React from 'react';
import { AppDialog } from '@/components/AppDialog';
import { getMsg } from '@/messages/getMsg';
import {
  getImportHeaderLabel,
  type ImportSourceRow,
} from '../importPreviewModel';
import styles from '../ImportPage.module.css';
import shared from '@/styles/shared.module.css';

interface RawColumnsDialogProps {
  open: boolean;
  headers: string[];
  sourceRows: ImportSourceRow[];
  columnIndexes: number[];
  issueRowNumbers: Set<number>;
  xIdColumnIndex: number;
  onOpenChange: (open: boolean) => void;
}

/** 元TSVの全セルを、取込後も保持する元行番号で確認するダイアログ。 */
export const RawColumnsDialog: React.FC<RawColumnsDialogProps> = ({
  open,
  headers,
  sourceRows,
  columnIndexes,
  issueRowNumbers,
  xIdColumnIndex,
  onOpenChange,
}) => {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={getMsg('ImportPage.rawColumnsDialogTitle')}
      showClose
      className={styles.importRawModal}
      headerClassName={styles.importRawModalHeader}
    >
      <div className={styles.importRawModalMeta}>
        <span>{getMsg('ImportPage.columnCount', { count: columnIndexes.length })}</span>
        <span>{getMsg('ImportPage.rowCount', { count: sourceRows.length })}</span>
      </div>
      <div className={`${styles.importRawTableScroll} ${shared.customScrollbar}`}>
        <table className={styles.importRawTable}>
          <thead>
            <tr>
              <th className={styles.importRawRowIndex}>{getMsg('ImportPage.rowNumberHeader')}</th>
              {columnIndexes.map((columnIndex) => (
                <th key={columnIndex}>{columnIndex + 1}: {getImportHeaderLabel(headers, columnIndex)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sourceRows.map((row) => (
              <tr key={row.rowNumber}>
                <th className={styles.importRawRowIndex} scope="row">{row.rowNumber}</th>
                {columnIndexes.map((columnIndex) => {
                  const cell = row.cells[columnIndex] ?? '';
                  const hasIdentityIssue = issueRowNumbers.has(row.rowNumber)
                    && columnIndex === xIdColumnIndex;
                  return <td key={columnIndex} className={hasIdentityIssue ? styles.importRawCellWarn : undefined}>{cell || <span className={styles.importCellEmpty}>{getMsg('common.emptyMarker')}</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppDialog>
  );
};
