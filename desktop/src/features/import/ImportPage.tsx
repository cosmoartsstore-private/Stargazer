// 応募データをTSVから解析し、列設定と検証結果を確認して取り込むページ。

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { DelimitedParseError, parseTSV } from '@/common/csvParse';
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
import {
  getCachedImportColumnMapping,
  persistImportColumnMapping,
} from './importMappingCache';
import styles from './ImportPage.module.css';
import shared from '@/styles/shared.module.css';

interface ImportPageProps {
  onImportUsers: (users: UserBean[], nextPage?: PageType) => void;
  initialData?: ImportPageInitialData;
  onDraftChange?: (hasDraft: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}

export interface ImportPageInitialData {
  headers: string[];
  sourceRows: ImportSourceRow[];
  fileName: string;
  mapping: ColumnMapping;
}

export const ImportPage: React.FC<ImportPageProps> = ({
  onImportUsers,
  initialData,
  onDraftChange,
  onBusyChange,
}) => {
  // 選択ファイル、列設定、補助ダイアログの表示状態。
  const inputRef = useRef<HTMLInputElement>(null);
  const fileReadGenerationRef = useRef(0);
  const fileReadInProgressRef = useRef(false);
  const [sourceRows, setSourceRows] = useState<ImportSourceRow[] | null>(() => initialData?.sourceRows ?? null);
  const [headers, setHeaders] = useState<string[]>(() => initialData?.headers ?? []);
  const [fileName, setFileName] = useState(() => initialData?.fileName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(() => initialData?.mapping ?? createEmptyColumnMapping());
  const [rawColumnsOpen, setRawColumnsOpen] = useState(false);
  const [fileAreaShake, setFileAreaShake] = useState(false);
  const [xIdShake, setXIdShake] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [isFileReading, setIsFileReading] = useState(false);

  // プレビューと取込実行で同じ列変換・本人確認結果を共有する。
  const previewModel = useMemo(
    () => buildImportPreviewModel(headers, sourceRows, mapping),
    [headers, sourceRows, mapping],
  );

  useEffect(() => {
    onDraftChange?.(sourceRows !== null);
    return () => onDraftChange?.(false);
  }, [onDraftChange, sourceRows]);

  useEffect(() => {
    onBusyChange?.(isFileReading);
  }, [isFileReading, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => () => {
    fileReadGenerationRef.current += 1;
    fileReadInProgressRef.current = false;
  }, []);

  const handleColumnChange = (key: ImportColumnKey, value: string) => {
    setMapping((current) => ({
      ...current,
      [key]: value === UNUSED_COLUMN_VALUE ? -1 : Number(value),
    }));
  };

  const handleCastInputTypeChange = (castInputType: ColumnMapping['castInputType']) => {
    setMapping((current) => ({ ...current, castInputType }));
  };

  const resetSelectedFile = () => {
    setSourceRows(null);
    setHeaders([]);
    setFileName('');
    setMapping(createEmptyColumnMapping());
    setRawColumnsOpen(false);
    setMappingOpen(true);
    setPreviewOpen(true);
  };

  // ファイル境界で形式を検証し、元行番号を固定したまま画面状態へ取り込む。
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const readGeneration = ++fileReadGenerationRef.current;
    fileReadInProgressRef.current = true;
    setIsFileReading(true);
    event.target.value = '';
    resetSelectedFile();
    setError(null);
    try {
      if (!file.name.toLowerCase().endsWith('.tsv')) {
        setError(getMsg('ImportPage.invalidExtension'));
        setFileAreaShake(true);
        return;
      }
      const content = await file.text();
      if (readGeneration !== fileReadGenerationRef.current) return;
      const parsed = parseTSV(content);
      if (parsed.length <= 1) {
        setError(getMsg('ImportPage.noDataRows'));
        return;
      }
      const [headerRow, ...dataRows] = parsed;
      const nextHeaders = headerRow ?? [];
      const nextMapping = getCachedImportColumnMapping(nextHeaders)
        ?? detectColumnMapping(nextHeaders);
      setHeaders(nextHeaders);
      setSourceRows(dataRows.map((cells, index) => ({ rowNumber: index + 1, cells })));
      setFileName(file.name);
      setMapping(nextMapping);
      setMappingOpen(true);
      setPreviewOpen(true);
      setError(null);
      if (nextMapping.x_id < 0) setXIdShake(true);
    } catch (caughtError) {
      if (readGeneration !== fileReadGenerationRef.current) return;
      setError(caughtError instanceof DelimitedParseError
        ? getMsg('ImportPage.invalidQuotedField', {
            line: caughtError.line,
            column: caughtError.column,
          })
        : getMsg('ImportPage.readFailed'));
    } finally {
      if (readGeneration === fileReadGenerationRef.current) {
        fileReadInProgressRef.current = false;
        setIsFileReading(false);
      }
    }
  };

  const importUsers = (nextPage?: PageType) => {
    if (fileReadInProgressRef.current) return;
    if (!previewModel.canImport) return;
    if (nextPage === 'lottery' && !previewModel.canProceedToLottery) return;
    persistImportColumnMapping(headers, mapping);
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
  const filePickerLabel = isFileReading
    ? getMsg('ImportPage.readingTsv')
    : sourceRows
      ? getMsg('ImportPage.reselectTsv')
      : getMsg('ImportPage.selectTsv');

  return (
    <div className={styles.importFlow}>
      <input ref={inputRef} type="file" accept=".tsv,text/tab-separated-values" onChange={handleFileChange} className={styles.importHiddenInput} />

      <div className={fileSectionClassName} aria-busy={isFileReading} onAnimationEnd={handleFileAreaAnimationEnd}>
        <div className={styles.importFileRow}>
          <button type="button" className={styles.importFileBtn} onClick={handleFilePickerClick}><Upload size={14} />{filePickerLabel}</button>
          <span className={fileNameClassName}>{fileName ? <><FileText size={13} />{fileName}</> : getMsg('ImportPage.noFileSelected')}</span>
        </div>
        {error && <p className={styles.importError}>{error}</p>}
      </div>

      {headers.length > 0 && (
        <ImportMappingPanel
          open={mappingOpen}
          mapping={mapping}
          columnOptions={previewModel.columnOptions}
          hasSourceRows={sourceRows !== null}
          xIdShake={xIdShake}
          onOpenChange={setMappingOpen}
          onColumnChange={handleColumnChange}
          onCastInputTypeChange={handleCastInputTypeChange}
          onXIdAnimationEnd={handleXIdAnimationEnd}
        />
      )}

      {!sourceRows ? (
        <div className={styles.importPreviewEmpty}>{getMsg('ImportPage.previewEmpty')}</div>
      ) : (
        <ImportPreviewPanel
          open={previewOpen}
          sourceRowCount={sourceRows.length}
          castInputType={mapping.castInputType}
          model={previewModel}
          disabled={isFileReading}
          onOpenChange={setPreviewOpen}
          onOpenRawColumns={handleOpenRawColumns}
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
          xIdColumnIndex={previewModel.importMapping.x_id}
          onOpenChange={setRawColumnsOpen}
        />
      )}
    </div>
  );
};
