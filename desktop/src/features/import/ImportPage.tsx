import React, { useMemo, useRef, useState } from 'react';
import { Upload } from '@/common/icons';
import { AppSelect, type AppSelectOption } from '@/components/AppSelect';
import { parseTSV } from '@/common/csvParse';
import {
  createEmptyColumnMapping,
  hasRequiredIdentityColumn,
  type ColumnMapping,
} from '@/common/importFormat';
import { mapRowToUserBeanWithMapping, type MapRowOptions } from '@/common/sheetParsers';
import styles from './ImportPage.module.css';
import shared from '@/styles/shared.module.css';

interface ImportPageProps {
  onImportUserRows: (
    rows: string[][],
    mapping: ColumnMapping,
    options?: MapRowOptions
  ) => void;
}

type CastInputType = 'separate' | 'comma';

const NONE = '__none__';
const PREVIEW_MAX = 5;

function autoDetect(headers: string[]): { mapping: ColumnMapping; castInputType: CastInputType } {
  const m = createEmptyColumnMapping();
  let castInputType: CastInputType = 'separate';
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (!h) continue;
    if (m.name < 0 && /名前|お名前|ユーザー名|name/.test(h)) { m.name = i; continue; }
    if (m.x_id < 0 && /x[\s_]?id|twitter|xid|アカウントid/.test(h)) { m.x_id = i; continue; }
    if (m.vrc_url < 0 && /vrc|vrchat|プロフ/.test(h)) { m.vrc_url = i; continue; }
    if (/希望キャスト|カンマ区切り/.test(h)) { m.cast1 = i; castInputType = 'comma'; continue; }
    if (m.cast1 < 0 && /第1希望|希望1|第一希望|1st|choice\s*1/.test(h)) { m.cast1 = i; continue; }
    if (m.cast2 < 0 && /第2希望|希望2|第二希望|2nd|choice\s*2/.test(h)) { m.cast2 = i; continue; }
    if (m.cast3 < 0 && /第3希望|希望3|第三希望|3rd|choice\s*3/.test(h)) { m.cast3 = i; continue; }
  }
  return { mapping: m, castInputType };
}

export const ImportPage: React.FC<ImportPageProps> = ({ onImportUserRows }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(() => createEmptyColumnMapping());
  const [castInputType, setCastInputType] = useState<CastInputType>('separate');
  const [fileAreaShake, setFileAreaShake] = useState(false);
  const [xIdShake, setXIdShake] = useState(false);

  const columnOptions: AppSelectOption[] = useMemo(
    () => [
      { value: NONE, label: '未使用' },
      ...headers.map((h, i) => ({ value: String(i), label: `${i + 1}: ${h || `列${i + 1}`}` })),
    ],
    [headers],
  );

  const sv = (idx: number) =>
    idx >= 0 && columnOptions.some((o) => o.value === String(idx)) ? String(idx) : NONE;

  const setCol = (key: keyof ColumnMapping) => (val: string) =>
    setMapping((m) => ({ ...m, [key]: val === NONE ? -1 : Number(val) }));

  const effectiveMapping: ColumnMapping = useMemo(
    () => castInputType === 'comma' ? { ...mapping, cast2: -1, cast3: -1 } : mapping,
    [mapping, castInputType],
  );

  const mapOptions: MapRowOptions | undefined = useMemo(
    () => castInputType === 'comma' && mapping.cast1 >= 0
      ? { splitCommaColumnIndex: mapping.cast1 }
      : undefined,
    [castInputType, mapping.cast1],
  );

  const previewRows = useMemo(() => {
    if (!rows) return [];
    return rows.slice(0, PREVIEW_MAX).map(
      (row) => mapRowToUserBeanWithMapping(row as unknown[], effectiveMapping, mapOptions),
    );
  }, [rows, effectiveMapping, mapOptions]);

  const { validCount, emptyIdCount } = useMemo(() => {
    if (!rows) return { validCount: 0, emptyIdCount: 0 };
    const all = rows.map((r) => mapRowToUserBeanWithMapping(r as unknown[], effectiveMapping, mapOptions));
    return {
      validCount: all.filter((u) => u.x_id).length,
      emptyIdCount: all.filter((u) => !u.x_id).length,
    };
  }, [rows, effectiveMapping, mapOptions]);

  const canImport =
    rows !== null && rows.length > 0 &&
    hasRequiredIdentityColumn(effectiveMapping) &&
    validCount > 0;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.tsv')) {
        setError('拡張子が .tsv のファイルを選択してください。');
        setFileAreaShake(true);
        return;
      }
      const content = await file.text();
      const firstLine = content.split('\n').find((l) => l.trim());
      if (firstLine && !firstLine.includes('\t')) {
        setError('タブ区切り（TSV）ではないファイルです。');
        setFileAreaShake(true);
        return;
      }
      const parsed = parseTSV(content);
      if (parsed.length <= 1) { setError('データ行がありません。'); return; }
      const [headerRow, ...dataRows] = parsed;
      const detected = autoDetect(headerRow ?? []);
      setHeaders(headerRow ?? []);
      setRows(dataRows);
      setFileName(file.name);
      setMapping(detected.mapping);
      setCastInputType(detected.castInputType);
      setError(null);
      if (detected.mapping.x_id < 0) setXIdShake(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'TSV の読み込みに失敗しました。');
    } finally {
      e.target.value = '';
    }
  };

  const handleImport = () => {
    if (!rows?.length) return;
    if (!hasRequiredIdentityColumn(effectiveMapping)) { setError('X ID 列は必須です。'); return; }
    const used = new Set(
      [effectiveMapping.name, effectiveMapping.x_id, effectiveMapping.vrc_url,
        effectiveMapping.cast1, effectiveMapping.cast2, effectiveMapping.cast3].filter((i) => i >= 0),
    );
    const extraColumns = headers
      .map((h, i) => ({ h, i }))
      .filter(({ i }) => !used.has(i))
      .map(({ h, i }) => ({ columnIndex: i, label: h || `列${i + 1}` }));
    onImportUserRows(rows, { ...effectiveMapping, extraColumns }, mapOptions);
  };

  return (
    <div className={styles.importTwoPane}>
      {/* ── 左ペイン: 設定 ── */}
      <div className={styles.importTwoPane__settings}>
        <input
          ref={inputRef}
          type="file"
          accept=".tsv,text/tab-separated-values"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <div
          className={`${styles.applicantImportCard__top}${fileAreaShake ? ` ${shared.shake}` : ''}`}
          onAnimationEnd={() => setFileAreaShake(false)}
        >
          <button
            type="button"
            className={`${shared.btnPrimary} ${styles.applicantImportCard__fileButton}`}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={15} />
            TSV を選択
          </button>
          <span className={styles.applicantImportCard__fileName}>{fileName || '未選択'}</span>
        </div>

        {headers.length > 0 && (
          <>
            <div className={styles.importSectionLabel}>列マッピング</div>
            <label className={shared.formGroup}>
              <span className={shared.formLabel}>ユーザー名</span>
              <AppSelect value={sv(mapping.name)} onValueChange={setCol('name')} options={columnOptions} placeholder="列を選択" />
            </label>
            <label
              className={`${shared.formGroup}${xIdShake ? ` ${shared.shake}` : ''}`}
              onAnimationEnd={() => setXIdShake(false)}
            >
              <span className={shared.formLabel}>
                X ID <span style={{ color: 'var(--discord-accent-red)' }}>*</span>
              </span>
              <AppSelect value={sv(mapping.x_id)} onValueChange={setCol('x_id')} options={columnOptions} placeholder="列を選択" />
              {rows && mapping.x_id < 0 && (
                <span className={shared.importErrorMsg}>X ID 列が検出できませんでした。手動で選択してください。</span>
              )}
            </label>
            <label className={shared.formGroup}>
              <span className={shared.formLabel}>VRC URL</span>
              <AppSelect value={sv(mapping.vrc_url)} onValueChange={setCol('vrc_url')} options={columnOptions} placeholder="列を選択" />
            </label>

            <div className={styles.importSectionLabel} style={{ marginTop: 8 }}>希望キャストの形式</div>
            <div className={styles.importCastRadios}>
              <label>
                <input
                  type="radio"
                  checked={castInputType === 'separate'}
                  onChange={() => setCastInputType('separate')}
                />
                {' '}第1/2/3希望（別々の列）
              </label>
              <label>
                <input
                  type="radio"
                  checked={castInputType === 'comma'}
                  onChange={() => setCastInputType('comma')}
                />
                {' '}1列・カンマ区切り
              </label>
            </div>

            {castInputType === 'separate' ? (
              <>
                <label className={shared.formGroup}>
                  <span className={shared.formLabel}>希望キャスト 1</span>
                  <AppSelect value={sv(mapping.cast1)} onValueChange={setCol('cast1')} options={columnOptions} placeholder="列を選択" />
                </label>
                <label className={shared.formGroup}>
                  <span className={shared.formLabel}>希望キャスト 2</span>
                  <AppSelect value={sv(mapping.cast2)} onValueChange={setCol('cast2')} options={columnOptions} placeholder="列を選択" />
                </label>
                <label className={shared.formGroup}>
                  <span className={shared.formLabel}>希望キャスト 3</span>
                  <AppSelect value={sv(mapping.cast3)} onValueChange={setCol('cast3')} options={columnOptions} placeholder="列を選択" />
                </label>
              </>
            ) : (
              <label className={shared.formGroup}>
                <span className={shared.formLabel}>希望キャスト列</span>
                <AppSelect value={sv(mapping.cast1)} onValueChange={setCol('cast1')} options={columnOptions} placeholder="列を選択" />
              </label>
            )}
          </>
        )}

        {error && (
          <p style={{ color: 'var(--discord-accent-red)', fontSize: 12, marginTop: 4 }}>{error}</p>
        )}
      </div>

      {/* ── 右ペイン: プレビュー ── */}
      <div className={styles.importTwoPane__preview}>
        {!rows ? (
          <div className={styles.importPreviewEmpty}>TSV を選択するとプレビューが表示されます</div>
        ) : (
          <>
            <div className={styles.importSectionLabel} style={{ marginBottom: 8 }}>
              プレビュー（先頭 {Math.min(PREVIEW_MAX, rows.length)} 件）
            </div>
            <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ maxHeight: 220 }}>
              <table className={styles.importPreviewTable}>
                <thead>
                  <tr>
                    <th>ユーザー名</th>
                    <th>X ID</th>
                    {castInputType === 'comma' ? (
                      <th>希望キャスト</th>
                    ) : (
                      [1, 2, 3].map((n) => <th key={n}>希望 {n}</th>)
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((u, idx) => (
                    <tr
                      key={idx}
                      className={!u.x_id ? styles.importPreviewTable__rowWarn : ''}
                    >
                      <td title={u.name}>{u.name || <span className={styles.importCellEmpty}>—</span>}</td>
                      <td>
                        {u.x_id || (
                          <span style={{ color: 'var(--discord-accent-yellow)' }}>空</span>
                        )}
                      </td>
                      {castInputType === 'comma' ? (
                        <td title={u.casts.join(', ')}>
                          {u.casts.join(', ') || <span className={styles.importCellEmpty}>—</span>}
                        </td>
                      ) : (
                        [0, 1, 2].map((i) => (
                          <td key={i}>
                            {u.casts[i] || <span className={styles.importCellEmpty}>—</span>}
                          </td>
                        ))
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.importValidation}>
              <span className={styles.importValidation__ok}>✓ {validCount} 件取り込めます</span>
              {emptyIdCount > 0 && (
                <span className={styles.importValidation__warn}>
                  ⚠ {emptyIdCount} 件 X ID が空（スキップ）
                </span>
              )}
            </div>

            <button
              type="button"
              className={shared.btnPrimary}
              style={{ marginTop: 12, width: '100%' }}
              disabled={!canImport}
              onClick={handleImport}
            >
              {validCount} 件を取り込む
            </button>
          </>
        )}
      </div>
    </div>
  );
};
