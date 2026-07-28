// 応募データをTSVから解析し、列設定と検証結果を確認して取り込むページ。

import React, { useMemo, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { parseTSV } from '@/common/csvParse';
import {
  createEmptyColumnMapping,
  detectColumnMapping,
  type ColumnMapping,
} from '@/common/importFormat';
import type { UserBean } from '@/common/types/entities';
import type { PageType } from '@/layout/appNavigation';
import { getMsg } from '@/messages/getMsg';
import {
  buildImportPreviewModel,
  UNUSED_COLUMN_VALUE,
  type ImportSourceRow,
} from './importPreviewModel';
import {
  ImportMappingPanel,
  type ImportColumnKey,
} from './components/ImportMappingPanel';
import { ImportPreviewPanel } from './components/ImportPreviewPanel';
import { RawColumnsDialog } from './components/RawColumnsDialog';
import styles from './ImportPage.module.css';
import shared from '@/styles/shared.module.css';

interface ImportPageProps {
  onImportUsers: (users: UserBean[], nextPage?: PageType) => void;
}

export const ImportPage: React.FC<ImportPageProps> = ({ onImportUsers }) => {
  // 選択ファイル、列設定、補助ダイアログの表示状態。
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceRows, setSourceRows] = useState<ImportSourceRow[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(() => createEmptyColumnMapping());
  const [rawColumnsOpen, setRawColumnsOpen] = useState(false);
  const [fileAreaShake, setFileAreaShake] = useState(false);
  const [xIdShake, setXIdShake] = useState(false);

  // プレビューと取込実行で同じ列変換・本人確認結果を共有する。
  const previewModel = useMemo(
    () => buildImportPreviewModel(headers, sourceRows, mapping),
    [headers, sourceRows, mapping],
  );

  const handleColumnChange = (key: ImportColumnKey, value: string) => {
    setMapping((current) => ({
      ...current,
      [key]: value === UNUSED_COLUMN_VALUE ? -1 : Number(value),
    }));
  };

  const handleCastInputTypeChange = (castInputType: ColumnMapping['castInputType']) => {
    setMapping((current) => ({ ...current, castInputType }));
  };

  // ファイル境界で形式を検証し、元行番号を固定したまま画面状態へ取り込む。
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.tsv')) {
        setError(getMsg('ImportPage.invalidExtension'));
        setFileAreaShake(true);
        return;
      }
      const content = await file.text();
      const firstLine = content.split('\n').find((line) => line.trim());
      if (firstLine && !firstLine.includes('\t')) {
        setError(getMsg('ImportPage.invalidFormat'));
        setFileAreaShake(true);
        return;
      }
      const parsed = parseTSV(content);
      if (parsed.length <= 1) {
        setError(getMsg('ImportPage.noDataRows'));
        return;
      }
      const [headerRow, ...dataRows] = parsed;
      const detectedMapping = detectColumnMapping(headerRow ?? []);
      setHeaders(headerRow ?? []);
      setSourceRows(dataRows.map((cells, index) => ({ rowNumber: index + 1, cells })));
      setFileName(file.name);
      setMapping(detectedMapping);
      setError(null);
      if (detectedMapping.x_id < 0) setXIdShake(true);
    } catch {
      setError(getMsg('ImportPage.readFailed'));
    } finally {
      event.target.value = '';
    }
  };

  const handleRemoveSourceRow = (rowNumber: number) => {
    setSourceRows((current) => current?.filter((row) => row.rowNumber !== rowNumber) ?? null);
    setError(null);
  };

  const importUsers = (nextPage?: PageType) => {
    if (!previewModel.canImport) return;
    onImportUsers(previewModel.mappedRows.map(({ user }) => user), nextPage);
  };

  // JSXへ渡す画面操作と表示class。
  const handleFileAreaAnimationEnd = () => setFileAreaShake(false);
  const handleFilePickerClick = () => inputRef.current?.click();
  const handleXIdAnimationEnd = () => setXIdShake(false);
  const handleOpenRawColumns = () => setRawColumnsOpen(true);
  const handleImportAndOpenLottery = () => importUsers('lottery');
  const handleImportOnly = () => importUsers();
  const fileSectionClassName = `${styles.importFileSection}${fileAreaShake ? ` ${shared.shake}` : ''}`;
  const fileNameClassName = `${styles.importFileName}${fileName ? ` ${styles.importFileNameActive}` : ''}`;
  const filePickerLabel = sourceRows ? getMsg('ImportPage.reselectTsv') : getMsg('ImportPage.selectTsv');

  return (
    <div className={styles.importFlow}>
      <input ref={inputRef} type="file" accept=".tsv,text/tab-separated-values" onChange={handleFileChange} className={styles.importHiddenInput} />

      <div className={fileSectionClassName} onAnimationEnd={handleFileAreaAnimationEnd}>
        <div className={styles.importFileRow}>
          <button type="button" className={styles.importFileBtn} onClick={handleFilePickerClick}><Upload size={14} />{filePickerLabel}</button>
          <span className={fileNameClassName}>{fileName ? <><FileText size={13} />{fileName}</> : getMsg('ImportPage.noFileSelected')}</span>
        </div>
        {error && <p className={styles.importError}>{error}</p>}
      </div>

      {headers.length > 0 && (
        <ImportMappingPanel
          mapping={mapping}
          columnOptions={previewModel.columnOptions}
          hasSourceRows={sourceRows !== null}
          xIdShake={xIdShake}
          onColumnChange={handleColumnChange}
          onCastInputTypeChange={handleCastInputTypeChange}
          onXIdAnimationEnd={handleXIdAnimationEnd}
        />
      )}

      {!sourceRows ? (
        <div className={styles.importPreviewEmpty}>{getMsg('ImportPage.previewEmpty')}</div>
      ) : (
        <ImportPreviewPanel
          sourceRowCount={sourceRows.length}
          castInputType={mapping.castInputType}
          model={previewModel}
          onOpenRawColumns={handleOpenRawColumns}
          onRemoveSourceRow={handleRemoveSourceRow}
          onImportAndOpenLottery={handleImportAndOpenLottery}
          onImportOnly={handleImportOnly}
        />
      )}

      {sourceRows && rawColumnsOpen && (
        <RawColumnsDialog
          open={rawColumnsOpen}
          headers={headers}
          sourceRows={sourceRows}
          columnIndexes={previewModel.rawColumnIndexes}
          issueRowNumbers={previewModel.issueRowNumbers}
          onOpenChange={setRawColumnsOpen}
        />
      )}
    </div>
  );
};
