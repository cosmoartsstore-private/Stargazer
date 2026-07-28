import React from 'react';
import { Sheet, Trash2 } from 'lucide-react';
import type { ColumnMapping } from '@/common/importFormat';
import type { XIdIdentityIssue } from '@/common/xIdUtils';
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

function getIdentityIssueText(issue: XIdIdentityIssue, userName?: string): string {
  const issueMessage = issue.kind === 'empty'
    ? getMsg('ImportPage.emptyXIdIssue')
    : getMsg('ImportPage.duplicateXIdIssue', { xId: issue.xId });
  const userSuffix = userName
    ? getMsg('ImportPage.identityIssueUserSuffix', { userName })
    : '';
  return getMsg('ImportPage.identityIssueRow', {
    rowNumber: issue.rowNumber,
    issue: issueMessage,
    userSuffix,
  });
}

interface ImportIssueRowProps {
  issue: XIdIdentityIssue;
  userName?: string;
  onRemove: (rowNumber: number) => void;
}

const ImportIssueRow: React.FC<ImportIssueRowProps> = ({ issue, userName, onRemove }) => {
  const handleRemove = () => onRemove(issue.rowNumber);
  return (
    <div className={styles.importIssueRow}>
      <span className={styles.importIssueText}>{getIdentityIssueText(issue, userName)}</span>
      <button type="button" className={`${shared.btnSecondary} ${styles.importIssueDeleteBtn}`} aria-label={getMsg('ImportPage.deleteRowAriaLabel', { rowNumber: issue.rowNumber })} onClick={handleRemove}><Trash2 size={13} />{getMsg('ImportPage.deleteRow')}</button>
    </div>
  );
};

interface ImportPreviewPanelProps {
  sourceRowCount: number;
  castInputType: ColumnMapping['castInputType'];
  model: ImportPreviewModel;
  onOpenRawColumns: () => void;
  onRemoveSourceRow: (rowNumber: number) => void;
  onImportAndOpenLottery: () => void;
  onImportOnly: () => void;
}

/** 変換後の応募者、本人確認エラー、取込操作を同じ検証モデルから表示する。 */
export const ImportPreviewPanel: React.FC<ImportPreviewPanelProps> = ({
  sourceRowCount,
  castInputType,
  model,
  onOpenRawColumns,
  onRemoveSourceRow,
  onImportAndOpenLottery,
  onImportOnly,
}) => {
  const previewCastGridStyle = getCastGridStyle(model.previewCastColumnIndexes.length);
  const identityIssueHeadingId = React.useId();
  const getPreviewCastItemClassName = (cast: string) => (
    `${styles.importPreviewCastGridItem}${cast ? '' : ` ${styles.importPreviewCastGridItemEmpty}`}`
  );

  return (
    <div className={styles.importPreviewSection}>
      <div className={`${styles.importSectionHeader} ${styles.importPreviewHeader}`}>
        <div className={styles.importPreviewHeaderMain}>
          {getMsg('ImportPage.previewTitle')}
          <span className={styles.importPreviewCount}>{getMsg('ImportPage.previewCount', { count: Math.min(IMPORT_PREVIEW_MAX_ROWS, sourceRowCount) })}</span>
        </div>
        <button type="button" className={`${shared.btnSecondary} ${styles.importRawColumnsBtn}`} onClick={onOpenRawColumns}><Sheet size={13} />{getMsg('ImportPage.showAllColumns')}</button>
      </div>

      <div className={`${shared.tableContainer} ${shared.customScrollbar} ${styles.importPreviewTableContainer}`}>
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
            {model.previewRows.map(({ sourceRow, user }) => (
              <tr key={sourceRow.rowNumber} className={model.issueRowNumbers.has(sourceRow.rowNumber) ? styles.importPreviewRowWarn : ''}>
                <td className={styles.importPreviewNameCell}>
                  {user.name || <span className={styles.importCellEmpty}>{getMsg('common.emptyMarker')}</span>}
                </td>
                <td className={styles.importPreviewIdCell}>
                  {user.x_id || <span className={styles.importCellWarn}>{getMsg('ImportPage.emptyValue')}</span>}
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
            ))}
          </tbody>
        </table>
      </div>

      {model.identityIssues.length > 0 && (
        <section className={styles.importIssuePanel} aria-labelledby={identityIssueHeadingId} aria-live="polite">
          <div id={identityIssueHeadingId} className={styles.importIssueSummary}>{getMsg('ImportPage.identityIssueSummary')}</div>
          <div className={`${styles.importIssueList} ${shared.customScrollbar}`}>
            {model.identityIssues.map((issue) => (
              <ImportIssueRow key={issue.rowNumber} issue={issue} userName={model.mappedRowByNumber.get(issue.rowNumber)?.user.name} onRemove={onRemoveSourceRow} />
            ))}
          </div>
        </section>
      )}

      <div className={styles.importFooter}>
        <div className={styles.importValidation}>
          <span className={styles.importValidationOk}>{getMsg('ImportPage.importableCount', { count: model.validCount })}</span>
          {model.emptyIdCount > 0 && <span className={styles.importValidationWarn}>{getMsg('ImportPage.emptyXIdCount', { count: model.emptyIdCount })}</span>}
          {model.duplicateIdCount > 0 && <span className={styles.importValidationWarn}>{getMsg('ImportPage.duplicateXIdCount', { count: model.duplicateIdCount })}</span>}
        </div>
        <div className={styles.importFooterActions}>
          <button type="button" className={`${shared.btnSecondary} ${styles.importSubmitBtn}`} disabled={!model.canImport} onClick={onImportAndOpenLottery}>{getMsg('ImportPage.proceedToLottery')}</button>
          <button type="button" className={`${shared.btnPrimary} ${styles.importSubmitBtn}`} disabled={!model.canImport} onClick={onImportOnly}>{getMsg('ImportPage.importCount', { count: model.validCount })}</button>
        </div>
      </div>
    </div>
  );
};
