// 応募一覧と抽選結果で共用する任意表示列の選択ダイアログ。

import React, { useState } from 'react';
import { normalizeApplicantDisplayColumnIds, type ApplicantDisplayColumn } from '@/common/applicantDisplayColumns';
import { getMsg } from '@/messages/getMsg';
import { AppDialog } from './AppDialog';
import styles from './ApplicantDisplayColumnDialog.module.css';
import shared from '@/styles/shared.module.css';

interface ApplicantDisplayColumnDialogProps {
  columns: readonly ApplicantDisplayColumn[];
  selectedColumnIds: readonly string[];
  onApply: (columnIds: readonly string[]) => void;
  onClose: () => void;
}

export const ApplicantDisplayColumnDialog: React.FC<ApplicantDisplayColumnDialogProps> = ({ columns, selectedColumnIds, onApply, onClose }) => {
  const [draftColumnIds, setDraftColumnIds] = useState<string[]>(() => normalizeApplicantDisplayColumnIds(selectedColumnIds, columns));
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const handleColumnToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { checked, value } = event.currentTarget;
    setDraftColumnIds((current) => checked
      ? [...current, value]
      : current.filter((columnId) => columnId !== value));
  };
  const handleClear = () => setDraftColumnIds([]);
  const handleApply = () => onApply(normalizeApplicantDisplayColumnIds(draftColumnIds, columns));

  return (
    <AppDialog open onOpenChange={handleOpenChange} title={getMsg('ApplicantDisplayColumns.dialogTitle')} description={getMsg('ApplicantDisplayColumns.dialogDescription')} className={styles.displayColumnDialog} descriptionClassName={styles.displayColumnDialogDescription} showClose>
      <fieldset className={styles.displayColumnFieldset}>
        <legend className={styles.displayColumnLegend}>{getMsg('ApplicantDisplayColumns.additionalColumnsHeading')}</legend>
        <div className={`${styles.displayColumnList} ${shared.customScrollbar}`}>
          {columns.map((column) => (
            <label key={column.id} className={styles.displayColumnOption}>
              <input type="checkbox" value={column.id} checked={draftColumnIds.includes(column.id)} onChange={handleColumnToggle} />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <footer className={styles.displayColumnDialogActions}>
        <button type="button" className={shared.btnSecondary} disabled={draftColumnIds.length === 0} onClick={handleClear}>{getMsg('ApplicantDisplayColumns.clearSelection')}</button>
        <button type="button" className={shared.btnPrimary} onClick={handleApply}>{getMsg('ApplicantDisplayColumns.applySelection')}</button>
      </footer>
    </AppDialog>
  );
};
