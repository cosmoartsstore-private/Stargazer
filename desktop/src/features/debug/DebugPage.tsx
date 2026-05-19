import React, { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '@/stores/AppContext';
import { getDb } from '@/db';
import shared from '@/styles/shared.module.css';

type DebugTab = 'db' | 'sql' | 'schema';

interface TableData {
  name: string;
  rows: Record<string, unknown>[];
  error?: string;
}

const TABLES = [
  'meta',
  'casts',
  'cast_urls',
  'cast_ng_entries',
  'event_cast_present',
  'applicants',
  'applicant_casts',
  'applicant_extra',
  'attendance',
  'cast_attendance',
  'caution_users',
  'settings',
];

const QUICK_QUERIES: { label: string; sql: string }[] = [
  { label: 'meta',                 sql: 'SELECT * FROM meta' },
  { label: 'casts',                sql: 'SELECT id, name, group_name, is_attend FROM casts ORDER BY id' },
  { label: 'event_cast_present',   sql: 'SELECT ecp.cast_id, c.name AS cast_name, ecp.is_present FROM event_cast_present ecp JOIN casts c ON c.id = ecp.cast_id ORDER BY c.name' },
  { label: 'applicants',           sql: 'SELECT a.id, a.x_id, a.name, a.is_guaranteed FROM applicants a ORDER BY a.id' },
  { label: 'cast_attendance',      sql: 'SELECT c.name AS cast_name, ca.recorded_at FROM cast_attendance ca JOIN casts c ON c.id = ca.cast_id ORDER BY ca.recorded_at DESC LIMIT 50' },
  { label: 'attendance',           sql: 'SELECT a.id, ap.x_id, c.name AS cast_name, a.seat_label FROM attendance a JOIN applicants ap ON ap.id = a.applicant_id LEFT JOIN casts c ON c.id = a.matched_cast_id ORDER BY a.id DESC LIMIT 50' },
  { label: 'caution_users',        sql: 'SELECT id, username, account_id, reason, ng_cast_count FROM caution_users ORDER BY id' },
  { label: 'settings',             sql: 'SELECT * FROM settings' },
  { label: 'PRAGMA user_version',  sql: 'PRAGMA user_version' },
  { label: 'sqlite_master',        sql: 'SELECT type, name, sql FROM sqlite_master ORDER BY type, name' },
];

// ── Table renderer ────────────────────────────────────────────────────────────
function RowTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return <p style={{ color: 'var(--discord-text-muted)', fontSize: 12, margin: '6px 0' }}>(0 件)</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div style={{ overflowX: 'auto', maxHeight: 320 }} className={shared.customScrollbar}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace', minWidth: '100%' }}>
        <thead>
          <tr>
            {cols.map((col) => (
              <th key={col} style={{ padding: '4px 10px', background: 'var(--discord-bg-tertiary)', border: '1px solid var(--discord-border)', textAlign: 'left', whiteSpace: 'nowrap', color: 'var(--discord-text-muted)' }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--discord-bg-secondary)' : 'var(--discord-bg-dark)' }}>
              {cols.map((col) => {
                const val = row[col];
                const display = val === null ? <span style={{ color: 'var(--discord-text-muted)' }}>NULL</span>
                  : typeof val === 'string' && val.length > 80 ? <span title={val}>{val.slice(0, 80)}…</span>
                  : String(val);
                return (
                  <td key={col} style={{ padding: '3px 10px', border: '1px solid var(--discord-border)', whiteSpace: 'nowrap', color: 'var(--discord-text-normal)' }}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── TableCard ─────────────────────────────────────────────────────────────────
function TableCard({ data }: { data: TableData }) {
  const [open, setOpen] = useState(false);
  const count = data.rows.length;
  return (
    <div style={{ border: '1px solid var(--discord-border)', borderRadius: 6, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: 'var(--discord-bg-secondary)', cursor: 'pointer',
          border: 'none', color: 'var(--discord-text-normal)', fontSize: 13, fontFamily: 'monospace',
        }}
      >
        <span>{data.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {data.error
            ? <span style={{ color: '#f04747', fontSize: 11 }}>ERR</span>
            : <span style={{ background: count > 0 ? 'var(--discord-brand)' : 'var(--discord-bg-tertiary)', color: 'var(--discord-text-normal)', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{count}</span>
          }
          <span style={{ fontSize: 16 }}>{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: '8px 12px', background: 'var(--discord-bg-dark)' }}>
          {data.error
            ? <p style={{ color: '#f04747', fontSize: 12 }}>{data.error}</p>
            : <RowTable rows={data.rows} />
          }
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export const DebugPage: React.FC = () => {
  const ctx = useAppContext();
  const [activeTab, setActiveTab] = useState<DebugTab>('db');
  const [tableData, setTableData] = useState<TableData[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  const [sql, setSql] = useState(QUICK_QUERIES[0].sql);
  const [sqlResults, setSqlResults] = useState<Record<string, unknown>[] | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);

  const [schemaRows, setSchemaRows] = useState<Record<string, unknown>[] | null>(null);

  const loadAllTables = useCallback(async () => {
    setDbLoading(true);
    const db = await getDb();
    const results: TableData[] = [];
    for (const t of TABLES) {
      try {
        const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${t}`);
        results.push({ name: t, rows });
      } catch (e) {
        results.push({ name: t, rows: [], error: String(e) });
      }
    }
    setTableData(results);
    setDbLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'db' && tableData.length === 0) void loadAllTables();
    if (activeTab === 'schema' && schemaRows === null) {
      getDb().then((db) =>
        db.select<Record<string, unknown>[]>('SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name')
          .then(setSchemaRows)
          .catch(() => setSchemaRows([]))
      );
    }
  }, [activeTab, tableData.length, schemaRows, loadAllTables]);

  const runSql = async () => {
    setSqlRunning(true);
    setSqlError(null);
    setSqlResults(null);
    try {
      const db = await getDb();
      const upper = sql.trim().toUpperCase();
      if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('WITH')) {
        const rows = await db.select<Record<string, unknown>[]>(sql);
        setSqlResults(rows);
      } else {
        await db.execute(sql);
        setSqlResults([{ result: 'OK (execute)' }]);
      }
    } catch (e) {
      setSqlError(String(e));
    } finally {
      setSqlRunning(false);
    }
  };

  const sessionState = {
    isDbReady: ctx.isDbReady,
    currentEventName: ctx.currentEventName,
    activePage: ctx.activePage,
    themeId: ctx.themeId,
    isMatchingLocked: ctx.isMatchingLocked,
    globalMatchingError: ctx.globalMatchingError,
    globalMatchingResultSize: ctx.globalMatchingResult?.size ?? null,
    globalTableSlotsCount: ctx.globalTableSlots?.length ?? null,
    winnersCount: ctx.currentWinners.length,
    guaranteedCount: ctx.guaranteedWinners.length,
  };

  const tabs: { id: DebugTab; label: string }[] = [
    { id: 'db',     label: 'DB Tables' },
    { id: 'sql',    label: 'SQL Runner' },
    { id: 'schema', label: 'Schema' },
  ];

  const preStyle: React.CSSProperties = {
    background: 'var(--discord-bg-secondary)',
    border: '1px solid var(--discord-border)',
    borderRadius: 6,
    padding: 12,
    fontSize: 11,
    fontFamily: 'monospace',
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: 500,
    color: 'var(--discord-text-normal)',
    whiteSpace: 'pre',
    margin: 0,
  };

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>Debug</h1>
        <p className={shared.pageHeaderSubtitle} style={{ color: '#f0a500' }}>
          開発環境専用 — 本番ビルドでは非表示
        </p>
      </header>

      <div className={shared.pageTabs}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${shared.pageTab}${activeTab === t.id ? ` ${shared.pageTabActive}` : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* セッション状態（DBにない一時情報）*/}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {Object.entries(sessionState).map(([k, v]) => (
          <span key={k} style={{
            background: 'var(--discord-bg-secondary)',
            border: '1px solid var(--discord-border)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            fontFamily: 'monospace',
            color: v === null ? 'var(--discord-text-muted)' : v === false ? '#f04747' : v === true ? '#43b581' : 'var(--discord-text-normal)',
          }}>
            {k}: <strong>{v === null ? 'null' : String(v)}</strong>
          </span>
        ))}
      </div>

      <div className={shared.pageTabContent} style={{ paddingTop: 16 }}>

        {/* ── DB Tables ── */}
        {activeTab === 'db' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button
                type="button"
                className={shared.btnSecondary}
                disabled={dbLoading}
                onClick={() => { setTableData([]); void loadAllTables(); }}
                style={{ fontSize: 12 }}
              >
                {dbLoading ? '読込中...' : '再読込'}
              </button>
            </div>
            {dbLoading && <p style={{ color: 'var(--discord-text-muted)', fontSize: 13 }}>読込中...</p>}
            {tableData.map((td) => <TableCard key={td.name} data={td} />)}
          </div>
        )}

        {/* ── SQL Runner ── */}
        {activeTab === 'sql' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_QUERIES.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className={shared.btnSecondary}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setSql(q.sql)}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea
                className={shared.formInput}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, minHeight: 72, resize: 'vertical' }}
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void runSql(); }}
                placeholder="SQL..."
              />
              <button
                type="button"
                className={shared.btnPrimary}
                disabled={sqlRunning}
                onClick={() => void runSql()}
                style={{ alignSelf: 'flex-start' }}
              >
                {sqlRunning ? '...' : '実行'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--discord-text-muted)' }}>
              Ctrl/Cmd + Enter で実行。SELECT / PRAGMA / WITH 以外は execute として処理。
            </p>
            {sqlError && <p style={{ color: '#f04747', fontSize: 12 }}>{sqlError}</p>}
            {sqlResults !== null && (
              <>
                <p style={{ fontSize: 11, color: 'var(--discord-text-muted)' }}>{sqlResults.length} 行</p>
                <RowTable rows={sqlResults} />
              </>
            )}
          </div>
        )}

        {/* ── Schema ── */}
        {activeTab === 'schema' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {schemaRows === null && <p style={{ color: 'var(--discord-text-muted)', fontSize: 13 }}>読込中...</p>}
            {schemaRows?.map((row) => (
              <div key={String(row.name)} style={{ border: '1px solid var(--discord-border)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ padding: '6px 12px', background: 'var(--discord-bg-secondary)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--discord-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{String(row.type)}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--discord-text-normal)' }}>{String(row.name)}</span>
                </div>
                <pre style={{ ...preStyle, borderRadius: 0, border: 'none', borderTop: '1px solid var(--discord-border)', maxHeight: 160 }}>
                  {String(row.sql)}
                </pre>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};
