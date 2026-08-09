import React from 'react';
import { ChevronDown, Sheet } from 'lucide-react';
import type { ColumnMapping } from '@/common/importFormat';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import { getMsg } from '@/messages/getMsg';
import {
  IMPORT_PREVIEW_MAX_ROWS,
  type ImportPreviewModel,
} from '../importPreviewModel';
import styles from '../ImportPage.module.css';
import shared from '@/styles/shared.module.css';

function getCastGridStyle(columnCount: number): React.CSSProperties {
  return { gridTemplateColumns: `repeat(${columnCount}, minmax(128px, 128px))` };
}

interface ImportPreviewPanelProps {
  open: boolean;
  sourceRowCount: number;
  castInputType: ColumnMapping['castInputType'];
  model: ImportPreviewModel;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRawColumns: () => void;
  onImportAndOpenLottery: () => void;
  onImportOnly: () => void;
}

/** 変換後の応募者、本人確認エラー、取込操作を同じ検証モデルから表示する。 */
export const ImportPreviewPanel: React.FC<ImportPreviewPanelProps> = ({
  open,
  sourceRowCount,
  castInputType,
  model,
  disabled = false,
  onOpenChange,
  onOpenRawColumns,
  onImportAndOpenLottery,
  onImportOnly,
}) => {
  const previewTableId = React.useId();
  const importCount = model.canImport ? model.mappedRows.length : 0;
  const previewCastGridStyle = getCastGridStyle(model.previewCastColumnIndexes.length);
  const getPreviewCastItemClassName = (cast: string) => (
    `${styles.importPreviewCastGridItem}${cast ? '' : ` ${styles.importPreviewCastGridItemEmpty}`}`
  );
  const chevronClassName = `${styles.importDisclosureChevron}${open ? ` ${styles.importDisclosureChevronOpen}` : ''}`;
  const handleToggle = () => onOpenChange(!open);

  return (
    <div className={styles.importPreviewSection}>
      <div className={`${styles.importSectionHeader} ${styles.importPreviewHeader}`}>
        <button type="button" className={`${styles.importPreviewHeaderMain} ${styles.importDisclosureToggle}`} aria-expanded={open} aria-controls={previewTableId} onClick={handleToggle}>
          <ChevronDown size={14} className={chevronClassName} aria-hidden="true" />
          {getMsg('ImportPage.previewTitle')}
          <span className={styles.importPreviewCount}>{getMsg('ImportPage.previewCount', { count: Math.min(IMPORT_PREVIEW_MAX_ROWS, sourceRowCount) })}</span>
        </button>
        <button type="button" className={`${shared.btnSecondary} ${styles.importRawColumnsBtn}`} onClick={onOpenRawColumns}><Sheet size={13} />{getMsg('ImportPage.showAllColumns')}</button>
      </div>

      <div id={previewTableId} className={`${shared.tableContainer} ${shared.customScrollbar} ${styles.importPreviewTableContainer}`} hidden={!open}>
        <table className={styles.importPreviewTable}>
          <thead>
            <tr>
              <th className={styles.importPreviewNameCell}>{getMsg('ImportPage.userNameLabel')}</th>
              <th className={styles.importPreviewIdCell}>{getMsg('ImportPage.xIdLabel')}</th>
              {castInputType === 'multiple' ? (
                <th className={styles.importPreviewFlatCastCell}>{getMsg('ImportPage.preferredCasts')}</th>
              ) : (
                <>
                  <th>{getMsg('ImportPage.preferredCastColumn', { rank: 1 })}</th>
                  <th>{getMsg('ImportPage.preferredCastColumn', { rank: 2 })}</th>
                  <th>{getMsg('ImportPage.preferredCastColumn', { rank: 3 })}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {model.previewRows.map(({ sourceRow, user }) => {
              const hasIdentityIssue = model.issueRowNumbers.has(sourceRow.rowNumber);
              const idCellClassName = `${styles.importPreviewIdCell}${
                hasIdentityIssue ? ` ${styles.importPreviewIdCellWarn}` : ''
              }`;
              return (
                <tr key={sourceRow.rowNumber}>
                  <td className={styles.importPreviewNameCell}>
                    {user.name || <span className={styles.importCellEmpty}>{getMsg('common.emptyMarker')}</span>}
                  </td>
                  <td className={idCellClassName}>
                    {user.x_id
                      ? formatXAccountIdForDisplay(user.x_id)
                      : <span className={styles.importCellWarn}>{getMsg('ImportPage.emptyValue')}</span>}
                  </td>
                  {castInputType === 'multiple' ? (
                    <td className={styles.importPreviewFlatCastCell}>
                      <div className={styles.importPreviewCastGrid} style={previewCastGridStyle}>
                        {model.previewCastColumnIndexes.map((index) => {
                          const cast = user.casts[index] ?? '';
                          return <span key={index} className={getPreviewCastItemClassName(cast)}>{cast}</span>;
                        })}
                      </div>
                    </td>
                  ) : (
                    [0, 1, 2].map((index) => (
                      <td key={index}>{user.casts[index] || <span className={styles.importCellEmpty}>{getMsg('common.emptyMarker')}</span>}</td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {model.identityIssues.length > 0 && (
        <div className={styles.importIssuePanel} aria-live="polite">{getMsg('ImportPage.identityIssueSummary')}</div>
      )}

      <div className={styles.importFooter}>
        <div className={styles.importValidation}>
          <span className={styles.importValidationOk}>{getMsg('ImportPage.importableCount', { count: importCount })}</span>
        </div>
        <div className={styles.importFooterActions}>
          <button type="button" className={`${shared.btnSecondary} ${styles.importSubmitBtn}`} disabled={disabled || !model.canProceedToLottery} onClick={onImportAndOpenLottery}>{getMsg('ImportPage.proceedToLottery')}</button>
          <button type="button" className={`${shared.btnPrimary} ${styles.importSubmitBtn}`} disabled={disabled || !model.canImport} onClick={onImportOnly}>{getMsg('ImportPage.importCount', { count: importCount })}</button>
        </div>
      </div>
    </div>
  );
};
