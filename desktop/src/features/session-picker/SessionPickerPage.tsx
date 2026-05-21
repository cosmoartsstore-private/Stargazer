// ─────────────────────────────────────────────────────────────────────────────
// SessionPickerPage
//
// One CSV import = one session DB. To keep that storage cost honest, this page
// parses + previews the CSV entirely in memory BEFORE asking the backend to
// create a session directory on disk. If the user drops the wrong file (or
// cancels after seeing the preview) we simply discard the parsed rows without
// touching the filesystem — there is no orphan session DB to clean up later.
//
// Header templates are matched on a normalized signature of the column names.
// A hit means the user has imported this CSV layout before and we can skip
// ahead to "セッション開始"; a miss prompts the user to fill in a column
// mapping JSON + matching settings JSON which becomes the new template.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useRef, useState } from 'react';
import { Upload, Plus, Trash2, RefreshCw, Database } from '@/common/icons';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useAppContext } from '@/stores/AppContext';
import { parseTSV } from '@/common/csvParse';
import { mapRowToUserBeanWithMapping } from '@/common/sheetParsers';
import {
  createEmptyColumnMapping,
  type ColumnMapping,
} from '@/common/importFormat';
import {
  listSessions,
  createSession,
  deleteSession,
  setSessionMeta,
  type SessionInfo,
} from '@/db/repositories/eventRepository';
import {
  findHeaderTemplateBySignature,
  insertHeaderTemplate,
  type HeaderTemplate,
} from '@/db/repositories/headerTemplateRepository';
import { computeHeaderSignature } from '@/db/headerSignature';
import { openSession, closeSession } from '@/db/database';
import {
  saveLastUsedSession,
  clearLastUsedSession,
} from '@/db/initializer';
import { persistApplicants } from '@/db/repositories/applicantRepository';
import shared from '@/styles/shared.module.css';

const PREVIEW_MAX_ROWS = 20;

interface ParsedCsv {
  headers: string[];
  rows: string[][];
  signature: string;
  fileName: string;
}

function formatTimestamp(ts: string): string {
  // Backend hands timestamps back as ISO-ish strings; we try to render them as
  // YYYY/MM/DD HH:mm:ss for Japanese locale. If parsing fails we fall back to
  // the raw string so we never display nothing.
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function safeParseColumnMapping(raw: string): ColumnMapping | null {
  if (!raw.trim()) return createEmptyColumnMapping();
  try {
    const obj = JSON.parse(raw) as Partial<ColumnMapping>;
    const base = createEmptyColumnMapping();
    return { ...base, ...obj };
  } catch {
    return null;
  }
}

export const SessionPickerPage: React.FC = () => {
  const {
    currentEventName,
    currentSessionTimestamp,
    sessions,
    setSessions,
    setCurrentSessionTimestamp,
    setActivePage,
    setApplicants,
    setCurrentWinners,
    bumpDataReload,
    switchSession,
  } = useAppContext();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Parsed CSV state (NOT yet persisted) ────────────────────────────────────
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [matchedTemplate, setMatchedTemplate] = useState<HeaderTemplate | null>(null);
  const [templateChecked, setTemplateChecked] = useState(false);

  // ── New-template form state (only when matchedTemplate === null) ────────────
  const [newTemplateLabel, setNewTemplateLabel] = useState('');
  const [newTemplateMappingJson, setNewTemplateMappingJson] = useState('');
  const [newTemplateMatchingJson, setNewTemplateMatchingJson] = useState('');

  // ── UI feedback ─────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const previewRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.slice(0, PREVIEW_MAX_ROWS);
  }, [parsed]);

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setMatchedTemplate(null);
    setTemplateChecked(false);
    setNewTemplateLabel('');
    setNewTemplateMappingJson('');
    setNewTemplateMatchingJson('');
    try {
      const content = await file.text();
      const all = parseTSV(content);
      if (all.length <= 1) {
        setError('データ行がありません。');
        setParsed(null);
        return;
      }
      const [headers, ...rows] = all;
      const sig = computeHeaderSignature(headers ?? []);
      setParsed({ headers: headers ?? [], rows, signature: sig, fileName: file.name });

      const tpl = await findHeaderTemplateBySignature(sig);
      setMatchedTemplate(tpl);
      setTemplateChecked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました。');
      setParsed(null);
    }
  };

  const resolveMapping = (): { mapping: ColumnMapping; templateIdProvider: () => Promise<number | null> } | { error: string } => {
    if (!parsed) return { error: 'CSV が読み込まれていません。' };

    if (matchedTemplate) {
      // Use the saved mapping — fall back to empty if it cannot parse so we at
      // least try to persist applicants even when the stored JSON is malformed.
      const parsedMapping = matchedTemplate.column_mapping
        ? safeParseColumnMapping(matchedTemplate.column_mapping)
        : createEmptyColumnMapping();
      const mapping = parsedMapping ?? createEmptyColumnMapping();
      return {
        mapping,
        templateIdProvider: async () => matchedTemplate.id,
      };
    }

    // New template: parse user-provided JSON now so we can fail fast before
    // touching the DB.
    const mapping = safeParseColumnMapping(newTemplateMappingJson);
    if (mapping == null) {
      return { error: 'カラムマッピングは有効な JSON ではありません。' };
    }
    let matchingSettingsJson: string | null = null;
    if (newTemplateMatchingJson.trim()) {
      try {
        JSON.parse(newTemplateMatchingJson);
        matchingSettingsJson = newTemplateMatchingJson;
      } catch {
        return { error: 'マッチング設定は有効な JSON ではありません。' };
      }
    }
    return {
      mapping,
      templateIdProvider: async () => insertHeaderTemplate({
        signature: parsed.signature,
        label: newTemplateLabel.trim() || null,
        column_mapping: newTemplateMappingJson.trim() || null,
        matching_settings: matchingSettingsJson,
      }),
    };
  };

  const handleStartSession = async () => {
    if (!parsed || currentEventName === null) return;
    const resolved = resolveMapping();
    if ('error' in resolved) {
      setError(resolved.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Order is important: persist the template (if new) BEFORE creating the
      // session so we can record the template id in session meta atomically.
      const templateId = await resolved.templateIdProvider();
      const timestamp = await createSession(currentEventName);
      await openSession(timestamp);
      await setSessionMeta({
        imported_at: timestamp,
        header_template_id: templateId ?? null,
      });
      const users = parsed.rows
        .map((row) => mapRowToUserBeanWithMapping(row as unknown[], resolved.mapping))
        .filter((u) => u.name.trim() !== '' || u.x_id.trim() !== '');
      await persistApplicants(users);
      saveLastUsedSession(timestamp);

      // Refresh session list & switch context state
      const nextSessions = await listSessions(currentEventName);
      setSessions(nextSessions);
      setApplicants(users);
      setCurrentWinners([]);
      setCurrentSessionTimestamp(timestamp);
      bumpDataReload();

      setParsed(null);
      setMatchedTemplate(null);
      setTemplateChecked(false);
      setActivePage('dataManagement');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'セッションの作成に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const openExistingSession = async (timestamp: string) => {
    setBusy(true);
    setError(null);
    try {
      await switchSession(timestamp);
      setActivePage('dataManagement');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'セッションを開けませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteTarget || currentEventName === null) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setBusy(true);
    setError(null);
    try {
      const isCurrent = currentSessionTimestamp === target;
      if (isCurrent) {
        await closeSession();
        setCurrentSessionTimestamp(null);
        clearLastUsedSession();
        setApplicants([]);
        setCurrentWinners([]);
      }
      await deleteSession(currentEventName, target);
      const nextSessions = await listSessions(currentEventName);
      setSessions(nextSessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'セッションの削除に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const showNewTemplateForm = parsed !== null && templateChecked && matchedTemplate === null;
  const canStart = parsed !== null && templateChecked && !busy;

  return (
    <div className={shared.pageWrapper}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>セッション選択</h1>
        <p className={shared.pageHeaderSubtitle}>
          {currentEventName ? `イベント: ${currentEventName}` : ''} 新しい応募 CSV を取り込むか、過去のセッションを開きます。
        </p>
      </header>

      {error && (
        <ConfirmModal type="alert" message={error} onConfirm={() => setError(null)} confirmLabel="OK" />
      )}
      {deleteTarget && (
        <ConfirmModal
          type="confirm"
          title="セッションの削除"
          message={`セッション「${formatTimestamp(deleteTarget)}」を削除します。\n取り込んだ応募データ・抽選結果は失われます。`}
          confirmLabel="削除する"
          cancelLabel="キャンセル"
          onConfirm={handleDeleteSession}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── 新規取り込み ───────────────────────────────────────────────────── */}
      <section className={shared.sectionBlock} style={{ marginBottom: 24 }}>
        <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>
          <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          新規取り込み
        </h2>
        <p className={shared.pageHeaderSubtitle}>
          応募 CSV/TSV をドロップしてプレビューを確認し、セッションを開始します。
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".tsv,.csv,text/tab-separated-values,text/csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button type="button" className={shared.btnPrimary} onClick={handleFilePick} disabled={busy}>
            <Upload size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            ファイルを選択
          </button>
          <span style={{ fontSize: 12, color: 'var(--discord-text-muted)' }}>
            {parsed ? parsed.fileName : '未選択'}
          </span>
        </div>

        {parsed && (
          <>
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--discord-text-muted)' }}>
              ヘッダ署名: <code style={{ fontFamily: 'monospace' }}>{parsed.signature || '(空)'}</code>
            </div>

            <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 12, maxHeight: 280 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace', minWidth: '100%' }}>
                <thead>
                  <tr>
                    {parsed.headers.map((h, i) => (
                      <th key={i} className={shared.tableHeaderCell} style={{ whiteSpace: 'nowrap' }}>
                        {h || `列${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i}>
                      {parsed.headers.map((_, j) => (
                        <td key={j} className={shared.tableCell} style={{ whiteSpace: 'nowrap' }}>
                          {row[j] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--discord-text-muted)', marginTop: 4 }}>
              先頭 {Math.min(PREVIEW_MAX_ROWS, parsed.rows.length)} 件 / 全 {parsed.rows.length} 件
            </div>

            {templateChecked && matchedTemplate && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--discord-bg-secondary)', border: '1px solid var(--discord-border)', borderRadius: 4, fontSize: 13 }}>
                既知の形式: <strong>{matchedTemplate.label ?? `テンプレ #${matchedTemplate.id}`}</strong>
              </div>
            )}

            {showNewTemplateForm && (
              <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--discord-text-muted)', margin: 0 }}>
                  未登録の形式です。テンプレートとして登録します。
                </p>
                <label className={shared.formGroup}>
                  <span className={shared.formLabel}>ラベル（任意）</span>
                  <input
                    type="text"
                    className={shared.formInput}
                    value={newTemplateLabel}
                    onChange={(e) => setNewTemplateLabel(e.target.value)}
                    placeholder="例: 標準フォーム v1"
                  />
                </label>
                <label className={shared.formGroup}>
                  <span className={shared.formLabel}>カラムマッピング (JSON)</span>
                  <textarea
                    className={shared.formInput}
                    style={{ fontFamily: 'monospace', minHeight: 100, resize: 'vertical' }}
                    value={newTemplateMappingJson}
                    onChange={(e) => setNewTemplateMappingJson(e.target.value)}
                    placeholder='{ "name": 0, "x_id": 1, "cast1": 2 }'
                  />
                </label>
                <label className={shared.formGroup}>
                  <span className={shared.formLabel}>マッチング設定 (JSON, 任意)</span>
                  <textarea
                    className={shared.formInput}
                    style={{ fontFamily: 'monospace', minHeight: 80, resize: 'vertical' }}
                    value={newTemplateMatchingJson}
                    onChange={(e) => setNewTemplateMatchingJson(e.target.value)}
                    placeholder='{}'
                  />
                </label>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                className={shared.btnPrimary}
                disabled={!canStart}
                onClick={handleStartSession}
              >
                {matchedTemplate ? 'セッション開始' : 'テンプレート登録してセッション開始'}
              </button>
            </div>
          </>
        )}
      </section>

      {/* ── 過去セッションを開く ─────────────────────────────────────────── */}
      <section className={shared.sectionBlock}>
        <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>
          <Database size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          過去セッションを開く
        </h2>
        {sessions.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--discord-text-muted)' }}>
            まだ取り込み履歴がありません。
          </p>
        ) : (
          <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className={shared.tableHeaderCell}>取り込み日時</th>
                  <th className={shared.tableHeaderCell} style={{ width: 200 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s: SessionInfo) => {
                  const isCurrent = currentSessionTimestamp === s.timestamp;
                  return (
                    <tr key={s.timestamp}>
                      <td className={shared.tableCell}>
                        {formatTimestamp(s.timestamp)}
                        {isCurrent && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--discord-accent-green)' }}>
                            (使用中)
                          </span>
                        )}
                      </td>
                      <td className={shared.tableCell}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className={shared.btnSecondary}
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            disabled={busy || isCurrent}
                            onClick={() => void openExistingSession(s.timestamp)}
                            title="このセッションを開く"
                          >
                            <RefreshCw size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                            開く
                          </button>
                          <button
                            type="button"
                            className={shared.btnDanger}
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            disabled={busy}
                            onClick={() => setDeleteTarget(s.timestamp)}
                            title="このセッションを削除"
                          >
                            <Trash2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
