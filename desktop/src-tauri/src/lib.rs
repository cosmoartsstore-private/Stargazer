use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

const SHARED_DIR: &str = "shared";
const CACHE_DIR: &str = "Cache";
const WEBVIEW_DATA_DIR: &str = "EBWebView";
const PREFERENCE_MODE_EXTRA_KEY: &str = "__preference_mode";
const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_STAGING_DIRECTORY_ATTEMPTS: usize = 64;
// SQL schemaのCHECK制約と同じ方式だけをcommand境界で受け付ける。
const SUPPORTED_MATCHING_TYPE_CODES: [&str; 4] = ["M000", "M001", "M002", "M003"];
static STAGING_DIRECTORY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn resolve_app_root() -> PathBuf {
    if let Some(install_dir) = get_install_location() {
        return PathBuf::from(install_dir);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            return parent.to_path_buf();
        }
    }
    let local = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| r"C:\ProgramData".to_string());
    PathBuf::from(local)
        .join("CosmoArtsStore")
        .join("Stargazer")
}

fn resolve_data_root() -> PathBuf {
    resolve_app_root().join("Data")
}

fn resolve_webview_data_root() -> PathBuf {
    resolve_app_root().join(CACHE_DIR).join(WEBVIEW_DATA_DIR)
}

fn cleanup_legacy_webview_data_root() {
    let legacy_path = resolve_data_root().join(WEBVIEW_DATA_DIR);
    if looks_like_webview_data_root(&legacy_path) {
        let _ = std::fs::remove_dir_all(legacy_path);
    }
}

fn looks_like_webview_data_root(path: &Path) -> bool {
    path.is_dir() && (path.join(WEBVIEW_DATA_DIR).is_dir() || path.join("Default").is_dir())
}

fn get_install_location() -> Option<String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey(r"Software\CosmoArtsStore\Stargazer")
        .ok()?;
    key.get_value::<String, _>("InstallLocation").ok()
}

// StellaRecord が所有する外部連携schema。登録処理だけで利用し、Stargazer内のDB設計とは共有しない。
const APPS_SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS apps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    description     TEXT NOT NULL DEFAULT '',
    path            TEXT NOT NULL,
    category        TEXT NOT NULL DEFAULT 'thirdparty' CHECK(category IN ('fastparty', 'thirdparty')),
    icon            BLOB,
    registered_at   DATETIME DEFAULT (datetime('now', 'localtime'))
);
";

// === イベント共有 DB ========================================================
// キャスト、NG、要注意者、設定は取込単位ではなくイベント全体で共有する。
// セッション DB と分離することで、再取込や取込セッション削除の影響をイベント共有データへ波及させない。
const SHARED_MIGRATION_V1: &str = r#"
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE casts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  group_name      TEXT,
  is_attend       INTEGER NOT NULL DEFAULT 1,
  photo_data_url  TEXT,
  memo            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE cast_urls (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  url     TEXT NOT NULL
);

CREATE TABLE cast_ng_entries (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id  INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  username TEXT,
  userid   TEXT
);

CREATE TABLE caution_users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  username          TEXT NOT NULL,
  account_id        TEXT NOT NULL,
  registration_type TEXT NOT NULL DEFAULT 'manual',
  reason            TEXT,
  notes             TEXT,
  ng_cast_count     INTEGER NOT NULL DEFAULT 0,
  registered_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(account_id)
);

CREATE TABLE event_cast_present (
  cast_id    INTEGER PRIMARY KEY REFERENCES casts(id) ON DELETE CASCADE,
  is_present INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE cast_attendance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id     INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 過去のCSV列割当を保持する既存DBとの互換のため、UIから到達しない場合も表と既存行を残す。
CREATE TABLE header_templates (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  signature         TEXT NOT NULL UNIQUE,
  label             TEXT,
  column_mapping    TEXT,
  matching_settings TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

const SHARED_MIGRATION_V2: &str = r#"
-- 公開済みversion番号との互換性を維持する。既存の登録種別は変更しない。
SELECT 1;
"#;

const SHARED_MIGRATION_V3: &str = r#"
-- casts.is_attendを現行の正にするが、旧Frontendとの互換性に必要な表は残す。
UPDATE casts
SET is_attend = COALESCE(
  (SELECT is_present FROM event_cast_present WHERE cast_id = casts.id),
  is_attend
);
"#;

const SHARED_MIGRATION_V4: &str = r#"
-- 公開済みversion番号との互換性を維持する。既存テンプレートは削除しない。
SELECT 1;
"#;

const SHARED_MIGRATION_V5: &str = r#"
-- 旧V3/V4で削除された互換表を再作成する。既存表と既存行は上書きしない。
CREATE TABLE IF NOT EXISTS event_cast_present (
  cast_id    INTEGER PRIMARY KEY REFERENCES casts(id) ON DELETE CASCADE,
  is_present INTEGER NOT NULL DEFAULT 1
);

-- V3で旧表から移した現行の正を使い、欠落した旧Frontend向けmirror行だけを補う。
INSERT OR IGNORE INTO event_cast_present (cast_id, is_present)
SELECT id, is_attend FROM casts;

CREATE TRIGGER IF NOT EXISTS sync_event_cast_present_after_cast_insert
AFTER INSERT ON casts
BEGIN
  INSERT OR REPLACE INTO event_cast_present (cast_id, is_present)
  VALUES (NEW.id, NEW.is_attend);
END;

CREATE TRIGGER IF NOT EXISTS sync_event_cast_present_after_cast_presence_update
AFTER UPDATE OF is_attend ON casts
BEGIN
  INSERT OR REPLACE INTO event_cast_present (cast_id, is_present)
  VALUES (NEW.id, NEW.is_attend);
END;

CREATE TABLE IF NOT EXISTS header_templates (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  signature         TEXT NOT NULL UNIQUE,
  label             TEXT,
  column_mapping    TEXT,
  matching_settings TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
"#;

const SHARED_MIGRATION_V6: &str = r#"
-- キャスト別NGの理由メモと、源氏名などの別名を既存行を保ったまま追加する。
ALTER TABLE cast_ng_entries ADD COLUMN notes TEXT;

CREATE TABLE cast_aliases (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  alias   TEXT NOT NULL,
  UNIQUE(cast_id, alias)
);

CREATE INDEX idx_cast_aliases_cast_id
  ON cast_aliases(cast_id, id);
"#;

const SHARED_MIGRATION_V7: &str = r#"
-- V5/V6適用済みDBにも、現行の正から欠損した旧Frontend向けmirror行だけを補う。
INSERT OR IGNORE INTO event_cast_present (cast_id, is_present)
SELECT id, is_attend FROM casts;
"#;

// WHY: V2〜V4は公開済みversion番号を維持しつつ、未適用DBへの破壊的変更を止める。
// すでに適用済みのDBは末尾のmigrationで不足schemaを補い、どのversionからでも同じschemaへ到達させる。
const SHARED_MIGRATIONS: &[(i32, &str)] = &[
    (1, SHARED_MIGRATION_V1),
    (2, SHARED_MIGRATION_V2),
    (3, SHARED_MIGRATION_V3),
    (4, SHARED_MIGRATION_V4),
    (5, SHARED_MIGRATION_V5),
    (6, SHARED_MIGRATION_V6),
    (7, SHARED_MIGRATION_V7),
];

// === 取込セッション DB ======================================================
// 応募者データの区切りとして、希望キャスト、追加列、抽選条件、抽選結果を同じDBに保持する。
// lottery_results は現在の抽選結果、lottery_saved_runs は利用者が名前を付けた抽選結果である。
//
// 最終マッチング結果は DB に保存せず、現在のアプリプロセスだけで保持する。
// 現行名簿にないキャスト参照は判定漏れの可能性を警告するが、操作は制限しない。再起動後の復元も行わない。
const SESSION_MIGRATION_V1: &str = r#"
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE applicants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  x_id          TEXT NOT NULL UNIQUE,
  name          TEXT,
  vrc_url       TEXT,
  is_guaranteed INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE applicant_casts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id     INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  preference_order INTEGER NOT NULL,
  cast_name        TEXT NOT NULL
);

CREATE TABLE applicant_extra (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  field_key    TEXT NOT NULL,
  field_value  TEXT
);

CREATE TABLE lottery_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id  INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  is_guaranteed INTEGER NOT NULL DEFAULT 0,
  drawn_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
"#;

const SESSION_MIGRATION_V2: &str = r#"
CREATE TABLE lottery_saved_runs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  label              TEXT NOT NULL,
  matching_type_code TEXT NOT NULL,
  lottery_count      INTEGER NOT NULL,
  guaranteed_count   INTEGER NOT NULL,
  winner_count       INTEGER NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE lottery_saved_run_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        INTEGER NOT NULL REFERENCES lottery_saved_runs(id) ON DELETE CASCADE,
  applicant_id  INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  is_guaranteed INTEGER NOT NULL DEFAULT 0,
  result_order  INTEGER NOT NULL,
  UNIQUE(run_id, applicant_id)
);

CREATE INDEX idx_lottery_saved_run_results_run_id
  ON lottery_saved_run_results(run_id, result_order);
"#;

const SESSION_MIGRATION_V3: &str = r#"
ALTER TABLE applicant_casts ADD COLUMN cast_id INTEGER NULL;

CREATE INDEX idx_applicant_casts_cast_id
  ON applicant_casts(cast_id);
"#;

const SESSION_MIGRATION_V4: &str = r#"
CREATE TABLE session_workflow_state (
  id                          INTEGER PRIMARY KEY CHECK (id = 1),
  matching_type_code          TEXT NOT NULL DEFAULT 'M001'
                                CHECK (matching_type_code IN ('M000', 'M001', 'M002', 'M003')),
  lottery_count               INTEGER NOT NULL DEFAULT 1 CHECK (lottery_count >= 1),
  rotation_count              INTEGER NOT NULL DEFAULT 2 CHECK (rotation_count >= 1),
  total_tables                INTEGER NOT NULL DEFAULT 15 CHECK (total_tables >= 1),
  users_per_table             INTEGER NOT NULL DEFAULT 1 CHECK (users_per_table >= 1),
  casts_per_rotation          INTEGER NOT NULL DEFAULT 1 CHECK (casts_per_rotation >= 1),
  allow_m003_empty_seats      INTEGER NOT NULL DEFAULT 0 CHECK (allow_m003_empty_seats IN (0, 1)),
  m003_same_day_slot_count    INTEGER NOT NULL DEFAULT 0 CHECK (m003_same_day_slot_count >= 0),
  condition_revision          INTEGER NOT NULL DEFAULT 0,
  lottery_result_revision     INTEGER
);

-- 旧DBの抽選結果には条件スナップショットがないため、移行直後は安全側に倒して未確定とする。
INSERT INTO session_workflow_state (id) VALUES (1);
"#;

const SESSION_MIGRATION_V5: &str = r#"
-- V4で一律に未確定とした旧抽選結果を、旧版と同じく現在の結果として復元する。
-- これは旧条件との一致を推測する処理ではなく、既存結果を現行扱いした旧版の外部挙動を維持する互換処理である。
-- 移行後に条件を変更したセッションはcondition_revisionが進むため対象外になる。
UPDATE session_workflow_state
SET lottery_result_revision = condition_revision
WHERE condition_revision = 0
  AND lottery_result_revision IS NULL
  AND EXISTS (SELECT 1 FROM lottery_results);
"#;

const SESSION_MIGRATION_V6: &str = r#"
-- V5適用済みDBにも、旧版で現行扱いだった抽選結果のrevisionだけを補う。
UPDATE session_workflow_state
SET lottery_result_revision = condition_revision
WHERE condition_revision = 0
  AND lottery_result_revision IS NULL
  AND EXISTS (SELECT 1 FROM lottery_results);
"#;

// 共有DBと同様に、公開済みversionは変更せず末尾へ追加する。
const SESSION_MIGRATIONS: &[(i32, &str)] = &[
    (1, SESSION_MIGRATION_V1),
    (2, SESSION_MIGRATION_V2),
    (3, SESSION_MIGRATION_V3),
    (4, SESSION_MIGRATION_V4),
    (5, SESSION_MIGRATION_V5),
    (6, SESSION_MIGRATION_V6),
];
const SESSION_CAST_ID_PROVENANCE_META_KEY: &str = "applicant_cast_ids_provenance_v1";
const SESSION_CAST_ID_PROVENANCE_NATIVE: &str = "native";
const SESSION_CAST_ID_PROVENANCE_LEGACY: &str = "legacy_name_only";
const OBSOLETE_SESSION_CAST_ID_BACKFILL_META_KEY: &str = "applicant_casts_cast_id_backfilled_v3";

/** 既存イベントを参照する際に使う名前検証。旧版で作成できた予約名も受け入れる。 */
fn validate_event_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("イベント名が空です".to_string());
    }
    if is_reserved_event_name(name) {
        return Err(format!("イベント名 '{name}' は予約されています"));
    }
    if name.len() > 64 {
        return Err("イベント名は64文字以下にしてください".to_string());
    }
    if name.trim() != name {
        return Err("イベント名の先頭・末尾に空白は使えません".to_string());
    }
    if name.contains('.') {
        return Err("イベント名にドットは使えません".to_string());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("イベント名にパス区切り文字は使えません".to_string());
    }
    for ch in name.chars() {
        let ok = ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == ' ';
        if !ok {
            return Err(format!(
                "イベント名に使用できない文字が含まれています: '{ch}'"
            ));
        }
    }
    Ok(())
}

fn is_reserved_event_name(name: &str) -> bool {
    [SHARED_DIR, WEBVIEW_DATA_DIR]
        .iter()
        .any(|reserved| name.eq_ignore_ascii_case(reserved))
}

fn is_event_directory_name(name: &str) -> bool {
    !name.starts_with('.') && validate_event_name(name).is_ok()
}

// timestampはパスの一部になるため、std::fsへ渡す前に14桁ASCII数字だけへ制限する。
// ".."や区切り文字を含む入力をここで拒否し、ディレクトリトラバーサルを防ぐ。
fn validate_timestamp(ts: &str) -> Result<(), String> {
    if ts.len() != 14 {
        return Err("タイムスタンプは14桁である必要があります".to_string());
    }
    if !ts.bytes().all(|b| b.is_ascii_digit()) {
        return Err("タイムスタンプは数字のみで構成されている必要があります".to_string());
    }
    Ok(())
}

fn supported_schema_version(
    conn: &rusqlite::Connection,
    migrations: &[(i32, &str)],
) -> rusqlite::Result<i32> {
    let current: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let latest = migrations.last().map(|(version, _)| *version).unwrap_or(0);
    if current > latest {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ERROR),
            Some(format!(
                "DB schema version {current} は、このアプリが対応するversion {latest} より新しいため開けません"
            )),
        ));
    }
    Ok(current)
}

fn apply_pending_migrations(
    conn: &mut rusqlite::Connection,
    migrations: &[(i32, &str)],
    current: i32,
) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;

    // versionごとに確定し、中断後も完了済みmigrationを再実行しない。
    for (version, sql) in migrations {
        if *version > current {
            let tx = conn.transaction()?;
            tx.execute_batch(sql)?;
            // PRAGMA user_versionはbind変数を受け付けないため、コード内の定数だけを埋め込む。
            tx.execute_batch(&format!("PRAGMA user_version = {version};"))?;
            tx.commit()?;
        }
    }

    Ok(())
}

fn validate_required_tables(
    conn: &rusqlite::Connection,
    database_name: &str,
    required_tables: &[&str],
) -> rusqlite::Result<()> {
    for table in required_tables {
        let exists = conn
            .query_row(
                "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?1",
                [table],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !exists {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_SCHEMA),
                Some(format!(
                    "{database_name}DBに必要なテーブル '{table}' がありません"
                )),
            ));
        }
    }
    Ok(())
}

fn validate_existing_database_family(
    conn: &rusqlite::Connection,
    database_name: &str,
    base_table: &str,
    current_version: i32,
) -> rusqlite::Result<()> {
    if current_version > 0 {
        validate_required_tables(conn, database_name, &[base_table])?;
    }
    Ok(())
}

fn migrate_database(
    conn: &mut rusqlite::Connection,
    migrations: &[(i32, &str)],
    database_name: &str,
    base_table: &str,
    required_tables: &[&str],
) -> rusqlite::Result<()> {
    let current = supported_schema_version(conn, migrations)?;
    validate_existing_database_family(conn, database_name, base_table, current)?;
    apply_pending_migrations(conn, migrations, current)?;
    validate_required_tables(conn, database_name, required_tables)
}

fn run_shared_migrations(conn: &mut rusqlite::Connection) -> rusqlite::Result<()> {
    migrate_database(
        conn,
        SHARED_MIGRATIONS,
        "イベント共有",
        "casts",
        &[
            "casts",
            "settings",
            "event_cast_present",
            "header_templates",
            "cast_aliases",
        ],
    )
}

fn run_session_migrations(conn: &mut rusqlite::Connection) -> rusqlite::Result<()> {
    migrate_database(
        conn,
        SESSION_MIGRATIONS,
        "取込セッション",
        "applicants",
        &["applicants", "session_workflow_state"],
    )
}

/**
 * 希望キャストIDの由来が記録されていないセッションを、名前だけの旧形式として固定する。
 *
 * WHY: 旧DBの名称だけでは、削除後に同名で再登録されたキャストとの同一性を証明できない。
 * 現在の名簿からIDを推測せず、過去の中間版が補完したIDも未解決へ戻して誤接続を防ぐ。
 */
fn normalize_session_cast_id_provenance(conn: &mut rusqlite::Connection) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    let provenance = tx
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            [SESSION_CAST_ID_PROVENANCE_META_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if provenance.as_deref() != Some(SESSION_CAST_ID_PROVENANCE_NATIVE) {
        tx.execute("UPDATE applicant_casts SET cast_id = NULL", [])?;
    }
    if provenance.as_deref() != Some(SESSION_CAST_ID_PROVENANCE_LEGACY)
        && provenance.as_deref() != Some(SESSION_CAST_ID_PROVENANCE_NATIVE)
    {
        tx.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![
                SESSION_CAST_ID_PROVENANCE_META_KEY,
                SESSION_CAST_ID_PROVENANCE_LEGACY
            ],
        )?;
    }
    tx.execute(
        "DELETE FROM meta WHERE key = ?1",
        [OBSOLETE_SESSION_CAST_ID_BACKFILL_META_KEY],
    )?;
    tx.commit()
}

/** 新規セッションでは、取込時に保存するIDを信頼できる値として扱う。 */
fn mark_session_cast_ids_native(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![
            SESSION_CAST_ID_PROVENANCE_META_KEY,
            SESSION_CAST_ID_PROVENANCE_NATIVE
        ],
    )
    .map(|_| ())
}

fn event_dir(event_name: &str) -> PathBuf {
    resolve_data_root().join(event_name)
}

fn event_shared_dir(event_name: &str) -> PathBuf {
    event_dir(event_name).join(SHARED_DIR)
}

fn event_shared_db_path(event_name: &str) -> PathBuf {
    event_shared_dir(event_name).join("db").join("stargazer.db")
}

fn session_dir(event_name: &str, timestamp: &str) -> PathBuf {
    event_dir(event_name).join(timestamp)
}

fn session_db_path(event_name: &str, timestamp: &str) -> PathBuf {
    session_dir(event_name, timestamp)
        .join("db")
        .join("stargazer.db")
}

fn open_and_migrate_connection(
    db_path: &Path,
    flags: rusqlite::OpenFlags,
    allow_uninitialized_schema: bool,
    run_migrations: fn(&mut rusqlite::Connection) -> rusqlite::Result<()>,
) -> Result<rusqlite::Connection, String> {
    let mut conn = rusqlite::Connection::open_with_flags(db_path, flags)
        .map_err(|e| format!("DBを開けませんでした: {e}"))?;
    conn.busy_timeout(SQLITE_BUSY_TIMEOUT)
        .map_err(|e| format!("DB待機設定に失敗しました: {e}"))?;
    let current_version: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| format!("DB schema versionを確認できませんでした: {e}"))?;
    // version 0からの初期化は新規作成commandだけに限定し、手動配置された任意のSQLiteを
    // Stargazer DBとして書き換えない。
    if !allow_uninitialized_schema && current_version == 0 {
        return Err("初期化済みのStargazer DBではありません".to_string());
    }
    run_migrations(&mut conn).map_err(|e| format!("マイグレーションに失敗しました: {e}"))?;
    Ok(conn)
}

fn create_migrated_connection(
    db_path: &Path,
    run_migrations: fn(&mut rusqlite::Connection) -> rusqlite::Result<()>,
) -> Result<rusqlite::Connection, String> {
    if db_path.exists() {
        return Err(format!("DBは既に存在します: {}", db_path.display()));
    }
    let db_dir = db_path
        .parent()
        .ok_or_else(|| "DBパスが不正です".to_string())?;
    std::fs::create_dir_all(db_dir).map_err(|e| format!("ディレクトリ作成に失敗しました: {e}"))?;
    open_and_migrate_connection(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_CREATE,
        true,
        run_migrations,
    )
}

fn create_staging_directory(final_dir: &Path) -> Result<PathBuf, String> {
    if final_dir
        .try_exists()
        .map_err(|e| format!("作成先を確認できませんでした: {e}"))?
    {
        return Err(format!("作成先は既に存在します: {}", final_dir.display()));
    }
    let parent = final_dir
        .parent()
        .ok_or_else(|| "作成先の親ディレクトリがありません".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("作成先の親ディレクトリを作成できませんでした: {e}"))?;
    let directory_name = final_dir
        .file_name()
        .ok_or_else(|| "作成先のディレクトリ名がありません".to_string())?
        .to_string_lossy();

    for _ in 0..MAX_STAGING_DIRECTORY_ATTEMPTS {
        let sequence = STAGING_DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let staging_dir = parent.join(format!(
            ".{directory_name}.creating-{}-{sequence}",
            std::process::id()
        ));
        match std::fs::create_dir(&staging_dir) {
            Ok(()) => return Ok(staging_dir),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "作成用の一時ディレクトリを作成できませんでした: {error}"
                ));
            }
        }
    }

    Err("重複しない作成用ディレクトリ名を確保できませんでした".to_string())
}

/**
 * 新しいDBを一時ディレクトリ内で最後まで初期化し、完成したディレクトリだけを公開する。
 *
 * WHY: 最終パスへ直接作成すると、migrationや追加初期化の失敗後に一覧へ現れる不完全な
 * イベント・セッションが残り、同名で再作成できなくなる。一時ディレクトリだけを失敗時の
 * 削除対象にすることで、既存データを巻き込まずに作成処理を原子的に扱える。
 */
fn create_migrated_directory_atomically<F>(
    final_dir: &Path,
    relative_db_path: &Path,
    run_migrations: fn(&mut rusqlite::Connection) -> rusqlite::Result<()>,
    initialize: F,
) -> Result<PathBuf, String>
where
    F: FnOnce(&mut rusqlite::Connection) -> Result<(), String>,
{
    let staging_dir = create_staging_directory(final_dir)?;
    let creation_result = (|| {
        let staging_db_path = staging_dir.join(relative_db_path);
        let mut conn = create_migrated_connection(&staging_db_path, run_migrations)?;
        initialize(&mut conn)?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| format!("DBの確定処理に失敗しました: {e}"))?;
        drop(conn);

        if final_dir
            .try_exists()
            .map_err(|e| format!("作成先を確認できませんでした: {e}"))?
        {
            return Err(format!("作成先は既に存在します: {}", final_dir.display()));
        }
        std::fs::rename(&staging_dir, final_dir)
            .map_err(|e| format!("完成したデータを配置できませんでした: {e}"))?;
        Ok(final_dir.join(relative_db_path))
    })();

    match creation_result {
        Ok(db_path) => Ok(db_path),
        Err(error) => match std::fs::remove_dir_all(&staging_dir) {
            Ok(()) => Err(error),
            Err(cleanup_error) if cleanup_error.kind() == std::io::ErrorKind::NotFound => {
                Err(error)
            }
            Err(cleanup_error) => Err(format!(
                "{error} 一時ディレクトリの削除にも失敗しました: {cleanup_error}"
            )),
        },
    }
}

fn open_existing_migrated_connection(
    db_path: &Path,
    run_migrations: fn(&mut rusqlite::Connection) -> rusqlite::Result<()>,
) -> Result<rusqlite::Connection, String> {
    if !db_path.is_file() {
        return Err(format!("DBが存在しません: {}", db_path.display()));
    }
    // READ_WRITEだけで開き、存在確認後に削除された場合も空DBを再作成しない。
    open_and_migrate_connection(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE,
        false,
        run_migrations,
    )
}

fn create_event_shared_db(event_name: &str) -> Result<(), String> {
    let relative_db_path = Path::new(SHARED_DIR).join("db").join("stargazer.db");
    create_migrated_directory_atomically(
        &event_dir(event_name),
        &relative_db_path,
        run_shared_migrations,
        |_| Ok(()),
    )
    .map(|_| ())
}

fn open_event_shared_db(event_name: &str) -> Result<(PathBuf, rusqlite::Connection), String> {
    let db_path = event_shared_db_path(event_name);
    let conn = if db_path.is_file() {
        open_existing_migrated_connection(&db_path, run_shared_migrations)?
    } else {
        // 既存版は有効なイベントディレクトリを一覧へ出し、初回open時に共有DBを作成する。
        create_migrated_connection(&db_path, run_shared_migrations)?
    };
    Ok((db_path, conn))
}

fn create_session_db(event_name: &str, timestamp: &str) -> Result<(), String> {
    let relative_db_path = Path::new("db").join("stargazer.db");
    create_migrated_directory_atomically(
        &session_dir(event_name, timestamp),
        &relative_db_path,
        run_session_migrations,
        |conn| {
            mark_session_cast_ids_native(conn)
                .map_err(|e| format!("希望キャストIDの初期化に失敗しました: {e}"))
        },
    )
    .map(|_| ())
}

fn open_session_db(
    event_name: &str,
    timestamp: &str,
) -> Result<(PathBuf, rusqlite::Connection), String> {
    let db_path = session_db_path(event_name, timestamp);
    let mut conn = if db_path.is_file() {
        open_existing_migrated_connection(&db_path, run_session_migrations)?
    } else {
        // 一覧に残る既存セッションディレクトリとの互換のため、初回open時にDBを作成する。
        let conn = create_migrated_connection(&db_path, run_session_migrations)?;
        mark_session_cast_ids_native(&conn)
            .map_err(|e| format!("希望キャストIDの初期化に失敗しました: {e}"))?;
        conn
    };
    normalize_session_cast_id_provenance(&mut conn)
        .map_err(|e| format!("希望キャストIDの互換状態を確定できませんでした: {e}"))?;
    Ok((db_path, conn))
}

fn path_to_sqlite_uri(path: &Path) -> String {
    format!("sqlite:{}", path.to_string_lossy().replace('\\', "/"))
}

fn now_local_timestamp() -> String {
    use chrono::Local;
    Local::now().format("%Y%m%d%H%M%S").to_string()
}

#[derive(Deserialize)]
struct RawExtraInput {
    key: String,
    value: Option<String>,
}

#[derive(Deserialize)]
struct ApplicantInput {
    name: Option<String>,
    x_id: String,
    vrc_url: Option<String>,
    casts: Vec<String>,
    cast_ids: Vec<Option<i64>>,
    preference_mode: Option<String>,
    is_guaranteed: bool,
    raw_extra: Vec<RawExtraInput>,
}

#[derive(Deserialize)]
struct SessionWorkflowStateInput {
    matching_type_code: String,
    lottery_count: i64,
    rotation_count: i64,
    total_tables: i64,
    users_per_table: i64,
    casts_per_rotation: i64,
    allow_m003_empty_seats: bool,
    m003_same_day_slot_count: i64,
}

#[derive(Deserialize)]
struct NgUserInput {
    username: Option<String>,
    #[serde(rename = "accountId")]
    account_id: Option<String>,
    notes: Option<String>,
}

#[derive(Deserialize)]
struct CastInput {
    name: String,
    is_present: bool,
    contact_urls: Vec<String>,
    ng_entries: Vec<NgUserInput>,
    #[serde(default)]
    aliases: Vec<String>,
    group_name: Option<String>,
    photo_data_url: Option<String>,
    memo: Option<String>,
}

/**
 * 部分更新では「変更しない」と「NULLまたは空配列へ更新する」を区別する必要がある。
 * update_* がfalseの項目は既存値を維持し、trueの項目だけ対応する値を適用する。
 */
#[derive(Deserialize)]
struct CastPatchInput {
    update_is_present: bool,
    is_present: bool,
    update_group_name: bool,
    group_name: Option<String>,
    update_photo_data_url: bool,
    photo_data_url: Option<String>,
    update_memo: bool,
    memo: Option<String>,
    update_contact_urls: bool,
    contact_urls: Vec<String>,
    update_ng_entries: bool,
    ng_entries: Vec<NgUserInput>,
    #[serde(default)]
    update_aliases: bool,
    #[serde(default)]
    aliases: Vec<String>,
}

/** metaの部分更新で「変更しない」とNULLへの更新を区別する。 */
#[derive(Deserialize)]
struct EventMetaPatchInput {
    update_notes: bool,
    notes: Option<String>,
    update_photo_data_url: bool,
    photo_data_url: Option<String>,
}

#[derive(Deserialize)]
struct LotteryResultInput {
    x_id: String,
    is_guaranteed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoredLotteryRunState {
    matching_type_code: String,
    lottery_count: i64,
}

/** SQLite エラーに、呼び出し元の操作名を付けたユーザー向けメッセージを作る。 */
fn sqlite_error(context: &str, error: rusqlite::Error) -> String {
    format!("{context}: {error}")
}

/** イベント共有 DB を、foreign key を有効化した書き込み用 connection として開く。 */
fn open_shared_write_connection(event_name: &str) -> Result<rusqlite::Connection, String> {
    validate_event_name(event_name)?;
    open_event_shared_db(event_name).map(|(_, conn)| conn)
}

/** 取込セッション DB を、foreign key を有効化した書き込み用 connection として開く。 */
fn open_session_write_connection(
    event_name: &str,
    timestamp: &str,
) -> Result<rusqlite::Connection, String> {
    validate_event_name(event_name)?;
    validate_timestamp(timestamp)?;
    open_session_db(event_name, timestamp).map(|(_, conn)| conn)
}

/** キャスト本体、別名、連絡先 URL、NG エントリを同じ transaction に挿入する。 */
fn insert_cast_in_transaction(
    tx: &rusqlite::Transaction<'_>,
    cast: &CastInput,
) -> rusqlite::Result<i64> {
    tx.execute(
        "INSERT INTO casts (name, group_name, is_attend, photo_data_url, memo)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            &cast.name,
            cast.group_name.as_deref(),
            if cast.is_present { 1 } else { 0 },
            cast.photo_data_url.as_deref(),
            cast.memo.as_deref()
        ],
    )?;
    let cast_id = tx.last_insert_rowid();
    for url in &cast.contact_urls {
        tx.execute(
            "INSERT INTO cast_urls (cast_id, url) VALUES (?1, ?2)",
            rusqlite::params![cast_id, url],
        )?;
    }
    for ng in &cast.ng_entries {
        tx.execute(
            "INSERT INTO cast_ng_entries (cast_id, username, userid, notes)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                cast_id,
                ng.username.as_deref(),
                ng.account_id.as_deref(),
                ng.notes.as_deref()
            ],
        )?;
    }
    for alias in &cast.aliases {
        tx.execute(
            "INSERT INTO cast_aliases (cast_id, alias) VALUES (?1, ?2)",
            rusqlite::params![cast_id, alias],
        )?;
    }
    Ok(cast_id)
}

fn validate_session_workflow_state(state: &SessionWorkflowStateInput) -> Result<(), String> {
    if !SUPPORTED_MATCHING_TYPE_CODES.contains(&state.matching_type_code.as_str()) {
        return Err("対応していないマッチング方式です".to_string());
    }
    if state.lottery_count < 1
        || state.rotation_count < 1
        || state.total_tables < 1
        || state.users_per_table < 1
        || state.casts_per_rotation < 1
        || state.m003_same_day_slot_count < 0
    {
        return Err("抽選・マッチング条件の数値が範囲外です".to_string());
    }
    Ok(())
}

/**
 * セッション条件を保存し、実際に条件が変わった場合だけ revision を進める。
 *
 * WHY: 抽選結果そのものと条件を二重保存して比較する代わりに、結果確定時の revision を保持する。
 * これにより条件変更後の抽選結果を、再起動後も確実に「古い結果」と判定できる。
 */
fn persist_session_workflow_state_in_connection(
    conn: &mut rusqlite::Connection,
    state: &SessionWorkflowStateInput,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE session_workflow_state
         SET condition_revision = condition_revision + CASE
               WHEN matching_type_code <> ?1
                 OR lottery_count <> ?2
                 OR rotation_count <> ?3
                 OR total_tables <> ?4
                 OR users_per_table <> ?5
                 OR casts_per_rotation <> ?6
                 OR allow_m003_empty_seats <> ?7
                 OR m003_same_day_slot_count <> ?8
               THEN 1 ELSE 0 END,
             matching_type_code = ?1,
             lottery_count = ?2,
             rotation_count = ?3,
             total_tables = ?4,
             users_per_table = ?5,
             casts_per_rotation = ?6,
             allow_m003_empty_seats = ?7,
             m003_same_day_slot_count = ?8
         WHERE id = 1",
        rusqlite::params![
            &state.matching_type_code,
            state.lottery_count,
            state.rotation_count,
            state.total_tables,
            state.users_per_table,
            state.casts_per_rotation,
            if state.allow_m003_empty_seats { 1 } else { 0 },
            state.m003_same_day_slot_count,
        ],
    )?;
    Ok(())
}

fn validate_unique_x_ids<'a>(
    x_ids: impl IntoIterator<Item = &'a str>,
    context: &str,
) -> rusqlite::Result<()> {
    let mut seen_x_ids = HashSet::new();
    for x_id in x_ids {
        let normalized = x_id.trim().to_lowercase();
        if normalized.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "{context}に空のxIDが含まれています"
            )));
        }
        if !seen_x_ids.insert(normalized) {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "{context}でxID '{x_id}' が重複しています"
            )));
        }
    }
    Ok(())
}

fn validate_applicant_inputs(users: &[ApplicantInput]) -> rusqlite::Result<()> {
    validate_unique_x_ids(users.iter().map(|user| user.x_id.as_str()), "応募者一覧")?;
    for user in users {
        if user.casts.len() != user.cast_ids.len() {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "応募者 '{}' の希望キャスト名とIDの件数が一致しません",
                user.x_id
            )));
        }
        if user
            .casts
            .iter()
            .zip(&user.cast_ids)
            .any(|(cast_name, cast_id)| cast_name.is_empty() && cast_id.is_some())
        {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "応募者 '{}' の空の希望キャストにIDが指定されています",
                user.x_id
            )));
        }
        if let Some(mode) = user.preference_mode.as_deref() {
            if !matches!(mode, "flat" | "ranked") {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "応募者 '{}' の希望方式が不正です",
                    user.x_id
                )));
            }
        }
        if user
            .raw_extra
            .iter()
            .any(|extra| extra.key == PREFERENCE_MODE_EXTRA_KEY)
        {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "応募者 '{}' の追加項目に予約キーが含まれています",
                user.x_id
            )));
        }
    }
    Ok(())
}

/** 応募者一覧と依存する保存済み抽選結果を、単一 SQLite transaction で全置換する。 */
fn persist_applicants_in_connection(
    conn: &mut rusqlite::Connection,
    users: &[ApplicantInput],
) -> rusqlite::Result<()> {
    // 入力全体を先に検証し、不正なpayloadで既存データの置換を開始しない。
    validate_applicant_inputs(users)?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM lottery_saved_runs", [])?;
    tx.execute("DELETE FROM applicants", [])?;
    // WHY: 応募者集合の全置換も抽選条件の変更である。revisionを進めないと、
    // 置換前に開始した抽選が同じxIDを含む新集合へ遅れて保存され、現行結果として復活する。
    tx.execute(
        "UPDATE session_workflow_state
         SET condition_revision = condition_revision + 1,
             lottery_result_revision = NULL
         WHERE id = 1",
        [],
    )?;
    for user in users {
        tx.execute(
            "INSERT INTO applicants (x_id, name, vrc_url, is_guaranteed)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                &user.x_id,
                user.name.as_deref(),
                user.vrc_url.as_deref(),
                if user.is_guaranteed { 1 } else { 0 }
            ],
        )?;
        let applicant_id = tx.last_insert_rowid();
        for (index, (cast_name, cast_id)) in user.casts.iter().zip(user.cast_ids.iter()).enumerate()
        {
            if cast_name.is_empty() {
                continue;
            }
            // NULL も取込時点の確定値であり、削除後に同名キャストへ自動接続しない。
            tx.execute(
                "INSERT INTO applicant_casts
                   (applicant_id, preference_order, cast_name, cast_id)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![applicant_id, index as i64, cast_name, cast_id],
            )?;
        }
        tx.execute(
            "INSERT INTO applicant_extra (applicant_id, field_key, field_value)
             VALUES (?1, ?2, ?3)",
            rusqlite::params![
                applicant_id,
                PREFERENCE_MODE_EXTRA_KEY,
                user.preference_mode.as_deref().unwrap_or("ranked")
            ],
        )?;
        for extra in &user.raw_extra {
            tx.execute(
                "INSERT INTO applicant_extra (applicant_id, field_key, field_value)
                 VALUES (?1, ?2, ?3)",
                rusqlite::params![applicant_id, &extra.key, extra.value.as_deref()],
            )?;
        }
    }
    mark_session_cast_ids_native(&tx)?;
    tx.commit()
}

/** 応募者1件を削除し、応募者集合に依存する抽選状態も同じtransactionで無効化する。 */
fn delete_applicant_in_connection(
    conn: &mut rusqlite::Connection,
    applicant_id: i64,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.query_row(
        "SELECT 1 FROM applicants WHERE id = ?1",
        [applicant_id],
        |row| row.get::<_, i64>(0),
    )?;
    tx.execute("DELETE FROM lottery_saved_runs", [])?;
    tx.execute("DELETE FROM lottery_results", [])?;
    tx.execute("DELETE FROM applicants WHERE id = ?1", [applicant_id])?;
    tx.execute(
        "UPDATE session_workflow_state
         SET condition_revision = condition_revision + 1,
             lottery_result_revision = NULL
         WHERE id = 1",
        [],
    )?;
    tx.commit()
}

/**
 * 抽選前に選択した確定当選者を応募者行へ保存し、条件revisionを更新する。
 * lottery_results.is_guaranteed は抽選実行時の結果スナップショットとして別に保持する。
 */
fn apply_applicant_guarantee_diff(
    tx: &rusqlite::Transaction<'_>,
    guaranteed_x_ids: &[String],
) -> rusqlite::Result<()> {
    validate_unique_x_ids(
        guaranteed_x_ids.iter().map(String::as_str),
        "確定当選者一覧",
    )?;
    let requested: HashSet<&str> = guaranteed_x_ids.iter().map(String::as_str).collect();
    let current = {
        let mut stmt = tx.prepare("SELECT x_id FROM applicants WHERE is_guaranteed = 1")?;
        let values = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<HashSet<_>>>()?;
        values
    };
    if current.len() == requested.len()
        && current.iter().all(|x_id| requested.contains(x_id.as_str()))
    {
        return Ok(());
    }

    tx.execute("UPDATE applicants SET is_guaranteed = 0", [])?;
    for x_id in requested {
        let updated = tx.execute(
            "UPDATE applicants SET is_guaranteed = 1 WHERE x_id = ?1",
            [x_id],
        )?;
        if updated != 1 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
    }
    tx.execute(
        "UPDATE session_workflow_state
         SET condition_revision = condition_revision + 1
         WHERE id = 1",
        [],
    )?;
    Ok(())
}

fn replace_applicant_guarantees_in_connection(
    conn: &mut rusqlite::Connection,
    guaranteed_x_ids: &[String],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    apply_applicant_guarantee_diff(&tx, guaranteed_x_ids)?;
    tx.commit()
}

/** キャスト1件と関連 URL/NG エントリを単一 transaction で追加し、安定 ID を返す。 */
fn insert_cast_in_connection(
    conn: &mut rusqlite::Connection,
    cast: &CastInput,
) -> rusqlite::Result<i64> {
    let tx = conn.transaction()?;
    let cast_id = insert_cast_in_transaction(&tx, cast)?;
    tx.commit()?;
    Ok(cast_id)
}

/** キャストの部分更新を、関連 URL/NG エントリの全置換と同じ transaction にまとめる。 */
fn update_cast_fields_in_connection(
    conn: &mut rusqlite::Connection,
    cast_id: i64,
    patch: &CastPatchInput,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.query_row("SELECT 1 FROM casts WHERE id = ?1", [cast_id], |row| {
        row.get::<_, i64>(0)
    })?;

    if patch.update_is_present {
        tx.execute(
            "UPDATE casts SET is_attend = ?1 WHERE id = ?2",
            rusqlite::params![if patch.is_present { 1 } else { 0 }, cast_id],
        )?;
    }
    if patch.update_group_name {
        tx.execute(
            "UPDATE casts SET group_name = ?1 WHERE id = ?2",
            rusqlite::params![patch.group_name.as_deref(), cast_id],
        )?;
    }
    if patch.update_photo_data_url {
        tx.execute(
            "UPDATE casts SET photo_data_url = ?1 WHERE id = ?2",
            rusqlite::params![patch.photo_data_url.as_deref(), cast_id],
        )?;
    }
    if patch.update_memo {
        tx.execute(
            "UPDATE casts SET memo = ?1 WHERE id = ?2",
            rusqlite::params![patch.memo.as_deref(), cast_id],
        )?;
    }

    if patch.update_contact_urls {
        tx.execute("DELETE FROM cast_urls WHERE cast_id = ?1", [cast_id])?;
        for url in &patch.contact_urls {
            tx.execute(
                "INSERT INTO cast_urls (cast_id, url) VALUES (?1, ?2)",
                rusqlite::params![cast_id, url],
            )?;
        }
    }
    if patch.update_ng_entries {
        tx.execute("DELETE FROM cast_ng_entries WHERE cast_id = ?1", [cast_id])?;
        for ng in &patch.ng_entries {
            tx.execute(
                "INSERT INTO cast_ng_entries (cast_id, username, userid, notes)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    cast_id,
                    ng.username.as_deref(),
                    ng.account_id.as_deref(),
                    ng.notes.as_deref()
                ],
            )?;
        }
    }
    if patch.update_aliases {
        tx.execute("DELETE FROM cast_aliases WHERE cast_id = ?1", [cast_id])?;
        for alias in &patch.aliases {
            tx.execute(
                "INSERT INTO cast_aliases (cast_id, alias) VALUES (?1, ?2)",
                rusqlite::params![cast_id, alias],
            )?;
        }
    }
    tx.commit()
}

/** キャスト名だけを更新し、関連データが参照する安定 ID を維持する。 */
fn rename_cast_in_connection(
    conn: &mut rusqlite::Connection,
    cast_id: i64,
    new_name: &str,
) -> rusqlite::Result<()> {
    let updated = conn.execute(
        "UPDATE casts SET name = ?1 WHERE id = ?2",
        rusqlite::params![new_name, cast_id],
    )?;
    if updated != 1 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

/** キャストを削除し、関連行は foreign key の ON DELETE CASCADE に委ねる。 */
fn delete_cast_in_connection(
    conn: &mut rusqlite::Connection,
    cast_id: i64,
) -> rusqlite::Result<()> {
    let deleted = conn.execute("DELETE FROM casts WHERE id = ?1", [cast_id])?;
    if deleted != 1 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

/** 指定日のキャスト出席記録を、既存行削除と新規挿入を含めて単一 transaction で保存する。 */
fn record_cast_attendance_in_connection(
    conn: &mut rusqlite::Connection,
    present_cast_ids: &[i64],
    recorded_at: &str,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare("SELECT 1 FROM casts WHERE id = ?1")?;
        for cast_id in present_cast_ids {
            stmt.query_row([cast_id], |row| row.get::<_, i64>(0))?;
        }
    }
    tx.execute(
        "DELETE FROM cast_attendance WHERE DATE(recorded_at) = DATE(?1)",
        [recorded_at],
    )?;
    {
        let mut stmt =
            tx.prepare("INSERT INTO cast_attendance (cast_id, recorded_at) VALUES (?1, ?2)")?;
        for cast_id in present_cast_ids {
            stmt.execute(rusqlite::params![cast_id, recorded_at])?;
        }
    }
    tx.commit()
}

fn validate_expected_condition_revision(
    tx: &rusqlite::Transaction<'_>,
    expected_condition_revision: i64,
) -> rusqlite::Result<()> {
    let condition_revision: i64 = tx.query_row(
        "SELECT condition_revision FROM session_workflow_state WHERE id = 1",
        [],
        |row| row.get(0),
    )?;
    if condition_revision != expected_condition_revision {
        return Err(rusqlite::Error::InvalidQuery);
    }
    Ok(())
}

fn validate_lottery_result_inputs(rows: &[LotteryResultInput]) -> rusqlite::Result<()> {
    validate_unique_x_ids(rows.iter().map(|row| row.x_id.as_str()), "抽選結果")
}

fn validate_stored_applicant_x_ids(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    let x_ids = {
        let mut stmt = conn.prepare("SELECT x_id FROM applicants ORDER BY id")?;
        let values = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    validate_unique_x_ids(x_ids.iter().map(String::as_str), "応募者一覧")
}

fn replace_lottery_rows_in_transaction(
    tx: &rusqlite::Transaction<'_>,
    rows: &[LotteryResultInput],
) -> rusqlite::Result<()> {
    // UIを迂回した呼出しでも、旧DBに残る不正なX IDを解消するまで抽選を確定させない。
    validate_stored_applicant_x_ids(tx)?;
    tx.execute("DELETE FROM lottery_results", [])?;
    for row in rows {
        let inserted = tx.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed)
             SELECT id, ?2 FROM applicants WHERE x_id = ?1",
            rusqlite::params![&row.x_id, if row.is_guaranteed { 1 } else { 0 }],
        )?;
        if inserted != 1 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "当選者 '{}' は現在の取込セッションに存在しません",
                row.x_id
            )));
        }
    }
    tx.execute(
        "UPDATE session_workflow_state
         SET lottery_result_revision = condition_revision
         WHERE id = 1",
        [],
    )?;
    Ok(())
}

/** 現在セッションの抽選結果を単一 transaction で全置換する。 */
fn replace_lottery_results_in_connection(
    conn: &mut rusqlite::Connection,
    rows: &[LotteryResultInput],
    expected_condition_revision: i64,
) -> rusqlite::Result<()> {
    validate_lottery_result_inputs(rows)?;
    let tx = conn.transaction()?;
    validate_expected_condition_revision(&tx, expected_condition_revision)?;
    replace_lottery_rows_in_transaction(&tx, rows)?;
    tx.commit()
}

/**
 * 保存済み結果の選択に伴う確定当選者と現行抽選結果を、一つの状態として置換する。
 *
 * WHY: 確定当選者の変更は条件revisionを進めるため、別transactionで結果を復元すると、
 * 途中失敗時に確定当選者だけが更新され、画面と抽選結果の対応が失われる。
 */
#[cfg(test)]
fn replace_lottery_state_in_connection(
    conn: &mut rusqlite::Connection,
    rows: &[LotteryResultInput],
    expected_condition_revision: i64,
) -> rusqlite::Result<()> {
    validate_lottery_result_inputs(rows)?;
    let guaranteed_x_ids = rows
        .iter()
        .filter(|row| row.is_guaranteed)
        .map(|row| row.x_id.clone())
        .collect::<Vec<_>>();
    let tx = conn.transaction()?;
    validate_expected_condition_revision(&tx, expected_condition_revision)?;
    apply_applicant_guarantee_diff(&tx, &guaranteed_x_ids)?;
    replace_lottery_rows_in_transaction(&tx, rows)?;
    tx.commit()
}

/**
 * 保存済み抽選の当選者と保存時の方式・抽選人数を、一つの状態として復元する。
 *
 * WHY: 条件と当選者を別々に保存すると、途中失敗時に条件だけが変わる。保存行の検証、
 * 条件revision、確定当選者、現行抽選結果を同じtransactionで確定する。
 */
fn restore_lottery_run_in_connection(
    conn: &mut rusqlite::Connection,
    run_id: i64,
    expected_condition_revision: i64,
) -> rusqlite::Result<RestoredLotteryRunState> {
    let tx = conn.transaction()?;
    validate_expected_condition_revision(&tx, expected_condition_revision)?;
    validate_stored_applicant_x_ids(&tx)?;

    let (matching_type_code, stored_lottery_count, guaranteed_count, winner_count): (
        String,
        i64,
        i64,
        i64,
    ) = tx.query_row(
        "SELECT matching_type_code, lottery_count, guaranteed_count, winner_count
         FROM lottery_saved_runs
         WHERE id = ?1",
        [run_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;
    if !SUPPORTED_MATCHING_TYPE_CODES.contains(&matching_type_code.as_str()) {
        return Err(rusqlite::Error::InvalidParameterName(
            "保存済み抽選の方式が現在のアプリに対応していません".to_string(),
        ));
    }

    let rows = {
        let mut stmt = tx.prepare(
            "SELECT a.x_id, r.is_guaranteed
             FROM lottery_saved_run_results r
             INNER JOIN applicants a ON a.id = r.applicant_id
             WHERE r.run_id = ?1
             ORDER BY r.result_order, r.id",
        )?;
        let values = stmt
            .query_map([run_id], |row| {
                Ok(LotteryResultInput {
                    x_id: row.get(0)?,
                    is_guaranteed: row.get::<_, i64>(1)? == 1,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    validate_lottery_result_inputs(&rows)?;
    let restored_guaranteed_count = rows.iter().filter(|row| row.is_guaranteed).count() as i64;
    let restored_lottery_count = rows.len() as i64 - restored_guaranteed_count;
    if rows.len() as i64 != winner_count
        || restored_guaranteed_count != guaranteed_count
        || restored_lottery_count != stored_lottery_count
    {
        return Err(rusqlite::Error::InvalidParameterName(
            "保存済み抽選の見出しと当選者データが一致しません".to_string(),
        ));
    }

    // 旧画面と同じく、抽選人数0件の保存データは画面下限の1件として復元する。
    let lottery_count = stored_lottery_count.max(1);
    tx.execute(
        "UPDATE session_workflow_state
         SET condition_revision = condition_revision + CASE
               WHEN matching_type_code <> ?1 OR lottery_count <> ?2
               THEN 1 ELSE 0 END,
             matching_type_code = ?1,
             lottery_count = ?2
         WHERE id = 1",
        rusqlite::params![&matching_type_code, lottery_count],
    )?;

    let guaranteed_x_ids = rows
        .iter()
        .filter(|row| row.is_guaranteed)
        .map(|row| row.x_id.clone())
        .collect::<Vec<_>>();
    apply_applicant_guarantee_diff(&tx, &guaranteed_x_ids)?;
    replace_lottery_rows_in_transaction(&tx, &rows)?;
    tx.commit()?;

    Ok(RestoredLotteryRunState {
        matching_type_code,
        lottery_count,
    })
}

/**
 * 抽選結果スナップショットを、見出し行と当選者行を単一 transaction で保存する。
 *
 * WHY: 方式・人数・当選者を同じDBの現行結果から導出し、画面との二重管理や
 * 条件変更と保存の競合による不整合を防ぐ。
 */
fn save_lottery_run_in_connection(
    conn: &mut rusqlite::Connection,
    label: &str,
) -> rusqlite::Result<i64> {
    if label.trim().is_empty() {
        return Err(rusqlite::Error::InvalidParameterName(
            "保存名を空にはできません".to_string(),
        ));
    }
    let tx = conn.transaction()?;
    validate_stored_applicant_x_ids(&tx)?;
    let (matching_type_code, condition_revision, result_revision): (String, i64, Option<i64>) = tx
        .query_row(
            "SELECT matching_type_code, condition_revision, lottery_result_revision
         FROM session_workflow_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
    if result_revision != Some(condition_revision) {
        return Err(rusqlite::Error::InvalidParameterName(
            "現在の条件で確定した抽選結果がないため保存できません".to_string(),
        ));
    }
    let (winner_count, guaranteed_count): (i64, i64) = tx.query_row(
        "SELECT COUNT(*),
                COALESCE(SUM(CASE WHEN is_guaranteed = 1 THEN 1 ELSE 0 END), 0)
         FROM lottery_results",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if winner_count == 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "保存できる抽選結果がありません".to_string(),
        ));
    }
    let lottery_count = winner_count - guaranteed_count;
    tx.execute(
        "INSERT INTO lottery_saved_runs
           (label, matching_type_code, lottery_count, guaranteed_count, winner_count)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            label,
            matching_type_code,
            lottery_count,
            guaranteed_count,
            winner_count
        ],
    )?;
    let run_id = tx.last_insert_rowid();
    let copied = tx.execute(
        "INSERT INTO lottery_saved_run_results
           (run_id, applicant_id, is_guaranteed, result_order)
         SELECT ?1, applicant_id,
                CASE WHEN is_guaranteed = 1 THEN 1 ELSE 0 END,
                id
         FROM lottery_results",
        [run_id],
    )?;
    if copied as i64 != winner_count {
        return Err(rusqlite::Error::ExecuteReturnedResults);
    }
    tx.commit()?;
    Ok(run_id)
}

#[tauri::command]
fn list_events() -> Result<Vec<String>, String> {
    list_event_names_at(&resolve_data_root())
        .map_err(|e| format!("イベント一覧を読み込めませんでした: {e}"))
}

fn list_event_names_at(root: &Path) -> std::io::Result<Vec<String>> {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };

    let mut names = Vec::new();
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if is_event_directory_name(&name) {
            names.push(name);
        }
    }

    names.sort();
    Ok(names)
}

#[cfg(test)]
fn list_events_at(root: &Path) -> Vec<String> {
    list_event_names_at(root).unwrap_or_default()
}

#[tauri::command]
fn get_event_shared_db_uri(event_name: String) -> Result<String, String> {
    validate_event_name(&event_name)?;
    let (db_path, _) = open_event_shared_db(&event_name)?;
    Ok(path_to_sqlite_uri(&db_path))
}

#[tauri::command]
fn list_sessions(event_name: String) -> Result<Vec<String>, String> {
    validate_event_name(&event_name)?;
    list_session_names_at(&event_dir(&event_name))
        .map_err(|e| format!("応募データ一覧を読み込めませんでした: {e}"))
}

fn list_session_names_at(dir: &Path) -> std::io::Result<Vec<String>> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };

    let mut sessions = Vec::new();
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let Ok(timestamp) = entry.file_name().into_string() else {
            continue;
        };
        if validate_timestamp(&timestamp).is_ok() {
            sessions.push(timestamp);
        }
    }

    // 最新の取込を既定対象にできるよう、新しいセッションから返す。
    sessions.sort_by(|a, b| b.cmp(a));
    Ok(sessions)
}

#[cfg(test)]
fn list_sessions_at(dir: &Path) -> Vec<String> {
    list_session_names_at(dir).unwrap_or_default()
}

#[tauri::command]
fn create_session(event_name: String) -> Result<String, String> {
    validate_event_name(&event_name)?;
    if !event_dir(&event_name).exists() {
        return Err(format!("イベント '{event_name}' が存在しません"));
    }

    let timestamp = now_local_timestamp();
    // 生成書式を将来変更してもパス検証を迂回しないよう、公開APIと同じ検証を通す。
    validate_timestamp(&timestamp)?;

    create_session_db(&event_name, &timestamp)?;
    Ok(timestamp)
}

#[tauri::command]
fn get_session_db_uri(event_name: String, timestamp: String) -> Result<String, String> {
    validate_event_name(&event_name)?;
    validate_timestamp(&timestamp)?;
    let (db_path, _) = open_session_db(&event_name, &timestamp)?;
    Ok(path_to_sqlite_uri(&db_path))
}

/** 応募者一覧の全置換を Rust 側の単一 SQLite transaction で実行する。 */
#[tauri::command]
fn persist_applicants_atomic(
    event_name: String,
    timestamp: String,
    users: Vec<ApplicantInput>,
) -> Result<(), String> {
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    persist_applicants_in_connection(&mut conn, &users)
        .map_err(|e| sqlite_error("応募者一覧の保存に失敗しました", e))
}

/** 応募者1件を安定IDで削除し、残りの応募者は置換しない。 */
#[tauri::command]
fn delete_applicant_atomic(
    event_name: String,
    timestamp: String,
    applicant_id: i64,
) -> Result<(), String> {
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    delete_applicant_in_connection(&mut conn, applicant_id)
        .map_err(|e| sqlite_error("応募者の削除に失敗しました", e))
}

/** 現在セッションの抽選・マッチング条件を保存する。 */
#[tauri::command]
fn persist_session_workflow_state_atomic(
    event_name: String,
    timestamp: String,
    state: SessionWorkflowStateInput,
) -> Result<(), String> {
    validate_session_workflow_state(&state)?;
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    persist_session_workflow_state_in_connection(&mut conn, &state)
        .map_err(|e| sqlite_error("抽選・マッチング条件の保存に失敗しました", e))
}

/** 現在セッションの確定当選者選択を保存する。 */
#[tauri::command]
fn replace_applicant_guarantees_atomic(
    event_name: String,
    timestamp: String,
    guaranteed_x_ids: Vec<String>,
) -> Result<(), String> {
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    replace_applicant_guarantees_in_connection(&mut conn, &guaranteed_x_ids)
        .map_err(|e| sqlite_error("確定当選者の保存に失敗しました", e))
}

/** キャスト追加を Rust 側の単一 SQLite transaction で実行し、作成 ID を返す。 */
#[tauri::command]
fn insert_cast_atomic(event_name: String, cast: CastInput) -> Result<i64, String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    insert_cast_in_connection(&mut conn, &cast)
        .map_err(|e| sqlite_error("キャスト追加に失敗しました", e))
}

/** キャスト部分更新を Rust 側の単一 SQLite transaction で実行する。 */
#[tauri::command]
fn update_cast_fields_atomic(
    event_name: String,
    cast_id: i64,
    patch: CastPatchInput,
) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    update_cast_fields_in_connection(&mut conn, cast_id, &patch)
        .map_err(|e| sqlite_error("キャスト更新に失敗しました", e))
}

/** 全キャストの出席状態を単一SQLで更新する。 */
#[tauri::command]
fn set_all_cast_presence_atomic(event_name: String, is_present: bool) -> Result<(), String> {
    let conn = open_shared_write_connection(&event_name)?;
    conn.execute(
        "UPDATE casts SET is_attend = ?1",
        [if is_present { 1 } else { 0 }],
    )
    .map(|_| ())
    .map_err(|e| sqlite_error("キャスト出席状態の一括更新に失敗しました", e))
}

/** キャスト名変更を Rust 側で実行する。 */
#[tauri::command]
fn rename_cast_atomic(event_name: String, cast_id: i64, new_name: String) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    rename_cast_in_connection(&mut conn, cast_id, &new_name)
        .map_err(|e| sqlite_error("キャスト名変更に失敗しました", e))
}

/** キャスト削除を Rust 側の単一 SQLite transaction で実行する。 */
#[tauri::command]
fn delete_cast_atomic(event_name: String, cast_id: i64) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    delete_cast_in_connection(&mut conn, cast_id)
        .map_err(|e| sqlite_error("キャスト削除に失敗しました", e))
}

/** 指定日のキャスト出席記録を Rust 側の単一 SQLite transaction で保存する。 */
#[tauri::command]
fn record_cast_attendance_atomic(
    event_name: String,
    present_cast_ids: Vec<i64>,
    recorded_at: String,
) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    record_cast_attendance_in_connection(&mut conn, &present_cast_ids, &recorded_at)
        .map_err(|e| sqlite_error("キャスト出席記録の保存に失敗しました", e))
}

/** イベント写真と説明メモの指定項目を単一transactionで保存する。 */
#[tauri::command]
fn set_event_meta_atomic(event_name: String, patch: EventMetaPatchInput) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    let tx = conn
        .transaction()
        .map_err(|e| sqlite_error("イベント情報の保存を開始できませんでした", e))?;
    if patch.update_notes {
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('notes', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [patch.notes.as_deref()],
        )
        .map_err(|e| sqlite_error("イベント説明メモの保存に失敗しました", e))?;
    }
    if patch.update_photo_data_url {
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('photo_data_url', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [patch.photo_data_url.as_deref()],
        )
        .map_err(|e| sqlite_error("イベント写真の保存に失敗しました", e))?;
    }
    tx.commit()
        .map_err(|e| sqlite_error("イベント情報の保存を確定できませんでした", e))
}

/** 現在セッションの抽選結果全置換を Rust 側の単一 SQLite transaction で実行する。 */
#[tauri::command]
fn replace_lottery_results_atomic(
    event_name: String,
    timestamp: String,
    rows: Vec<LotteryResultInput>,
    expected_condition_revision: i64,
) -> Result<(), String> {
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    replace_lottery_results_in_connection(&mut conn, &rows, expected_condition_revision)
        .map_err(|e| sqlite_error("抽選結果の保存に失敗しました", e))
}

/** 保存済み抽選結果を Rust 側の単一 SQLite transaction で保存し、作成 ID を返す。 */
#[tauri::command]
fn save_lottery_run_atomic(
    event_name: String,
    timestamp: String,
    label: String,
) -> Result<i64, String> {
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    save_lottery_run_in_connection(&mut conn, &label)
        .map_err(|e| sqlite_error("保存済み抽選結果の保存に失敗しました", e))
}

/** 保存済み抽選の条件と当選者を単一 SQLite transaction で復元する。 */
#[tauri::command]
fn restore_lottery_run_atomic(
    event_name: String,
    timestamp: String,
    run_id: i64,
    expected_condition_revision: i64,
) -> Result<RestoredLotteryRunState, String> {
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    restore_lottery_run_in_connection(&mut conn, run_id, expected_condition_revision)
        .map_err(|e| sqlite_error("保存済み抽選結果の復元に失敗しました", e))
}

#[tauri::command]
fn create_event(event_name: String) -> Result<(), String> {
    validate_event_name(&event_name)?;
    // イベント作成時は共有DBだけを作る。取込セッションはCSV取込時に明示的に作成する。
    create_event_shared_db(&event_name)
}

#[tauri::command]
fn delete_event(event_name: String) -> Result<(), String> {
    validate_event_name(&event_name)?;
    let dir = event_dir(&event_name);
    if !dir.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&dir).map_err(|e| format!("削除に失敗しました: {e}"))
}

#[tauri::command]
fn rename_event(old_name: String, new_name: String) -> Result<(), String> {
    validate_event_name(&old_name)?;
    if old_name == new_name {
        return Ok(());
    }
    validate_event_name(&new_name)?;
    let old_dir = event_dir(&old_name);
    let new_dir = event_dir(&new_name);
    if !old_dir.exists() {
        return Err(format!("イベント '{old_name}' が存在しません"));
    }
    if new_dir.exists() {
        return Err(format!("イベント '{new_name}' は既に存在します"));
    }
    std::fs::rename(&old_dir, &new_dir).map_err(|e| format!("リネームに失敗しました: {e}"))
}

fn get_stellarecord_db_path() -> Option<String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey(r"Software\CosmoArtsStore\StellaRecord")
        .ok()?;
    key.get_value::<String, _>("DbPath").ok()
}

#[tauri::command]
fn check_stellarecord_available() -> bool {
    get_stellarecord_db_path().is_some_and(|path| Path::new(&path).exists())
}

#[tauri::command]
fn register_to_stellarecord(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let db_path = get_stellarecord_db_path()
        .ok_or_else(|| "StellaRecord がインストールされていません".to_string())?;

    let conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("DB を開けませんでした: {e}"))?;
    conn.execute_batch(APPS_SCHEMA)
        .map_err(|e| format!("テーブル作成に失敗しました: {e}"))?;

    let exe_path =
        std::env::current_exe().map_err(|e| format!("実行パスを取得できませんでした: {e}"))?;

    let icon_data: Option<Vec<u8>> = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("icons").join("128x128.png"))
        .and_then(|path| std::fs::read(&path).ok());

    conn.execute(
        "INSERT OR REPLACE INTO apps (name, description, path, category, icon)
         VALUES (?1, ?2, ?3, 'fastparty', ?4)",
        rusqlite::params![
            "Stargazer",
            "イベント抽選・キャストマッチング用デスクトップアプリ",
            exe_path.to_string_lossy().to_string(),
            icon_data,
        ],
    )
    .map_err(|e| format!("登録に失敗しました: {e}"))?;

    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("https://") {
        return Err("https:// のURLのみ開けます".to_string());
    }
    open_url_with_system(trimmed)
}

#[cfg(target_os = "windows")]
fn open_url_with_system(url: &str) -> Result<(), String> {
    Command::new("rundll32")
        .arg("url.dll,FileProtocolHandler")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("外部ブラウザの起動に失敗しました: {e}"))
}

#[cfg(target_os = "macos")]
fn open_url_with_system(url: &str) -> Result<(), String> {
    Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("外部ブラウザの起動に失敗しました: {e}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_url_with_system(url: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("外部ブラウザの起動に失敗しました: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    cleanup_legacy_webview_data_root();
    let webview_data_dir = resolve_webview_data_root();
    // 事前作成に失敗してもWebView側の作成可否へ委ね、アプリ起動を継続する。
    let _ = std::fs::create_dir_all(&webview_data_dir);
    std::env::set_var(
        "WEBVIEW2_USER_DATA_FOLDER",
        webview_data_dir.to_string_lossy().to_string(),
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            register_to_stellarecord,
            check_stellarecord_available,
            list_events,
            get_event_shared_db_uri,
            list_sessions,
            create_session,
            get_session_db_uri,
            persist_applicants_atomic,
            delete_applicant_atomic,
            persist_session_workflow_state_atomic,
            replace_applicant_guarantees_atomic,
            insert_cast_atomic,
            update_cast_fields_atomic,
            set_all_cast_presence_atomic,
            rename_cast_atomic,
            delete_cast_atomic,
            record_cast_attendance_atomic,
            set_event_meta_atomic,
            replace_lottery_results_atomic,
            save_lottery_run_atomic,
            restore_lottery_run_atomic,
            create_event,
            delete_event,
            rename_event,
            open_external_url,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir(PathBuf);

    impl TestDir {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("システム時刻がUNIX_EPOCHより前になっています")
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("stargazer-{name}-{}-{nanos}", std::process::id()));
            std::fs::create_dir_all(&path).expect("テスト用ディレクトリを作成できません");
            Self(path)
        }

        fn db_path(&self, file_name: &str) -> PathBuf {
            self.0.join(file_name)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn open_migrated_shared_db(path: &Path) -> rusqlite::Result<Connection> {
        let mut conn = Connection::open(path)?;
        run_shared_migrations(&mut conn)?;
        Ok(conn)
    }

    fn open_migrated_session_db(path: &Path) -> rusqlite::Result<Connection> {
        let mut conn = Connection::open(path)?;
        run_session_migrations(&mut conn)?;
        Ok(conn)
    }

    fn apply_migrations(
        conn: &mut rusqlite::Connection,
        migrations: &[(i32, &str)],
    ) -> rusqlite::Result<()> {
        let current = supported_schema_version(conn, migrations)?;
        apply_pending_migrations(conn, migrations, current)
    }

    fn cast_input(name: &str) -> CastInput {
        CastInput {
            name: name.to_string(),
            is_present: true,
            contact_urls: vec![],
            ng_entries: vec![],
            aliases: vec![],
            group_name: None,
            photo_data_url: None,
            memo: None,
        }
    }

    fn applicant_input(x_id: &str) -> ApplicantInput {
        ApplicantInput {
            name: None,
            x_id: x_id.to_string(),
            vrc_url: None,
            casts: vec![],
            cast_ids: vec![],
            preference_mode: Some("ranked".to_string()),
            is_guaranteed: false,
            raw_extra: vec![],
        }
    }

    fn cast_patch_input() -> CastPatchInput {
        CastPatchInput {
            update_is_present: true,
            is_present: false,
            update_group_name: true,
            group_name: None,
            update_photo_data_url: false,
            photo_data_url: None,
            update_memo: true,
            memo: Some("updated".to_string()),
            update_contact_urls: true,
            contact_urls: vec!["https://example.test/new".to_string()],
            update_ng_entries: true,
            ng_entries: vec![NgUserInput {
                username: None,
                account_id: Some("@new".to_string()),
                notes: Some("NG理由".to_string()),
            }],
            update_aliases: true,
            aliases: vec!["別名A".to_string(), "別名B".to_string()],
        }
    }

    #[test]
    fn reserved_system_directory_names_are_rejected_as_event_names() {
        for name in [SHARED_DIR, "SHARED", WEBVIEW_DATA_DIR, "ebwebview"] {
            assert!(
                validate_event_name(name).is_err(),
                "{name} は予約名として拒否される必要があります"
            );
            assert!(
                !is_event_directory_name(name),
                "{name} はイベント一覧に表示されない必要があります"
            );
        }
        for name in ["db", "LOGS", "archive"] {
            assert!(validate_event_name(name).is_ok());
            assert!(is_event_directory_name(name));
        }
    }

    #[test]
    fn event_directory_filter_accepts_visible_event_names_only() {
        assert!(is_event_directory_name("Manual Test Event"));
        assert!(is_event_directory_name("Event_2026-06"));
        assert!(!is_event_directory_name(".system"));
        assert!(!is_event_directory_name("Event.Name"));
        assert!(!is_event_directory_name(" Event"));
    }

    #[test]
    fn missing_database_open_does_not_create_files() {
        let dir = TestDir::new("open-existing-database");
        let db_path = dir.0.join("missing").join("shared.db");

        assert!(open_existing_migrated_connection(&db_path, run_shared_migrations).is_err());
        assert!(!db_path.exists());
        assert!(!db_path
            .parent()
            .expect("DB親ディレクトリが必要です")
            .exists());

        let conn = create_migrated_connection(&db_path, run_shared_migrations)
            .expect("新規作成APIではDBを作成できる必要があります");
        drop(conn);
        assert!(db_path.is_file());
        assert!(create_migrated_connection(&db_path, run_shared_migrations).is_err());
    }

    #[test]
    fn uninitialized_existing_sqlite_is_not_claimed_as_stargazer_database() -> rusqlite::Result<()>
    {
        let dir = TestDir::new("uninitialized-existing-database");
        let db_path = dir.db_path("uninitialized.db");
        drop(Connection::open(&db_path)?);

        assert!(open_existing_migrated_connection(&db_path, run_shared_migrations).is_err());
        let conn = Connection::open(&db_path)?;
        let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let table_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(version, 0);
        assert_eq!(table_count, 0);
        Ok(())
    }

    #[test]
    fn failed_atomic_database_creation_leaves_no_visible_directory() {
        let dir = TestDir::new("atomic-create-failure");
        let final_dir = dir.0.join("Failed Event");
        let relative_db_path = Path::new(SHARED_DIR).join("db").join("stargazer.db");

        let result = create_migrated_directory_atomically(
            &final_dir,
            &relative_db_path,
            run_shared_migrations,
            |_| Err("失敗注入".to_string()),
        );

        assert!(result.is_err());
        assert!(!final_dir.exists());
        let remaining_names = std::fs::read_dir(&dir.0)
            .expect("テスト用ディレクトリを読み込める必要があります")
            .map(|entry| {
                entry
                    .expect("テスト用エントリを読み込める必要があります")
                    .file_name()
            })
            .collect::<Vec<_>>();
        assert!(remaining_names.is_empty());
    }

    #[test]
    fn atomic_event_creation_publishes_only_completed_database() {
        let dir = TestDir::new("atomic-create-success");
        let final_dir = dir.0.join("Completed Event");
        let relative_db_path = Path::new(SHARED_DIR).join("db").join("stargazer.db");

        let db_path = create_migrated_directory_atomically(
            &final_dir,
            &relative_db_path,
            run_shared_migrations,
            |_| Ok(()),
        )
        .expect("イベントDBを作成できる必要があります");

        assert_eq!(db_path, final_dir.join(relative_db_path));
        assert_eq!(list_events_at(&dir.0), vec!["Completed Event".to_string()]);
    }

    #[test]
    fn database_family_mismatch_is_rejected() -> rusqlite::Result<()> {
        let dir = TestDir::new("database-family");
        let session_path = dir.db_path("session.db");
        drop(open_migrated_session_db(&session_path)?);

        assert!(open_existing_migrated_connection(&session_path, run_shared_migrations).is_err());
        assert!(session_path.is_file());
        Ok(())
    }

    #[test]
    fn old_database_family_mismatch_is_rejected_before_migration() -> rusqlite::Result<()> {
        let dir = TestDir::new("old-database-family");
        let shared_path = dir.db_path("shared-v1.db");
        let mut conn = Connection::open(&shared_path)?;
        conn.execute_batch(SHARED_MIGRATION_V1)?;
        conn.execute_batch("PRAGMA user_version = 1;")?;

        assert!(run_session_migrations(&mut conn).is_err());
        let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let session_table_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_schema
             WHERE type = 'table' AND name IN ('applicants', 'session_workflow_state')",
            [],
            |row| row.get(0),
        )?;

        assert_eq!(version, 1);
        assert_eq!(session_table_count, 0);
        Ok(())
    }

    #[test]
    fn session_list_contains_valid_timestamp_directories() {
        let dir = TestDir::new("session-list");
        let missing_root = dir.0.join("missing");
        assert_eq!(list_sessions_at(&missing_root), Vec::<String>::new());

        let older = dir.0.join("20260724120000").join("db").join("stargazer.db");
        let newer = dir.0.join("20260725120000").join("db").join("stargazer.db");
        for path in [&older, &newer] {
            std::fs::create_dir_all(path.parent().expect("DB親ディレクトリが必要です"))
                .expect("テスト用DBディレクトリを作成できません");
            std::fs::write(path, []).expect("テスト用DBファイルを作成できません");
        }
        std::fs::create_dir_all(dir.0.join("20260723120000"))
            .expect("未完了セッション相当のディレクトリを作成できません");

        assert_eq!(
            list_sessions_at(&dir.0),
            vec![
                "20260725120000".to_string(),
                "20260724120000".to_string(),
                "20260723120000".to_string(),
            ]
        );
    }

    #[test]
    fn same_cast_name_does_not_share_attendance_between_event_dbs() -> rusqlite::Result<()> {
        let dir = TestDir::new("event-attendance-isolation");
        let source = open_migrated_shared_db(&dir.db_path("source.db"))?;
        let target = open_migrated_shared_db(&dir.db_path("target.db"))?;
        let cast_name = "同名キャスト";

        source.execute("INSERT INTO casts (name) VALUES (?1)", [cast_name])?;
        let source_cast_id = source.last_insert_rowid();
        source.execute(
            "INSERT INTO cast_attendance (cast_id, recorded_at) VALUES (?1, '2026-06-16')",
            [source_cast_id],
        )?;
        target.execute("INSERT INTO casts (name) VALUES (?1)", [cast_name])?;

        let source_attendance_count: i64 = source.query_row(
            "SELECT COUNT(*)
             FROM cast_attendance ca
             JOIN casts c ON c.id = ca.cast_id
             WHERE c.name = ?1",
            [cast_name],
            |row| row.get(0),
        )?;
        let target_attendance_count: i64 = target.query_row(
            "SELECT COUNT(*)
             FROM cast_attendance ca
             JOIN casts c ON c.id = ca.cast_id
             WHERE c.name = ?1",
            [cast_name],
            |row| row.get(0),
        )?;

        assert_eq!(source_attendance_count, 1);
        assert_eq!(target_attendance_count, 0);
        Ok(())
    }

    #[test]
    fn newer_schema_version_is_rejected_without_downgrade() -> rusqlite::Result<()> {
        let mut conn = Connection::open_in_memory()?;
        let supported_version = SHARED_MIGRATIONS
            .last()
            .map(|(version, _)| *version)
            .expect("共有DBにはmigrationが必要です");
        let future_version = supported_version + 1;
        conn.pragma_update(None, "user_version", future_version)?;

        let error =
            run_shared_migrations(&mut conn).expect_err("対応外の新しいschemaを開いてはいけません");
        let unchanged_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

        assert!(error.to_string().contains("より新しい"));
        assert_eq!(unchanged_version, future_version);
        Ok(())
    }

    #[test]
    fn shared_migration_v2_keeps_legacy_caution_metadata() -> rusqlite::Result<()> {
        let dir = TestDir::new("shared-migration-v2");
        let mut conn = Connection::open(dir.db_path("shared.db"))?;
        apply_migrations(&mut conn, &SHARED_MIGRATIONS[..1])?;
        conn.execute(
            "INSERT INTO caution_users
               (username, account_id, registration_type, reason, notes, ng_cast_count)
             VALUES ('Legacy User', '@legacy', 'auto', '理由', 'メモ', 3)",
            [],
        )?;

        run_shared_migrations(&mut conn)?;

        let metadata: (String, String, String, i64) = conn.query_row(
            "SELECT registration_type, reason, notes, ng_cast_count
             FROM caution_users WHERE account_id = '@legacy'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        assert_eq!(
            metadata,
            (
                "auto".to_string(),
                "理由".to_string(),
                "メモ".to_string(),
                3
            )
        );
        Ok(())
    }

    #[test]
    fn shared_migration_v3_keeps_legacy_cast_presence_compatible() -> rusqlite::Result<()> {
        let dir = TestDir::new("shared-migration-v3");
        let mut conn = Connection::open(dir.db_path("shared.db"))?;
        apply_migrations(&mut conn, &SHARED_MIGRATIONS[..2])?;
        conn.execute(
            "INSERT INTO casts (name, is_attend) VALUES ('Legacy Cast', 1)",
            [],
        )?;
        conn.execute(
            "INSERT INTO event_cast_present (cast_id, is_present) VALUES (1, 0)",
            [],
        )?;

        run_shared_migrations(&mut conn)?;

        let is_attend: i64 = conn.query_row(
            "SELECT is_attend FROM casts WHERE name = 'Legacy Cast'",
            [],
            |row| row.get(0),
        )?;
        let legacy_table_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table' AND name = 'event_cast_present'",
            [],
            |row| row.get(0),
        )?;
        let is_present: i64 = conn.query_row(
            "SELECT is_present FROM event_cast_present WHERE cast_id = 1",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(is_attend, 0);
        assert_eq!(legacy_table_count, 1);
        assert_eq!(is_present, 0);

        conn.execute("UPDATE casts SET is_attend = 1 WHERE id = 1", [])?;
        let synchronized_presence: i64 = conn.query_row(
            "SELECT is_present FROM event_cast_present WHERE cast_id = 1",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(synchronized_presence, 1);
        Ok(())
    }

    #[test]
    fn shared_migration_v4_keeps_header_templates_and_rows() -> rusqlite::Result<()> {
        let dir = TestDir::new("shared-migration-v4");
        let mut conn = Connection::open(dir.db_path("shared.db"))?;
        apply_migrations(&mut conn, &SHARED_MIGRATIONS[..3])?;
        conn.execute(
            "INSERT INTO header_templates (signature) VALUES ('legacy-signature')",
            [],
        )?;

        run_shared_migrations(&mut conn)?;

        let table_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table' AND name = 'header_templates'",
            [],
            |row| row.get(0),
        )?;
        let row_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM header_templates", [], |row| {
                row.get(0)
            })?;
        assert_eq!(table_count, 1);
        assert_eq!(row_count, 1);
        Ok(())
    }

    #[test]
    fn shared_migrations_restore_presence_mirror_from_current_source() -> rusqlite::Result<()> {
        let dir = TestDir::new("shared-migration-v5-repair");
        let mut conn = Connection::open(dir.db_path("shared.db"))?;
        conn.execute_batch(SHARED_MIGRATION_V1)?;
        conn.execute(
            "INSERT INTO casts (name, is_attend) VALUES ('Existing Cast', 0)",
            [],
        )?;
        conn.execute_batch(
            "DROP TABLE event_cast_present;
             DROP TABLE header_templates;
             PRAGMA user_version = 4;",
        )?;

        run_shared_migrations(&mut conn)?;

        let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let repaired_presence: (i64, i64) = conn.query_row(
            "SELECT cast_id, is_present FROM event_cast_present",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let header_table_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table' AND name = 'header_templates'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(version, 7);
        assert_eq!(repaired_presence, (1, 0));
        assert_eq!(header_table_count, 1);
        Ok(())
    }

    #[test]
    fn shared_migration_v6_adds_cast_aliases_and_ng_notes_without_losing_rows(
    ) -> rusqlite::Result<()> {
        let dir = TestDir::new("shared-migration-v6");
        let mut conn = Connection::open(dir.db_path("shared.db"))?;
        apply_migrations(&mut conn, &SHARED_MIGRATIONS[..5])?;
        conn.execute("INSERT INTO casts (name) VALUES ('Existing Cast')", [])?;
        conn.execute(
            "INSERT INTO cast_ng_entries (cast_id, username, userid)
             VALUES (1, 'Existing User', '@existing')",
            [],
        )?;

        run_shared_migrations(&mut conn)?;

        let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let existing_ng: (String, String, Option<String>) = conn.query_row(
            "SELECT username, userid, notes FROM cast_ng_entries WHERE cast_id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        let alias_table_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table' AND name = 'cast_aliases'",
            [],
            |row| row.get(0),
        )?;

        assert_eq!(version, 7);
        assert_eq!(
            existing_ng,
            ("Existing User".to_string(), "@existing".to_string(), None)
        );
        assert_eq!(alias_table_count, 1);
        Ok(())
    }

    #[test]
    fn shared_migration_v7_repairs_only_missing_presence_mirror_rows() -> rusqlite::Result<()> {
        let dir = TestDir::new("shared-migration-v7");
        let mut conn = Connection::open(dir.db_path("shared.db"))?;
        apply_migrations(&mut conn, &SHARED_MIGRATIONS[..6])?;
        conn.execute(
            "INSERT INTO casts (name, is_attend) VALUES ('Missing Mirror', 0)",
            [],
        )?;
        conn.execute(
            "INSERT INTO casts (name, is_attend) VALUES ('Existing Mirror', 0)",
            [],
        )?;
        conn.execute("DELETE FROM event_cast_present WHERE cast_id = 1", [])?;
        conn.execute(
            "UPDATE event_cast_present SET is_present = 1 WHERE cast_id = 2",
            [],
        )?;

        run_shared_migrations(&mut conn)?;

        let repaired: i64 = conn.query_row(
            "SELECT is_present FROM event_cast_present WHERE cast_id = 1",
            [],
            |row| row.get(0),
        )?;
        let preserved: i64 = conn.query_row(
            "SELECT is_present FROM event_cast_present WHERE cast_id = 2",
            [],
            |row| row.get(0),
        )?;
        let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        assert_eq!(repaired, 0);
        assert_eq!(preserved, 1);
        assert_eq!(version, 7);
        Ok(())
    }

    #[test]
    fn session_migration_v3_adds_nullable_cast_id_and_index() -> rusqlite::Result<()> {
        let dir = TestDir::new("session-migration-v3");
        let mut conn = Connection::open(dir.db_path("session.db"))?;
        apply_migrations(&mut conn, &SESSION_MIGRATIONS[..2])?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@legacy')", [])?;
        conn.execute(
            "INSERT INTO applicant_casts (applicant_id, preference_order, cast_name)
             VALUES (1, 0, 'Legacy Cast')",
            [],
        )?;

        apply_migrations(&mut conn, &SESSION_MIGRATIONS[..3])?;
        let user_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let table_count: i64 = conn.query_row(
            "SELECT COUNT(*)
             FROM sqlite_master
             WHERE type = 'table'
               AND name IN ('lottery_saved_runs', 'lottery_saved_run_results')",
            [],
            |row| row.get(0),
        )?;
        let cast_id_column_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('applicant_casts') WHERE name = 'cast_id'",
            [],
            |row| row.get(0),
        )?;
        let cast_id_index_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'index' AND name = 'idx_applicant_casts_cast_id'",
            [],
            |row| row.get(0),
        )?;
        let legacy_cast_id: Option<i64> =
            conn.query_row("SELECT cast_id FROM applicant_casts", [], |row| row.get(0))?;

        assert_eq!(user_version, 3);
        assert_eq!(table_count, 2);
        assert_eq!(cast_id_column_count, 1);
        assert_eq!(cast_id_index_count, 1);
        assert_eq!(legacy_cast_id, None);
        Ok(())
    }

    #[test]
    fn session_migration_keeps_existing_legacy_lottery_result_current() -> rusqlite::Result<()> {
        let dir = TestDir::new("session-migration-v4");
        let mut conn = Connection::open(dir.db_path("session.db"))?;
        apply_migrations(&mut conn, &SESSION_MIGRATIONS[..3])?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@legacy')", [])?;
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (1, 1)",
            [],
        )?;

        run_session_migrations(&mut conn)?;

        let user_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let (matching_type_code, condition_revision, result_revision): (String, i64, Option<i64>) =
            conn.query_row(
                "SELECT matching_type_code, condition_revision, lottery_result_revision
             FROM session_workflow_state WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;
        assert_eq!(user_version, 6);
        assert_eq!(matching_type_code, "M001");
        assert_eq!(condition_revision, 0);
        assert_eq!(result_revision, Some(0));
        Ok(())
    }

    #[test]
    fn session_migration_v6_repairs_unconfirmed_legacy_result() -> rusqlite::Result<()> {
        let dir = TestDir::new("session-migration-v6");
        let mut conn = Connection::open(dir.db_path("session.db"))?;
        apply_migrations(&mut conn, &SESSION_MIGRATIONS[..4])?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@legacy')", [])?;
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (1, 0)",
            [],
        )?;
        conn.execute_batch("PRAGMA user_version = 5;")?;

        run_session_migrations(&mut conn)?;

        let result_revision: Option<i64> = conn.query_row(
            "SELECT lottery_result_revision FROM session_workflow_state WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        assert_eq!(result_revision, Some(0));
        assert_eq!(version, 6);
        Ok(())
    }

    #[test]
    fn session_migration_without_lottery_result_remains_unconfirmed() -> rusqlite::Result<()> {
        let dir = TestDir::new("session-migration-without-lottery-result");
        let mut conn = Connection::open(dir.db_path("session.db"))?;

        run_session_migrations(&mut conn)?;

        let result_revision: Option<i64> = conn.query_row(
            "SELECT lottery_result_revision FROM session_workflow_state WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(result_revision, None);
        Ok(())
    }

    #[test]
    fn untrusted_session_cast_ids_are_returned_to_unresolved_names() -> rusqlite::Result<()> {
        let dir = TestDir::new("untrusted-session-cast-ids");
        let mut session = open_migrated_session_db(&dir.db_path("session.db"))?;
        session.execute("INSERT INTO applicants (x_id) VALUES ('@legacy')", [])?;
        session.execute(
            "INSERT INTO applicant_casts
               (applicant_id, preference_order, cast_name, cast_id)
             VALUES (1, 0, 'Cast A', 202)",
            [],
        )?;
        session.execute(
            "INSERT INTO meta (key, value) VALUES (?1, '1')",
            [OBSOLETE_SESSION_CAST_ID_BACKFILL_META_KEY],
        )?;

        normalize_session_cast_id_provenance(&mut session)?;

        let cast_id: Option<i64> =
            session.query_row("SELECT cast_id FROM applicant_casts", [], |row| row.get(0))?;
        let provenance: String = session.query_row(
            "SELECT value FROM meta WHERE key = ?1",
            [SESSION_CAST_ID_PROVENANCE_META_KEY],
            |row| row.get(0),
        )?;
        let obsolete_marker_count: i64 = session.query_row(
            "SELECT COUNT(*) FROM meta WHERE key = ?1",
            [OBSOLETE_SESSION_CAST_ID_BACKFILL_META_KEY],
            |row| row.get(0),
        )?;
        assert_eq!(cast_id, None);
        assert_eq!(provenance, SESSION_CAST_ID_PROVENANCE_LEGACY);
        assert_eq!(obsolete_marker_count, 0);
        Ok(())
    }

    #[test]
    fn native_session_cast_ids_are_not_cleared() -> rusqlite::Result<()> {
        let dir = TestDir::new("native-session-cast-ids");
        let mut session = open_migrated_session_db(&dir.db_path("session.db"))?;
        mark_session_cast_ids_native(&session)?;
        session.execute("INSERT INTO applicants (x_id) VALUES ('@native')", [])?;
        session.execute(
            "INSERT INTO applicant_casts
               (applicant_id, preference_order, cast_name, cast_id)
             VALUES (1, 0, 'Cast A', 101)",
            [],
        )?;

        normalize_session_cast_id_provenance(&mut session)?;

        let cast_id: Option<i64> =
            session.query_row("SELECT cast_id FROM applicant_casts", [], |row| row.get(0))?;
        assert_eq!(cast_id, Some(101));
        Ok(())
    }

    #[test]
    fn legacy_session_cast_ids_are_cleared_again_if_an_old_version_restores_them(
    ) -> rusqlite::Result<()> {
        let dir = TestDir::new("legacy-session-restored-cast-ids");
        let mut session = open_migrated_session_db(&dir.db_path("session.db"))?;
        session.execute("INSERT INTO applicants (x_id) VALUES ('@legacy')", [])?;
        session.execute(
            "INSERT INTO applicant_casts
               (applicant_id, preference_order, cast_name, cast_id)
             VALUES (1, 0, 'Cast A', 303)",
            [],
        )?;
        session.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)",
            rusqlite::params![
                SESSION_CAST_ID_PROVENANCE_META_KEY,
                SESSION_CAST_ID_PROVENANCE_LEGACY
            ],
        )?;

        normalize_session_cast_id_provenance(&mut session)?;

        let cast_id: Option<i64> =
            session.query_row("SELECT cast_id FROM applicant_casts", [], |row| row.get(0))?;
        assert_eq!(cast_id, None);
        Ok(())
    }

    #[test]
    fn persist_applicants_uses_explicit_cast_ids_including_nulls() -> rusqlite::Result<()> {
        let dir = TestDir::new("persist-applicant-cast-ids");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        let users = vec![ApplicantInput {
            name: Some("Explicit".to_string()),
            x_id: "@explicit".to_string(),
            vrc_url: None,
            casts: vec![
                "Cast A".to_string(),
                "Cast B".to_string(),
                "Cast C".to_string(),
            ],
            cast_ids: vec![Some(900), None, None],
            preference_mode: Some("ranked".to_string()),
            is_guaranteed: false,
            raw_extra: vec![],
        }];

        persist_applicants_in_connection(&mut conn, &users)?;

        let rows = {
            let mut stmt = conn.prepare(
                "SELECT a.x_id, ac.cast_name, ac.cast_id
                 FROM applicant_casts ac
                 JOIN applicants a ON a.id = ac.applicant_id
                 ORDER BY a.id, ac.preference_order",
            )?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };

        assert_eq!(
            rows,
            vec![
                ("@explicit".to_string(), "Cast A".to_string(), Some(900)),
                ("@explicit".to_string(), "Cast B".to_string(), None),
                ("@explicit".to_string(), "Cast C".to_string(), None),
            ]
        );
        let provenance: String = conn.query_row(
            "SELECT value FROM meta WHERE key = ?1",
            [SESSION_CAST_ID_PROVENANCE_META_KEY],
            |row| row.get(0),
        )?;
        assert_eq!(provenance, SESSION_CAST_ID_PROVENANCE_NATIVE);
        Ok(())
    }

    #[test]
    fn invalid_applicant_payload_is_rejected_before_replacement() -> rusqlite::Result<()> {
        let dir = TestDir::new("invalid-applicant-payload");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@existing')", [])?;
        let mut invalid = applicant_input("@new");
        invalid.casts = vec!["Cast A".to_string()];

        assert!(persist_applicants_in_connection(&mut conn, &[invalid]).is_err());
        let remaining_x_id: String =
            conn.query_row("SELECT x_id FROM applicants", [], |row| row.get(0))?;

        assert_eq!(remaining_x_id, "@existing");
        Ok(())
    }

    #[test]
    fn applicant_can_be_deleted_by_id_while_other_invalid_x_ids_remain() -> rusqlite::Result<()> {
        let dir = TestDir::new("delete-invalid-applicant");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@Duplicate')", [])?;
        let duplicate_id = conn.last_insert_rowid();
        conn.execute("INSERT INTO applicants (x_id) VALUES (' @duplicate ')", [])?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('')", [])?;
        let empty_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 0)",
            [duplicate_id],
        )?;
        conn.execute(
            "INSERT INTO lottery_saved_runs
               (label, matching_type_code, lottery_count, guaranteed_count, winner_count)
             VALUES ('旧抽選', 'M001', 1, 0, 1)",
            [],
        )?;

        delete_applicant_in_connection(&mut conn, duplicate_id)?;
        assert!(validate_stored_applicant_x_ids(&conn).is_err());
        delete_applicant_in_connection(&mut conn, empty_id)?;

        validate_stored_applicant_x_ids(&conn)?;
        let remaining_x_id: String =
            conn.query_row("SELECT x_id FROM applicants", [], |row| row.get(0))?;
        let lottery_result_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM lottery_results", [], |row| row.get(0))?;
        let saved_run_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM lottery_saved_runs", [], |row| {
                row.get(0)
            })?;
        let (condition_revision, result_revision): (i64, Option<i64>) = conn.query_row(
            "SELECT condition_revision, lottery_result_revision
             FROM session_workflow_state
             WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        assert_eq!(remaining_x_id, " @duplicate ");
        assert_eq!(lottery_result_count, 0);
        assert_eq!(saved_run_count, 0);
        assert_eq!(condition_revision, 2);
        assert_eq!(result_revision, None);
        Ok(())
    }

    #[test]
    fn lottery_result_cannot_be_replaced_while_stored_x_ids_are_invalid() -> rusqlite::Result<()> {
        let dir = TestDir::new("invalid-stored-x-id-lottery");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@Duplicate')", [])?;
        let applicant_id = conn.last_insert_rowid();
        conn.execute("INSERT INTO applicants (x_id) VALUES (' @duplicate ')", [])?;
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 0)",
            [applicant_id],
        )?;
        let rows = vec![LotteryResultInput {
            x_id: "@Duplicate".to_string(),
            is_guaranteed: false,
        }];

        assert!(replace_lottery_results_in_connection(&mut conn, &rows, 0).is_err());
        let remaining_result: i64 =
            conn.query_row("SELECT applicant_id FROM lottery_results", [], |row| {
                row.get(0)
            })?;
        assert_eq!(remaining_result, applicant_id);
        Ok(())
    }

    #[test]
    fn applicant_validation_rejects_empty_duplicate_and_reserved_values() {
        assert!(validate_applicant_inputs(&[applicant_input(" ")]).is_err());
        assert!(validate_applicant_inputs(&[
            applicant_input("@Duplicate"),
            applicant_input(" @duplicate "),
        ])
        .is_err());

        let mut reserved_extra = applicant_input("@reserved");
        reserved_extra.raw_extra.push(RawExtraInput {
            key: PREFERENCE_MODE_EXTRA_KEY.to_string(),
            value: Some("flat".to_string()),
        });
        assert!(validate_applicant_inputs(&[reserved_extra]).is_err());

        let mut invalid_mode = applicant_input("@invalid-mode");
        invalid_mode.preference_mode = Some("unknown".to_string());
        assert!(validate_applicant_inputs(&[invalid_mode]).is_err());

        let mut invalid_empty_cast = applicant_input("@invalid-empty-cast");
        invalid_empty_cast.casts = vec![String::new()];
        invalid_empty_cast.cast_ids = vec![Some(1)];
        assert!(validate_applicant_inputs(&[invalid_empty_cast]).is_err());
    }

    #[test]
    fn rename_cast_preserves_id_and_session_snapshot() -> rusqlite::Result<()> {
        let dir = TestDir::new("rename-cast-stable-id");
        let mut shared = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        let cast_id = insert_cast_in_connection(&mut shared, &cast_input("旧キャスト"))?;
        let session = open_migrated_session_db(&dir.db_path("session.db"))?;
        session.execute("INSERT INTO applicants (x_id) VALUES ('@applicant')", [])?;
        session.execute(
            "INSERT INTO applicant_casts
               (applicant_id, preference_order, cast_name, cast_id)
             VALUES (1, 0, '旧キャスト', ?1)",
            [cast_id],
        )?;

        rename_cast_in_connection(&mut shared, cast_id, "新キャスト")?;

        let renamed_row: (i64, String) =
            shared.query_row("SELECT id, name FROM casts", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?;
        let session_snapshot: (String, i64) = session.query_row(
            "SELECT cast_name, cast_id FROM applicant_casts",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        assert_eq!(renamed_row, (cast_id, "新キャスト".to_string()));
        assert_eq!(session_snapshot, ("旧キャスト".to_string(), cast_id));
        Ok(())
    }

    #[test]
    fn deleting_and_reinserting_same_name_does_not_relink_session_id() -> rusqlite::Result<()> {
        let dir = TestDir::new("delete-reinsert-cast-id");
        let mut shared = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        let original_id = insert_cast_in_connection(&mut shared, &cast_input("Cast A"))?;
        let session = open_migrated_session_db(&dir.db_path("session.db"))?;
        session.execute("INSERT INTO applicants (x_id) VALUES ('@applicant')", [])?;
        session.execute(
            "INSERT INTO applicant_casts
               (applicant_id, preference_order, cast_name, cast_id)
             VALUES (1, 0, 'Cast A', ?1)",
            [original_id],
        )?;

        delete_cast_in_connection(&mut shared, original_id)?;
        let replacement_id = insert_cast_in_connection(&mut shared, &cast_input("Cast A"))?;

        let stored_session_id: i64 =
            session.query_row("SELECT cast_id FROM applicant_casts", [], |row| row.get(0))?;
        assert_ne!(replacement_id, original_id);
        assert_eq!(stored_session_id, original_id);
        Ok(())
    }

    #[test]
    fn persist_applicants_failure_keeps_existing_rows_and_saved_runs() -> rusqlite::Result<()> {
        let dir = TestDir::new("persist-applicants-rollback");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute(
            "INSERT INTO applicants (x_id, name) VALUES (?1, ?2)",
            rusqlite::params!["@old_user", "Old User"],
        )?;
        let old_applicant_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_saved_runs
               (label, matching_type_code, lottery_count, guaranteed_count, winner_count)
             VALUES ('旧抽選', 'M002', 1, 0, 1)",
            [],
        )?;
        let run_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_saved_run_results
               (run_id, applicant_id, is_guaranteed, result_order)
             VALUES (?1, ?2, 0, 0)",
            rusqlite::params![run_id, old_applicant_id],
        )?;

        let users = vec![
            ApplicantInput {
                name: Some("New User".to_string()),
                x_id: "@duplicate".to_string(),
                vrc_url: None,
                casts: vec!["Cast A".to_string()],
                cast_ids: vec![None],
                preference_mode: Some("ranked".to_string()),
                is_guaranteed: false,
                raw_extra: vec![],
            },
            ApplicantInput {
                name: Some("Duplicate User".to_string()),
                x_id: "@duplicate".to_string(),
                vrc_url: None,
                casts: vec![],
                cast_ids: vec![],
                preference_mode: Some("flat".to_string()),
                is_guaranteed: true,
                raw_extra: vec![],
            },
        ];

        assert!(persist_applicants_in_connection(&mut conn, &users).is_err());
        let applicant_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM applicants", [], |row| row.get(0))?;
        let saved_run_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM lottery_saved_runs", [], |row| {
                row.get(0)
            })?;
        let saved_result_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM lottery_saved_run_results",
            [],
            |row| row.get(0),
        )?;

        assert_eq!(applicant_count, 1);
        assert_eq!(saved_run_count, 1);
        assert_eq!(saved_result_count, 1);
        Ok(())
    }

    #[test]
    fn applicant_replacement_advances_revision_and_rejects_old_lottery() -> rusqlite::Result<()> {
        let dir = TestDir::new("applicant-replacement-revision");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;

        persist_applicants_in_connection(&mut conn, &[applicant_input("@same")])?;
        let revision: i64 = conn.query_row(
            "SELECT condition_revision FROM session_workflow_state WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        let old_rows = vec![LotteryResultInput {
            x_id: "@same".to_string(),
            is_guaranteed: false,
        }];

        assert_eq!(revision, 1);
        assert!(replace_lottery_results_in_connection(&mut conn, &old_rows, 0).is_err());
        let result_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM lottery_results", [], |row| row.get(0))?;
        assert_eq!(result_count, 0);
        Ok(())
    }

    #[test]
    fn lottery_result_validation_rejects_empty_and_duplicate_x_ids() {
        assert!(validate_lottery_result_inputs(&[LotteryResultInput {
            x_id: " ".to_string(),
            is_guaranteed: false,
        }])
        .is_err());
        assert!(validate_lottery_result_inputs(&[
            LotteryResultInput {
                x_id: "@duplicate".to_string(),
                is_guaranteed: false,
            },
            LotteryResultInput {
                x_id: " @DUPLICATE ".to_string(),
                is_guaranteed: true,
            },
        ])
        .is_err());
    }

    #[test]
    fn replace_lottery_results_failure_keeps_existing_rows() -> rusqlite::Result<()> {
        let dir = TestDir::new("replace-lottery-rollback");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@old_user')", [])?;
        let applicant_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 1)",
            [applicant_id],
        )?;

        let rows = vec![LotteryResultInput {
            x_id: "@missing".to_string(),
            is_guaranteed: false,
        }];

        assert!(replace_lottery_results_in_connection(&mut conn, &rows, 0).is_err());
        let remaining_applicant_id: i64 =
            conn.query_row("SELECT applicant_id FROM lottery_results", [], |row| {
                row.get(0)
            })?;
        assert_eq!(remaining_applicant_id, applicant_id);
        Ok(())
    }

    #[test]
    fn lottery_state_replace_is_atomic_and_rejects_changed_revision() -> rusqlite::Result<()> {
        let dir = TestDir::new("replace-lottery-state");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@first')", [])?;
        let first_id = conn.last_insert_rowid();
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@second')", [])?;
        let second_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 0)",
            [first_id],
        )?;

        let rows = vec![LotteryResultInput {
            x_id: "@second".to_string(),
            is_guaranteed: true,
        }];
        replace_lottery_state_in_connection(&mut conn, &rows, 0)?;

        let (condition_revision, result_revision): (i64, Option<i64>) = conn.query_row(
            "SELECT condition_revision, lottery_result_revision
             FROM session_workflow_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let result_applicant_id: i64 =
            conn.query_row("SELECT applicant_id FROM lottery_results", [], |row| {
                row.get(0)
            })?;
        assert_eq!(condition_revision, 1);
        assert_eq!(result_revision, Some(1));
        assert_eq!(result_applicant_id, second_id);

        let stale_rows = vec![LotteryResultInput {
            x_id: "@first".to_string(),
            is_guaranteed: false,
        }];
        assert!(replace_lottery_results_in_connection(&mut conn, &stale_rows, 0).is_err());
        let unchanged_applicant_id: i64 =
            conn.query_row("SELECT applicant_id FROM lottery_results", [], |row| {
                row.get(0)
            })?;
        assert_eq!(unchanged_applicant_id, second_id);
        Ok(())
    }

    #[test]
    fn saved_lottery_restore_updates_conditions_guarantees_and_results() -> rusqlite::Result<()> {
        let dir = TestDir::new("restore-saved-lottery");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute(
            "INSERT INTO applicants (x_id, is_guaranteed) VALUES ('@first', 0)",
            [],
        )?;
        let first_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO applicants (x_id, is_guaranteed) VALUES ('@second', 1)",
            [],
        )?;
        let second_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 1)",
            [second_id],
        )?;
        conn.execute(
            "INSERT INTO lottery_saved_runs
               (label, matching_type_code, lottery_count, guaranteed_count, winner_count)
             VALUES ('保存済み', 'M003', 1, 1, 2)",
            [],
        )?;
        let run_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_saved_run_results
               (run_id, applicant_id, is_guaranteed, result_order)
             VALUES (?1, ?2, 1, 0)",
            rusqlite::params![run_id, first_id],
        )?;
        conn.execute(
            "INSERT INTO lottery_saved_run_results
               (run_id, applicant_id, is_guaranteed, result_order)
             VALUES (?1, ?2, 0, 1)",
            rusqlite::params![run_id, second_id],
        )?;

        let restored = restore_lottery_run_in_connection(&mut conn, run_id, 0)?;
        let workflow: (String, i64, i64, Option<i64>) = conn.query_row(
            "SELECT matching_type_code, lottery_count, condition_revision,
                    lottery_result_revision
             FROM session_workflow_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        let guarantees = {
            let mut stmt =
                conn.prepare("SELECT x_id, is_guaranteed FROM applicants ORDER BY id")?;
            let values = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            values
        };
        let results = {
            let mut stmt = conn.prepare(
                "SELECT a.x_id, lr.is_guaranteed
                 FROM lottery_results lr
                 INNER JOIN applicants a ON a.id = lr.applicant_id
                 ORDER BY lr.id",
            )?;
            let values = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            values
        };

        assert_eq!(restored.matching_type_code, "M003");
        assert_eq!(restored.lottery_count, 1);
        assert_eq!(workflow, ("M003".to_string(), 1, 2, Some(2)));
        assert_eq!(
            guarantees,
            vec![("@first".to_string(), 1), ("@second".to_string(), 0)]
        );
        assert_eq!(
            results,
            vec![("@first".to_string(), 1), ("@second".to_string(), 0)]
        );
        assert!(restore_lottery_run_in_connection(&mut conn, run_id, 0).is_err());
        Ok(())
    }

    #[test]
    fn saved_lottery_restore_failure_rolls_back_all_state() -> rusqlite::Result<()> {
        let dir = TestDir::new("restore-saved-lottery-rollback");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute(
            "INSERT INTO applicants (x_id, is_guaranteed) VALUES ('@current', 1)",
            [],
        )?;
        let current_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO applicants (x_id, is_guaranteed) VALUES ('@saved', 0)",
            [],
        )?;
        let saved_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 1)",
            [current_id],
        )?;
        conn.execute(
            "INSERT INTO lottery_saved_runs
               (label, matching_type_code, lottery_count, guaranteed_count, winner_count)
             VALUES ('保存済み', 'M002', 1, 1, 2)",
            [],
        )?;
        let run_id = conn.last_insert_rowid();
        for (order, applicant_id, is_guaranteed) in [(0, saved_id, 1), (1, current_id, 0)] {
            conn.execute(
                "INSERT INTO lottery_saved_run_results
                   (run_id, applicant_id, is_guaranteed, result_order)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![run_id, applicant_id, is_guaranteed, order],
            )?;
        }
        conn.execute_batch(&format!(
            "CREATE TRIGGER reject_restored_result
             BEFORE INSERT ON lottery_results
             WHEN NEW.applicant_id = {current_id}
             BEGIN
               SELECT RAISE(ABORT, 'テスト用の復元失敗');
             END;"
        ))?;

        assert!(restore_lottery_run_in_connection(&mut conn, run_id, 0).is_err());
        let workflow: (String, i64, i64, Option<i64>) = conn.query_row(
            "SELECT matching_type_code, lottery_count, condition_revision,
                    lottery_result_revision
             FROM session_workflow_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        let current_is_guaranteed: i64 = conn.query_row(
            "SELECT is_guaranteed FROM applicants WHERE id = ?1",
            [current_id],
            |row| row.get(0),
        )?;
        let result_applicant_id: i64 =
            conn.query_row("SELECT applicant_id FROM lottery_results", [], |row| {
                row.get(0)
            })?;

        assert_eq!(workflow, ("M001".to_string(), 1, 0, None));
        assert_eq!(current_is_guaranteed, 1);
        assert_eq!(result_applicant_id, current_id);
        Ok(())
    }

    #[test]
    fn save_lottery_run_failure_rolls_back_heading_row() -> rusqlite::Result<()> {
        let dir = TestDir::new("save-lottery-run-rollback");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@winner')", [])?;
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (1, 0)",
            [],
        )?;
        conn.execute(
            "UPDATE session_workflow_state
             SET lottery_result_revision = condition_revision
             WHERE id = 1",
            [],
        )?;
        conn.execute_batch(
            "CREATE TRIGGER reject_saved_lottery_result
             BEFORE INSERT ON lottery_saved_run_results
             BEGIN
               SELECT RAISE(ABORT, 'テスト用の保存失敗');
             END;",
        )?;

        assert!(save_lottery_run_in_connection(&mut conn, "保存").is_err());
        let run_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM lottery_saved_runs", [], |row| {
                row.get(0)
            })?;
        let result_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM lottery_saved_run_results",
            [],
            |row| row.get(0),
        )?;

        assert_eq!(run_count, 0);
        assert_eq!(result_count, 0);
        Ok(())
    }

    #[test]
    fn stale_lottery_result_cannot_be_saved_as_history() -> rusqlite::Result<()> {
        let dir = TestDir::new("save-stale-lottery-run");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@winner')", [])?;
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (1, 0)",
            [],
        )?;

        assert!(save_lottery_run_in_connection(&mut conn, "保存").is_err());
        let run_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM lottery_saved_runs", [], |row| {
                row.get(0)
            })?;
        assert_eq!(run_count, 0);
        Ok(())
    }

    #[test]
    fn saved_lottery_metadata_is_derived_from_database_state_and_rows() -> rusqlite::Result<()> {
        let dir = TestDir::new("save-lottery-run-metadata");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@guaranteed')", [])?;
        let guaranteed_id = conn.last_insert_rowid();
        conn.execute("INSERT INTO applicants (x_id) VALUES ('@lottery')", [])?;
        let lottery_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 1)",
            [guaranteed_id],
        )?;
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 0)",
            [lottery_id],
        )?;
        conn.execute(
            "UPDATE session_workflow_state
             SET matching_type_code = 'M003',
                 lottery_result_revision = condition_revision
             WHERE id = 1",
            [],
        )?;

        save_lottery_run_in_connection(&mut conn, "保存")?;
        let metadata: (String, i64, i64, i64) = conn.query_row(
            "SELECT matching_type_code, lottery_count, guaranteed_count, winner_count
             FROM lottery_saved_runs",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;

        assert_eq!(metadata, ("M003".to_string(), 1, 1, 2));
        let copied_ids = {
            let mut stmt = conn.prepare(
                "SELECT applicant_id FROM lottery_saved_run_results ORDER BY result_order",
            )?;
            let rows = stmt
                .query_map([], |row| row.get(0))?
                .collect::<rusqlite::Result<Vec<i64>>>()?;
            rows
        };
        assert_eq!(copied_ids, vec![guaranteed_id, lottery_id]);
        Ok(())
    }

    #[test]
    fn insert_cast_saves_aliases_and_ng_notes_in_same_transaction() -> rusqlite::Result<()> {
        let dir = TestDir::new("insert-cast-aliases");
        let mut conn = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        let mut cast = cast_input("Cast A");
        cast.aliases = vec!["別名A".to_string(), "別名B".to_string()];
        cast.ng_entries = vec![NgUserInput {
            username: Some("対象者".to_string()),
            account_id: Some("@target".to_string()),
            notes: Some("NG理由".to_string()),
        }];

        let cast_id = insert_cast_in_connection(&mut conn, &cast)?;
        let aliases = {
            let mut stmt =
                conn.prepare("SELECT alias FROM cast_aliases WHERE cast_id = ?1 ORDER BY id")?;
            let values = stmt
                .query_map([cast_id], |row| row.get(0))?
                .collect::<rusqlite::Result<Vec<String>>>()?;
            values
        };
        let ng: (String, String, String) = conn.query_row(
            "SELECT username, userid, notes FROM cast_ng_entries WHERE cast_id = ?1",
            [cast_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        assert_eq!(aliases, vec!["別名A".to_string(), "別名B".to_string()]);
        assert_eq!(
            ng,
            (
                "対象者".to_string(),
                "@target".to_string(),
                "NG理由".to_string()
            )
        );

        let mut duplicate_alias = cast_input("Cast B");
        duplicate_alias.aliases = vec!["同じ別名".to_string(), "同じ別名".to_string()];
        assert!(insert_cast_in_connection(&mut conn, &duplicate_alias).is_err());
        let duplicate_cast_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM casts WHERE name = 'Cast B'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(duplicate_cast_count, 0);
        Ok(())
    }

    #[test]
    fn update_cast_fields_replaces_related_rows() -> rusqlite::Result<()> {
        let dir = TestDir::new("update-cast-fields");
        let mut conn = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        conn.execute(
            "INSERT INTO casts (name, group_name) VALUES ('Cast A', 'Old')",
            [],
        )?;
        let cast_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO cast_urls (cast_id, url) VALUES (?1, 'https://example.test/old')",
            [cast_id],
        )?;
        conn.execute(
            "INSERT INTO cast_ng_entries (cast_id, username, userid) VALUES (?1, 'Old', '@old')",
            [cast_id],
        )?;
        conn.execute(
            "INSERT INTO cast_aliases (cast_id, alias) VALUES (?1, '旧別名')",
            [cast_id],
        )?;

        let patch = cast_patch_input();

        update_cast_fields_in_connection(&mut conn, cast_id, &patch)?;

        let row: (Option<String>, i64, Option<String>) = conn.query_row(
            "SELECT group_name, is_attend, memo FROM casts WHERE name = 'Cast A'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        let url: String = conn.query_row(
            "SELECT url FROM cast_urls WHERE cast_id = ?1",
            [cast_id],
            |row| row.get(0),
        )?;
        let ng: (String, String) = conn.query_row(
            "SELECT userid, notes FROM cast_ng_entries WHERE cast_id = ?1",
            [cast_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let aliases = {
            let mut stmt =
                conn.prepare("SELECT alias FROM cast_aliases WHERE cast_id = ?1 ORDER BY id")?;
            let values = stmt
                .query_map([cast_id], |row| row.get(0))?
                .collect::<rusqlite::Result<Vec<String>>>()?;
            values
        };
        assert_eq!(row, (None, 0, Some("updated".to_string())));
        assert_eq!(url, "https://example.test/new");
        assert_eq!(ng, ("@new".to_string(), "NG理由".to_string()));
        assert_eq!(aliases, vec!["別名A".to_string(), "別名B".to_string()]);
        Ok(())
    }

    #[test]
    fn missing_cast_id_fails_update_rename_and_delete() -> rusqlite::Result<()> {
        let dir = TestDir::new("missing-cast-write-target");
        let mut conn = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        let missing_cast_id = 999_999;

        assert!(
            update_cast_fields_in_connection(&mut conn, missing_cast_id, &cast_patch_input())
                .is_err()
        );
        assert!(rename_cast_in_connection(&mut conn, missing_cast_id, "New Name").is_err());
        assert!(delete_cast_in_connection(&mut conn, missing_cast_id).is_err());
        Ok(())
    }

    #[test]
    fn record_cast_attendance_replaces_same_day_rows() -> rusqlite::Result<()> {
        let dir = TestDir::new("record-attendance");
        let mut conn = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        conn.execute("INSERT INTO casts (name) VALUES ('Cast A')", [])?;
        let cast_a_id = conn.last_insert_rowid();
        conn.execute("INSERT INTO casts (name) VALUES ('Cast B')", [])?;
        let cast_b_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO cast_attendance (cast_id, recorded_at) VALUES (?1, '2026-06-18')",
            [cast_a_id],
        )?;

        record_cast_attendance_in_connection(&mut conn, &[cast_b_id], "2026-06-18")?;

        let names: String = conn.query_row(
            "SELECT GROUP_CONCAT(c.name, ',')
             FROM cast_attendance ca
             JOIN casts c ON c.id = ca.cast_id
             WHERE DATE(ca.recorded_at) = DATE('2026-06-18')",
            [],
            |row| row.get(0),
        )?;

        assert_eq!(names, "Cast B");
        Ok(())
    }

    #[test]
    fn missing_cast_id_aborts_attendance_replacement() -> rusqlite::Result<()> {
        let dir = TestDir::new("record-attendance-missing-cast");
        let mut conn = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        conn.execute("INSERT INTO casts (name) VALUES ('Cast A')", [])?;
        let cast_a_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO cast_attendance (cast_id, recorded_at) VALUES (?1, '2026-06-18')",
            [cast_a_id],
        )?;

        assert!(record_cast_attendance_in_connection(
            &mut conn,
            &[cast_a_id, 999_999],
            "2026-06-18",
        )
        .is_err());

        let stored_cast_id: i64 = conn.query_row(
            "SELECT cast_id FROM cast_attendance
             WHERE DATE(recorded_at) = DATE('2026-06-18')",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(stored_cast_id, cast_a_id);
        Ok(())
    }
}
