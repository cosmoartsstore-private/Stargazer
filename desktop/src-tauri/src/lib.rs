use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::Duration;
use tauri::Manager;

const SHARED_DIR: &str = "shared";
const CACHE_DIR: &str = "Cache";
const WEBVIEW_DATA_DIR: &str = "EBWebView";
const IN_PROGRESS_SESSION_MARKER: &str = ".stargazer-in-progress";
const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_STAGING_DIRECTORY_ATTEMPTS: usize = 64;
// SQL schemaのCHECK制約と同じ方式だけをcommand境界で受け付ける。
const SUPPORTED_MATCHING_TYPE_CODES: [&str; 4] = ["M000", "M001", "M002", "M003"];
static STAGING_DIRECTORY_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static WORK_SESSION_LIFECYCLE_LOCK: Mutex<()> = Mutex::new(());
static STARTUP_SESSION_CLEANUP_ERROR: OnceLock<Option<String>> = OnceLock::new();

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
const SHARED_SCHEMA: &str = r#"
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
  userid   TEXT,
  notes    TEXT
);

CREATE TABLE caution_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL,
  account_id    TEXT NOT NULL COLLATE NOCASE,
  notes         TEXT,
  ng_cast_count INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(account_id)
);

CREATE TABLE cast_attendance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id     INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE attendance_record_dates (
  recorded_at TEXT PRIMARY KEY
);

CREATE TABLE cast_aliases (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  alias   TEXT NOT NULL,
  UNIQUE(cast_id, alias)
);

CREATE INDEX idx_cast_aliases_cast_id
  ON cast_aliases(cast_id, id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE saved_results (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  source_session_token     TEXT NOT NULL UNIQUE,
  result_type              TEXT NOT NULL CHECK (result_type IN ('lottery', 'matching')),
  label                    TEXT NOT NULL,
  matching_type_code       TEXT NOT NULL
                             CHECK (matching_type_code IN ('M000', 'M001', 'M002', 'M003')),
  lottery_count            INTEGER,
  guaranteed_count         INTEGER,
  winner_count             INTEGER NOT NULL CHECK (winner_count >= 1),
  snapshot_json            TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  CHECK (
    (
      result_type = 'lottery'
      AND lottery_count IS NOT NULL
      AND lottery_count >= 1
      AND guaranteed_count IS NOT NULL
      AND guaranteed_count >= 0
      AND winner_count = lottery_count + guaranteed_count
    )
    OR
    (
      result_type = 'matching'
      AND matching_type_code IN ('M001', 'M002', 'M003')
      AND lottery_count IS NULL
      AND guaranteed_count IS NULL
    )
  )
);

CREATE INDEX idx_saved_results_type_created_at
  ON saved_results(result_type, created_at DESC, id DESC);
"#;

const SHARED_REQUIRED_TABLES: &[&str] = &[
    "meta",
    "casts",
    "cast_urls",
    "cast_ng_entries",
    "caution_users",
    "cast_attendance",
    "attendance_record_dates",
    "cast_aliases",
    "settings",
    "saved_results",
];

const SHARED_SCHEMA_QUERIES: &[&str] = &[
    "SELECT key, value FROM meta LIMIT 0",
    "SELECT id, name, group_name, is_attend, photo_data_url, memo, created_at FROM casts LIMIT 0",
    "SELECT id, cast_id, url FROM cast_urls LIMIT 0",
    "SELECT id, cast_id, username, userid, notes FROM cast_ng_entries LIMIT 0",
    "SELECT id, username, account_id, notes, ng_cast_count, registered_at FROM caution_users LIMIT 0",
    "SELECT id, cast_id, recorded_at FROM cast_attendance LIMIT 0",
    "SELECT recorded_at FROM attendance_record_dates LIMIT 0",
    "SELECT id, cast_id, alias FROM cast_aliases LIMIT 0",
    "SELECT key, value FROM settings LIMIT 0",
    "SELECT id, source_session_token, result_type, label, matching_type_code, lottery_count, guaranteed_count, winner_count, snapshot_json, created_at FROM saved_results LIMIT 0",
];

// === 取込セッション DB ======================================================
// 応募者データの区切りとして、希望キャスト、追加列、抽選条件、抽選結果を同じDBに保持する。
// 明示保存した業務結果はイベント共有DBへ移し、このDBは応募管理へ戻るとき、または終了時に破棄する。
const SESSION_SCHEMA: &str = r#"
CREATE TABLE applicants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  x_id          TEXT NOT NULL,
  name          TEXT,
  vrc_url       TEXT,
  preference_mode TEXT NOT NULL CHECK (preference_mode IN ('ranked', 'flat')),
  is_guaranteed INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE applicant_casts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id     INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  preference_order INTEGER NOT NULL,
  cast_name        TEXT NOT NULL,
  cast_id          INTEGER NULL
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

CREATE INDEX idx_applicant_casts_cast_id
  ON applicant_casts(cast_id);

CREATE INDEX idx_applicants_x_id
  ON applicants(x_id);

CREATE TABLE session_workflow_state (
  id                          INTEGER PRIMARY KEY CHECK (id = 1),
  session_token               TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  is_lottery_read_only        INTEGER NOT NULL DEFAULT 0
                                CHECK (is_lottery_read_only IN (0, 1)),
  matching_type_code          TEXT NOT NULL DEFAULT 'M001'
                                CHECK (matching_type_code IN ('M000', 'M001', 'M002', 'M003')),
  lottery_count               INTEGER NOT NULL DEFAULT 1 CHECK (lottery_count >= 1),
  rotation_count              INTEGER NOT NULL DEFAULT 2 CHECK (rotation_count >= 1),
  total_tables                INTEGER NOT NULL DEFAULT 15 CHECK (total_tables >= 1),
  users_per_table             INTEGER NOT NULL DEFAULT 1 CHECK (users_per_table >= 1),
  casts_per_rotation          INTEGER NOT NULL DEFAULT 1 CHECK (casts_per_rotation >= 1),
  reserve_same_day_slots      INTEGER NOT NULL DEFAULT 0 CHECK (reserve_same_day_slots IN (0, 1)),
  same_day_slot_count         INTEGER NOT NULL DEFAULT 0 CHECK (same_day_slot_count >= 0),
  same_day_slot_unit          TEXT NOT NULL DEFAULT 'table'
                                CHECK (same_day_slot_unit IN ('person', 'table')),
  condition_revision          INTEGER NOT NULL DEFAULT 0,
  lottery_result_revision     INTEGER
);

INSERT INTO session_workflow_state (id) VALUES (1);
"#;

const SESSION_REQUIRED_TABLES: &[&str] = &[
    "applicants",
    "applicant_casts",
    "applicant_extra",
    "lottery_results",
    "session_workflow_state",
];

const SESSION_SCHEMA_QUERIES: &[&str] = &[
    "SELECT id, x_id, name, vrc_url, preference_mode, is_guaranteed, created_at FROM applicants LIMIT 0",
    "SELECT id, applicant_id, preference_order, cast_name, cast_id FROM applicant_casts LIMIT 0",
    "SELECT id, applicant_id, field_key, field_value FROM applicant_extra LIMIT 0",
    "SELECT id, applicant_id, is_guaranteed, drawn_at FROM lottery_results LIMIT 0",
    "SELECT id, session_token, is_lottery_read_only, matching_type_code, lottery_count, rotation_count, total_tables, users_per_table, casts_per_rotation, reserve_same_day_slots, same_day_slot_count, same_day_slot_unit, condition_revision, lottery_result_revision FROM session_workflow_state LIMIT 0",
];

fn is_windows_reserved_event_name(name: &str) -> bool {
    let normalized = name.to_ascii_uppercase();
    matches!(normalized.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || normalized
            .strip_prefix("COM")
            .or_else(|| normalized.strip_prefix("LPT"))
            .is_some_and(|number| {
                matches!(number, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            })
}

/** Frontendと同じ規則で、イベント名をWindowsのパス構成要素として制限する。 */
fn validate_event_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("イベント名が空です".to_string());
    }
    if !name
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err(
            "イベント名には半角英数字・ハイフン・アンダースコアだけを使用できます".to_string(),
        );
    }
    if name.chars().count() > 64 {
        return Err("イベント名は64文字以下にしてください".to_string());
    }
    if is_windows_reserved_event_name(name) {
        return Err("この名前はWindowsでフォルダー名として使用できません".to_string());
    }
    Ok(())
}

fn is_event_directory_name(name: &str) -> bool {
    validate_event_name(name).is_ok()
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

fn configure_connection(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
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

fn validate_schema_queries(
    conn: &rusqlite::Connection,
    database_name: &str,
    queries: &[&str],
) -> rusqlite::Result<()> {
    for query in queries {
        if let Err(error) = conn.prepare(query) {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_SCHEMA),
                Some(format!(
                    "{database_name}DBが現行schemaに一致しません: {error}"
                )),
            ));
        }
    }
    Ok(())
}

fn validate_current_schema(
    conn: &rusqlite::Connection,
    database_name: &str,
    required_tables: &[&str],
    schema_queries: &[&str],
) -> rusqlite::Result<()> {
    validate_required_tables(conn, database_name, required_tables)?;
    validate_schema_queries(conn, database_name, schema_queries)
}

fn initialize_schema(
    conn: &mut rusqlite::Connection,
    schema: &str,
    database_name: &str,
    required_tables: &[&str],
    schema_queries: &[&str],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute_batch(schema)?;
    tx.commit()?;
    validate_current_schema(conn, database_name, required_tables, schema_queries)
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

#[cfg(target_os = "windows")]
fn sqlite_open_path(db_path: &Path) -> PathBuf {
    // SQLiteのWindows VFSへ260文字超の絶対パスを渡せるよう、既存の親だけを拡張長表記へ変換する。
    db_path
        .parent()
        .and_then(|parent| std::fs::canonicalize(parent).ok())
        .and_then(|parent| db_path.file_name().map(|file_name| parent.join(file_name)))
        .unwrap_or_else(|| db_path.to_path_buf())
}

#[cfg(not(target_os = "windows"))]
fn sqlite_open_path(db_path: &Path) -> PathBuf {
    db_path.to_path_buf()
}

fn open_connection(
    db_path: &Path,
    flags: rusqlite::OpenFlags,
) -> Result<rusqlite::Connection, String> {
    let sqlite_path = sqlite_open_path(db_path);
    let conn = rusqlite::Connection::open_with_flags(&sqlite_path, flags)
        .map_err(|e| format!("DBを開けませんでした: {e}"))?;
    conn.busy_timeout(SQLITE_BUSY_TIMEOUT)
        .map_err(|e| format!("DB待機設定に失敗しました: {e}"))?;
    configure_connection(&conn).map_err(|e| format!("DB接続を設定できませんでした: {e}"))?;
    Ok(conn)
}

fn create_schema_connection(
    db_path: &Path,
    schema: &str,
    database_name: &str,
    required_tables: &[&str],
    schema_queries: &[&str],
) -> Result<rusqlite::Connection, String> {
    if db_path.exists() {
        return Err(format!("DBは既に存在します: {}", db_path.display()));
    }
    let db_dir = db_path
        .parent()
        .ok_or_else(|| "DBパスが不正です".to_string())?;
    std::fs::create_dir_all(db_dir).map_err(|e| format!("ディレクトリ作成に失敗しました: {e}"))?;
    let mut conn = open_connection(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_CREATE,
    )?;
    initialize_schema(
        &mut conn,
        schema,
        database_name,
        required_tables,
        schema_queries,
    )
    .map_err(|e| format!("{database_name}DBを初期化できませんでした: {e}"))?;
    Ok(conn)
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
 * WHY: 最終パスへ直接作成すると、schemaや追加初期化の失敗後に一覧へ現れる不完全な
 * イベント・セッションが残り、同名で再作成できなくなる。一時ディレクトリだけを失敗時の
 * 削除対象にすることで、既存データを巻き込まずに作成処理を原子的に扱える。
 */
fn create_initialized_directory_atomically<F>(
    final_dir: &Path,
    relative_db_path: &Path,
    schema: &str,
    database_name: &str,
    required_tables: &[&str],
    schema_queries: &[&str],
    initialize: F,
) -> Result<PathBuf, String>
where
    F: FnOnce(&mut rusqlite::Connection) -> Result<(), String>,
{
    let staging_dir = create_staging_directory(final_dir)?;
    let creation_result = (|| {
        let staging_db_path = staging_dir.join(relative_db_path);
        let mut conn = create_schema_connection(
            &staging_db_path,
            schema,
            database_name,
            required_tables,
            schema_queries,
        )?;
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

fn open_existing_schema_connection(
    db_path: &Path,
    database_name: &str,
    required_tables: &[&str],
    schema_queries: &[&str],
) -> Result<rusqlite::Connection, String> {
    if !db_path.is_file() {
        return Err(format!("DBが存在しません: {}", db_path.display()));
    }
    // READ_WRITEだけで開き、存在確認後に削除された場合も空DBを再作成しない。
    let conn = open_connection(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    validate_current_schema(&conn, database_name, required_tables, schema_queries)
        .map_err(|e| format!("{database_name}DBを開けませんでした: {e}"))?;
    Ok(conn)
}

fn open_existing_schema_read_only_connection(
    db_path: &Path,
    database_name: &str,
    required_tables: &[&str],
    schema_queries: &[&str],
) -> Result<rusqlite::Connection, String> {
    if !db_path.is_file() {
        return Err(format!("DBが存在しません: {}", db_path.display()));
    }
    let conn = rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("DBを読み取り専用で開けませんでした: {e}"))?;
    conn.busy_timeout(SQLITE_BUSY_TIMEOUT)
        .map_err(|e| format!("DB待機設定に失敗しました: {e}"))?;
    validate_current_schema(&conn, database_name, required_tables, schema_queries)
        .map_err(|e| format!("{database_name}DBを開けませんでした: {e}"))?;
    Ok(conn)
}

fn create_event_shared_db(event_name: &str) -> Result<(), String> {
    let relative_db_path = Path::new(SHARED_DIR).join("db").join("stargazer.db");
    create_initialized_directory_atomically(
        &event_dir(event_name),
        &relative_db_path,
        SHARED_SCHEMA,
        "イベント共有",
        SHARED_REQUIRED_TABLES,
        SHARED_SCHEMA_QUERIES,
        |_| Ok(()),
    )
    .map(|_| ())
}

fn open_event_shared_db(event_name: &str) -> Result<(PathBuf, rusqlite::Connection), String> {
    let db_path = event_shared_db_path(event_name);
    let conn = open_existing_schema_connection(
        &db_path,
        "イベント共有",
        SHARED_REQUIRED_TABLES,
        SHARED_SCHEMA_QUERIES,
    )?;
    Ok((db_path, conn))
}

fn open_event_shared_read_only_db(
    event_name: &str,
) -> Result<(PathBuf, rusqlite::Connection), String> {
    let db_path = event_shared_db_path(event_name);
    let conn = open_existing_schema_read_only_connection(
        &db_path,
        "イベント共有",
        SHARED_REQUIRED_TABLES,
        SHARED_SCHEMA_QUERIES,
    )?;
    Ok((db_path, conn))
}

fn write_session_in_progress_marker(conn: &rusqlite::Connection) -> Result<(), String> {
    let staging_dir = conn
        .path()
        .and_then(|db_path| Path::new(db_path).parent())
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| "操作中セッションの一時保存先が不正です".to_string())?;
    std::fs::write(
        staging_dir.join(IN_PROGRESS_SESSION_MARKER),
        b"Stargazer import session in progress\n",
    )
    .map_err(|e| format!("操作中セッションの状態を保存できませんでした: {e}"))
}

fn open_session_db(
    event_name: &str,
    timestamp: &str,
) -> Result<(PathBuf, rusqlite::Connection), String> {
    let db_path = session_db_path(event_name, timestamp);
    let conn = open_existing_schema_connection(
        &db_path,
        "取込セッション",
        SESSION_REQUIRED_TABLES,
        SESSION_SCHEMA_QUERIES,
    )?;
    Ok((db_path, conn))
}

fn open_session_read_only_db(
    event_name: &str,
    timestamp: &str,
) -> Result<(PathBuf, rusqlite::Connection), String> {
    let db_path = session_db_path(event_name, timestamp);
    let conn = open_existing_schema_read_only_connection(
        &db_path,
        "取込セッション",
        SESSION_REQUIRED_TABLES,
        SESSION_SCHEMA_QUERIES,
    )?;
    Ok((db_path, conn))
}

fn session_in_progress_marker_path(event_name: &str, timestamp: &str) -> PathBuf {
    session_dir(event_name, timestamp).join(IN_PROGRESS_SESSION_MARKER)
}

fn read_session_token(conn: &rusqlite::Connection) -> rusqlite::Result<String> {
    conn.query_row(
        "SELECT session_token FROM session_workflow_state WHERE id = 1",
        [],
        |row| row.get(0),
    )
}

fn session_has_saved_result(
    shared_conn: &rusqlite::Connection,
    session_token: &str,
) -> rusqlite::Result<bool> {
    shared_conn
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM saved_results WHERE source_session_token = ?1
             )",
            [session_token],
            |row| row.get::<_, i64>(0),
        )
        .map(|exists| exists == 1)
}

/** 一つの作業セッションから保存できる業務結果を、抽選またはマッチングの一件に制限する。 */
fn reject_session_with_saved_result(
    event_name: &str,
    session_conn: &rusqlite::Connection,
) -> Result<(), String> {
    let session_token = read_session_token(session_conn)
        .map_err(|e| sqlite_error("作業セッションを確認できませんでした", e))?;
    let (_, shared_conn) = open_event_shared_db(event_name)?;
    if session_has_saved_result(&shared_conn, &session_token)
        .map_err(|e| sqlite_error("保存済み結果を確認できませんでした", e))?
    {
        return Err("この作業セッションでは既に結果を保存しています".to_string());
    }
    Ok(())
}

fn path_to_sqlite_uri(path: &Path) -> String {
    format!("sqlite:{}", path.to_string_lossy().replace('\\', "/"))
}

fn now_local_timestamp() -> String {
    use chrono::Local;
    Local::now().format("%Y%m%d%H%M%S").to_string()
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct RawExtraInput {
    key: String,
    value: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ApplicantInput {
    name: Option<String>,
    x_id: String,
    vrc_url: Option<String>,
    casts: Vec<String>,
    cast_ids: Vec<Option<i64>>,
    preference_mode: String,
    is_guaranteed: bool,
    raw_extra: Vec<RawExtraInput>,
}

#[derive(Deserialize)]
struct ApplicantCastPreferencesInput {
    cast_ids: Vec<Option<i64>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SessionWorkflowStateInput {
    matching_type_code: String,
    lottery_count: i64,
    rotation_count: i64,
    total_tables: i64,
    users_per_table: i64,
    casts_per_rotation: i64,
    reserve_same_day_slots: bool,
    same_day_slot_count: i64,
    same_day_slot_unit: String,
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
    update_aliases: bool,
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

#[derive(Serialize)]
struct EventMetaOutput {
    notes: Option<String>,
    photo_data_url: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct LotteryResultInput {
    x_id: String,
    is_guaranteed: bool,
}

/** 保存済み抽選だけで新しい作業セッションを再構築できる固定スナップショット。 */
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SavedLotterySnapshot {
    applicants: Vec<ApplicantInput>,
    workflow: SessionWorkflowStateInput,
    winners: Vec<LotteryResultInput>,
}

/** イベント共有DBに保存した抽選結果の見出し。 */
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EventSavedLotteryResultSummary {
    saved_result_id: i64,
    label: String,
    matching_type_code: String,
    lottery_count: i64,
    guaranteed_count: i64,
    winner_count: i64,
    created_at: String,
}

/** イベント共有DBに保存したマッチング結果の見出し。 */
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EventSavedMatchingResultSummary {
    saved_result_id: i64,
    label: String,
    matching_type_code: String,
    winner_count: i64,
    created_at: String,
}

/** 履歴詳細で表示する固定スナップショット。 */
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EventSavedMatchingResultDetail {
    saved_result_id: i64,
    label: String,
    matching_type_code: String,
    winner_count: i64,
    created_at: String,
    snapshot: serde_json::Value,
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MatchingSnapshotUserInput {
    name: String,
    x_id: String,
}

#[derive(Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MatchingSnapshotNgEntryInput {
    #[serde(deserialize_with = "deserialize_required_nullable")]
    username: Option<String>,
    #[serde(deserialize_with = "deserialize_required_nullable")]
    account_id: Option<String>,
}

#[derive(Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MatchingSnapshotCastInput {
    id: i64,
    name: String,
    is_present: bool,
    ng_entries: Vec<MatchingSnapshotNgEntryInput>,
}

fn deserialize_required_nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MatchingSnapshotAssignmentInput {
    cast_id: i64,
    rank: i64,
    rotation_index: i64,
    score: f64,
    is_ng_warning: bool,
    #[serde(deserialize_with = "deserialize_required_nullable")]
    ng_reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MatchingSnapshotApplicantInput {
    user: MatchingSnapshotUserInput,
    matches: Vec<MatchingSnapshotAssignmentInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MatchingSnapshotTableSlotInput {
    table_index: i64,
    #[serde(deserialize_with = "deserialize_required_nullable")]
    user: Option<MatchingSnapshotUserInput>,
    matches: Vec<MatchingSnapshotAssignmentInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MatchingSnapshotScoreSummaryInput {
    total_score: f64,
    average_score: f64,
    first_choice_count: i64,
    second_choice_count: i64,
    third_choice_count: i64,
    flat_preference_count: i64,
    unpreferred_count: i64,
    ng_warning_count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MatchingResultSnapshotInput {
    casts: Vec<MatchingSnapshotCastInput>,
    applicants: Vec<MatchingSnapshotApplicantInput>,
    table_slots: Vec<MatchingSnapshotTableSlotInput>,
    score_summary: MatchingSnapshotScoreSummaryInput,
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

/** キャスト本体、別名義、連絡先 URL、NG エントリを同じ transaction に挿入する。 */
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
        let account_id = canonicalize_optional_x_id(ng.account_id.as_deref(), "キャストNG")?;
        tx.execute(
            "INSERT INTO cast_ng_entries (cast_id, username, userid, notes)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                cast_id,
                ng.username.as_deref(),
                account_id.as_deref(),
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
        || state.same_day_slot_count < 0
    {
        return Err("抽選・マッチング条件の数値が範囲外です".to_string());
    }
    if !matches!(state.same_day_slot_unit.as_str(), "person" | "table") {
        return Err("当日枠の計数単位が不正です".to_string());
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
    let tx = conn.transaction()?;
    validate_session_workflow_write_access(&tx, state)?;
    tx.execute(
        "UPDATE session_workflow_state
         SET condition_revision = condition_revision + CASE
               WHEN matching_type_code <> ?1
                 OR lottery_count <> ?2
                 OR rotation_count <> ?3
                 OR total_tables <> ?4
                 OR users_per_table <> ?5
                 OR casts_per_rotation <> ?6
                 OR reserve_same_day_slots <> ?7
                 OR same_day_slot_count <> ?8
                 OR same_day_slot_unit <> ?9
               THEN 1 ELSE 0 END,
             matching_type_code = ?1,
             lottery_count = ?2,
             rotation_count = ?3,
             total_tables = ?4,
             users_per_table = ?5,
             casts_per_rotation = ?6,
             reserve_same_day_slots = ?7,
             same_day_slot_count = ?8,
             same_day_slot_unit = ?9
         WHERE id = 1",
        rusqlite::params![
            &state.matching_type_code,
            state.lottery_count,
            state.rotation_count,
            state.total_tables,
            state.users_per_table,
            state.casts_per_rotation,
            if state.reserve_same_day_slots { 1 } else { 0 },
            state.same_day_slot_count,
            &state.same_day_slot_unit,
        ],
    )?;
    tx.commit()
}

/** @usernameまたはusernameを検証し、内部保存用のusername部分を返す。 */
fn parse_x_username(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    let username = trimmed.strip_prefix('@').unwrap_or(trimmed);
    if username.is_empty()
        || username.len() > 15
        || !username
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return None;
    }
    Some(username)
}

/** 有効なX IDは@なしへ整え、形式不正値は取込後に確認できるよう原文を残す。 */
fn canonicalize_x_id_for_storage(value: &str) -> String {
    parse_x_username(value).unwrap_or(value.trim()).to_string()
}

/** 任意入力のX IDを@なしへ整え、指定された形式不正値は保存前に拒否する。 */
fn canonicalize_optional_x_id(
    value: Option<&str>,
    context: &str,
) -> rusqlite::Result<Option<String>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let username = parse_x_username(value).ok_or_else(|| {
        rusqlite::Error::InvalidParameterName(format!("{context}のX ID '{value}' は形式が不正です"))
    })?;
    Ok(Some(username.to_string()))
}

fn validate_unique_x_ids<'a>(
    x_ids: impl IntoIterator<Item = &'a str>,
    context: &str,
) -> rusqlite::Result<()> {
    let mut seen_x_ids = HashSet::new();
    for x_id in x_ids {
        let trimmed = x_id.trim();
        if trimmed.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "{context}にX IDが空のデータがあります"
            )));
        }
        let username = parse_x_username(trimmed).ok_or_else(|| {
            rusqlite::Error::InvalidParameterName(format!(
                "{context}に形式が不正なX ID '{x_id}' があります"
            ))
        })?;
        let normalized = username.to_ascii_lowercase();
        if !seen_x_ids.insert(normalized) {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "{context}に重複するX ID '{x_id}' があります"
            )));
        }
    }
    Ok(())
}

fn validate_applicant_inputs(users: &[ApplicantInput]) -> rusqlite::Result<()> {
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
        if !matches!(user.preference_mode.as_str(), "flat" | "ranked") {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "応募者 '{}' の希望方式が不正です",
                user.x_id
            )));
        }
    }
    Ok(())
}

/** 保存済み抽選から復元したセッションでは、応募者と抽選条件を変更させない。 */
fn reject_lottery_input_session_write(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    let is_read_only = conn.query_row(
        "SELECT is_lottery_read_only FROM session_workflow_state WHERE id = 1",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    if is_read_only == 1 {
        return Err(rusqlite::Error::InvalidParameterName(
            "保存済み抽選から復元した応募データと抽選条件は変更できません".to_string(),
        ));
    }
    Ok(())
}

/** 復元済み抽選の方式と人数を固定し、後続マッチング専用の条件だけを変更可能にする。 */
fn validate_session_workflow_write_access(
    conn: &rusqlite::Connection,
    state: &SessionWorkflowStateInput,
) -> rusqlite::Result<()> {
    let (is_read_only, matching_type_code, lottery_count): (i64, String, i64) = conn.query_row(
        "SELECT is_lottery_read_only, matching_type_code, lottery_count
         FROM session_workflow_state WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    if is_read_only == 1
        && (matching_type_code != state.matching_type_code || lottery_count != state.lottery_count)
    {
        return Err(rusqlite::Error::InvalidParameterName(
            "保存済み抽選の方式と抽選人数は変更できません".to_string(),
        ));
    }
    Ok(())
}

/** 選び直した希望IDを現在の名簿へ照合し、保存する正式名を確定する。 */
fn resolve_applicant_cast_preferences(
    shared_conn: &rusqlite::Connection,
    input: &ApplicantCastPreferencesInput,
) -> rusqlite::Result<Vec<Option<(i64, String)>>> {
    input
        .cast_ids
        .iter()
        .map(|cast_id| {
            let Some(cast_id) = cast_id else {
                return Ok(None);
            };
            let cast_name = shared_conn
                .query_row("SELECT name FROM casts WHERE id = ?1", [cast_id], |row| {
                    row.get::<_, String>(0)
                })
                .optional()?
                .ok_or_else(|| {
                    rusqlite::Error::InvalidParameterName(format!(
                        "希望キャストID '{cast_id}' は現在の名簿に存在しません"
                    ))
                })?;
            Ok(Some((*cast_id, cast_name)))
        })
        .collect()
}

/** 編集可能な取込セッションの応募者一覧と現行抽選結果を、単一 transaction で全置換する。 */
fn persist_applicants_in_connection(
    conn: &mut rusqlite::Connection,
    users: &[ApplicantInput],
) -> rusqlite::Result<()> {
    // 入力全体を先に検証し、不正なpayloadで既存データの置換を開始しない。
    validate_applicant_inputs(users)?;
    let tx = conn.transaction()?;
    reject_lottery_input_session_write(&tx)?;
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
        let stored_x_id = canonicalize_x_id_for_storage(&user.x_id);
        tx.execute(
            "INSERT INTO applicants (x_id, name, vrc_url, preference_mode, is_guaranteed)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                &stored_x_id,
                user.name.as_deref(),
                user.vrc_url.as_deref(),
                &user.preference_mode,
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
        for extra in &user.raw_extra {
            tx.execute(
                "INSERT INTO applicant_extra (applicant_id, field_key, field_value)
                 VALUES (?1, ?2, ?3)",
                rusqlite::params![applicant_id, &extra.key, extra.value.as_deref()],
            )?;
        }
    }
    tx.commit()
}

/** 応募者1件の希望だけを更新し、抽選結果と応募者IDは維持する。 */
fn update_applicant_cast_preferences_in_connection(
    conn: &mut rusqlite::Connection,
    applicant_id: i64,
    preferences: &[Option<(i64, String)>],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    reject_lottery_input_session_write(&tx)?;
    tx.query_row(
        "SELECT 1 FROM applicants WHERE id = ?1",
        [applicant_id],
        |row| row.get::<_, i64>(0),
    )?;
    tx.execute(
        "DELETE FROM applicant_casts WHERE applicant_id = ?1",
        [applicant_id],
    )?;
    for (preference_order, preference) in preferences.iter().enumerate() {
        let Some((cast_id, cast_name)) = preference else {
            continue;
        };
        tx.execute(
            "INSERT INTO applicant_casts
               (applicant_id, preference_order, cast_name, cast_id)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![applicant_id, preference_order as i64, cast_name, cast_id],
        )?;
    }
    tx.commit()
}

/** 応募者1件を削除し、応募者集合に依存する抽選状態も同じtransactionで無効化する。 */
fn delete_applicant_in_connection(
    conn: &mut rusqlite::Connection,
    applicant_id: i64,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    reject_lottery_input_session_write(&tx)?;
    tx.query_row(
        "SELECT 1 FROM applicants WHERE id = ?1",
        [applicant_id],
        |row| row.get::<_, i64>(0),
    )?;
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
    let requested = guaranteed_x_ids
        .iter()
        .map(|x_id| {
            parse_x_username(x_id)
                .unwrap_or(x_id.as_str())
                .to_ascii_lowercase()
        })
        .collect::<HashSet<_>>();
    let current = {
        let mut stmt = tx.prepare("SELECT x_id FROM applicants WHERE is_guaranteed = 1")?;
        let values = stmt
            .query_map([], |row| {
                let x_id = row.get::<_, String>(0)?;
                Ok(parse_x_username(&x_id)
                    .unwrap_or(x_id.as_str())
                    .to_ascii_lowercase())
            })?
            .collect::<rusqlite::Result<HashSet<_>>>()?;
        values
    };
    if current.len() == requested.len() && current.iter().all(|x_id| requested.contains(x_id)) {
        return Ok(());
    }

    tx.execute("UPDATE applicants SET is_guaranteed = 0", [])?;
    for x_id in &requested {
        let updated = tx.execute(
            "UPDATE applicants
             SET is_guaranteed = 1
             WHERE LOWER(LTRIM(TRIM(x_id), '@')) = ?1",
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
    reject_lottery_input_session_write(&tx)?;
    // 重複X IDを含むセッションでは対象行を一意に決められないため、抽選条件を更新しない。
    validate_stored_applicant_x_ids(&tx)?;
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
            let account_id = canonicalize_optional_x_id(ng.account_id.as_deref(), "キャストNG")?;
            tx.execute(
                "INSERT INTO cast_ng_entries (cast_id, username, userid, notes)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    cast_id,
                    ng.username.as_deref(),
                    account_id.as_deref(),
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

fn is_valid_calendar_date(value: &str) -> bool {
    if value.len() != 10 || value.as_bytes()[4] != b'-' || value.as_bytes()[7] != b'-' {
        return false;
    }
    let Ok(year) = value[0..4].parse::<u32>() else {
        return false;
    };
    let Ok(month) = value[5..7].parse::<u32>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u32>() else {
        return false;
    };
    if year == 0 || !(1..=12).contains(&month) {
        return false;
    }
    let leap_year = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        2 if leap_year => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    (1..=days_in_month).contains(&day)
}

/** 指定日のキャスト出席記録を、既存行削除と新規挿入を含めて単一 transaction で保存する。 */
fn record_cast_attendance_in_connection(
    conn: &mut rusqlite::Connection,
    present_cast_ids: &[i64],
    recorded_at: &str,
) -> rusqlite::Result<()> {
    if !is_valid_calendar_date(recorded_at) {
        return Err(rusqlite::Error::InvalidParameterName(
            "出席記録日は実在する YYYY-MM-DD 形式の日付で指定してください".to_string(),
        ));
    }
    if present_cast_ids
        .iter()
        .copied()
        .collect::<HashSet<_>>()
        .len()
        != present_cast_ids.len()
    {
        return Err(rusqlite::Error::InvalidParameterName(
            "出席者一覧に同じキャストが重複しています".to_string(),
        ));
    }
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare("SELECT 1 FROM casts WHERE id = ?1")?;
        for cast_id in present_cast_ids {
            stmt.query_row([cast_id], |row| row.get::<_, i64>(0))?;
        }
    }
    tx.execute(
        "INSERT INTO attendance_record_dates (recorded_at)
         VALUES (?1)
         ON CONFLICT(recorded_at) DO NOTHING",
        [recorded_at],
    )?;
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

struct ValidatedLotteryResultCounts {
    lottery_count: i64,
    guaranteed_count: i64,
    winner_count: i64,
}

/** 現在の応募者区分と抽選人数を正として、現行抽選結果の件数と保証区分を検証する。 */
fn validate_lottery_result_rows_against_workflow(
    conn: &rusqlite::Connection,
    rows: &[LotteryResultInput],
) -> rusqlite::Result<ValidatedLotteryResultCounts> {
    validate_lottery_result_inputs(rows)?;
    validate_stored_applicant_x_ids(conn)?;

    let lottery_count: i64 = conn.query_row(
        "SELECT lottery_count FROM session_workflow_state WHERE id = 1",
        [],
        |row| row.get(0),
    )?;
    let (candidate_count, guaranteed_count, invalid_guarantee_count): (i64, i64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(CASE WHEN is_guaranteed = 0 THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN is_guaranteed = 1 THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN is_guaranteed NOT IN (0, 1) THEN 1 ELSE 0 END), 0)
             FROM applicants",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
    if lottery_count < 1 {
        return Err(rusqlite::Error::InvalidParameterName(
            "抽選条件の抽選人数が不正です".to_string(),
        ));
    }
    if invalid_guarantee_count != 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "応募者の確定当選区分が不正です".to_string(),
        ));
    }
    if lottery_count > candidate_count {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "抽選人数（{lottery_count}名）が抽選候補数（{candidate_count}名）を超えています"
        )));
    }

    let mut drawn_result_count = 0_i64;
    let mut guaranteed_result_count = 0_i64;
    {
        let mut stmt = conn.prepare(
            "SELECT is_guaranteed FROM applicants
             WHERE LOWER(LTRIM(TRIM(x_id), '@')) = LOWER(?1)",
        )?;
        for row in rows {
            let Some(username) = parse_x_username(&row.x_id) else {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "当選者 '{}' のX IDは形式が不正です",
                    row.x_id
                )));
            };
            let applicant_is_guaranteed = stmt
                .query_row([username], |result| result.get::<_, i64>(0))
                .optional()?
                .ok_or_else(|| {
                    rusqlite::Error::InvalidParameterName(format!(
                        "当選者 '{}' は現在の取込セッションに存在しません",
                        row.x_id
                    ))
                })?
                == 1;
            if applicant_is_guaranteed != row.is_guaranteed {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "当選者 '{}' の確定当選区分が応募者データと一致しません",
                    row.x_id
                )));
            }
            if row.is_guaranteed {
                guaranteed_result_count += 1;
            } else {
                drawn_result_count += 1;
            }
        }
    }

    if drawn_result_count != lottery_count {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "抽選結果の抽選当選者数（{drawn_result_count}名）が設定された抽選人数（{lottery_count}名）と一致しません"
        )));
    }
    if guaranteed_result_count != guaranteed_count {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "抽選結果の確定当選者数（{guaranteed_result_count}名）が応募者データの確定当選者数（{guaranteed_count}名）と一致しません"
        )));
    }

    let winner_count = i64::try_from(rows.len()).map_err(|_| {
        rusqlite::Error::InvalidParameterName(
            "抽選結果の件数が保存可能な範囲を超えています".to_string(),
        )
    })?;
    Ok(ValidatedLotteryResultCounts {
        lottery_count,
        guaranteed_count,
        winner_count,
    })
}

fn read_current_lottery_result_rows(
    conn: &rusqlite::Connection,
) -> rusqlite::Result<Vec<LotteryResultInput>> {
    let mut stmt = conn.prepare(
        "SELECT a.x_id, r.is_guaranteed
         FROM lottery_results r
         LEFT JOIN applicants a ON a.id = r.applicant_id
         ORDER BY r.id",
    )?;
    let rows = stmt
        .query_map([], |row| {
            let x_id = row.get::<_, Option<String>>(0)?.ok_or_else(|| {
                rusqlite::Error::InvalidParameterName(
                    "抽選結果が存在しない応募者を参照しています".to_string(),
                )
            })?;
            let is_guaranteed = row.get::<_, i64>(1)?;
            if !matches!(is_guaranteed, 0 | 1) {
                return Err(rusqlite::Error::InvalidParameterName(
                    "抽選結果の確定当選区分が不正です".to_string(),
                ));
            }
            Ok(LotteryResultInput {
                x_id,
                is_guaranteed: is_guaranteed == 1,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
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
    // UIを迂回した呼出しでも、不正なX IDを解消するまで抽選を確定させない。
    validate_stored_applicant_x_ids(tx)?;
    tx.execute("DELETE FROM lottery_results", [])?;
    for row in rows {
        let Some(username) = parse_x_username(&row.x_id) else {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "当選者 '{}' のX IDは形式が不正です",
                row.x_id
            )));
        };
        let inserted = tx.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed)
             SELECT id, ?2 FROM applicants
             WHERE LOWER(LTRIM(TRIM(x_id), '@')) = LOWER(?1)",
            rusqlite::params![username, if row.is_guaranteed { 1 } else { 0 }],
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
    reject_lottery_input_session_write(&tx)?;
    validate_expected_condition_revision(&tx, expected_condition_revision)?;
    validate_lottery_result_rows_against_workflow(&tx, rows)?;
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

fn read_session_applicant_snapshot(
    conn: &rusqlite::Connection,
) -> rusqlite::Result<Vec<ApplicantInput>> {
    let applicants = {
        let mut stmt = conn.prepare(
            "SELECT id, name, x_id, vrc_url, preference_mode, is_guaranteed
             FROM applicants ORDER BY id",
        )?;
        let values = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };

    let mut result = Vec::with_capacity(applicants.len());
    for (applicant_id, name, x_id, vrc_url, preference_mode, is_guaranteed) in applicants {
        if !matches!(is_guaranteed, 0 | 1) {
            return Err(rusqlite::Error::InvalidParameterName(
                "応募者の確定当選区分が不正です".to_string(),
            ));
        }
        let preferences = {
            let mut stmt = conn.prepare(
                "SELECT preference_order, cast_name, cast_id
                 FROM applicant_casts
                 WHERE applicant_id = ?1
                 ORDER BY preference_order, id",
            )?;
            let values = stmt
                .query_map([applicant_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            values
        };
        let preference_length = preferences
            .iter()
            .map(|(order, _, _)| usize::try_from(*order).unwrap_or(usize::MAX))
            .max()
            .map_or(0, |order| order.saturating_add(1));
        if preference_length == usize::MAX {
            return Err(rusqlite::Error::InvalidParameterName(
                "希望キャストの順序が不正です".to_string(),
            ));
        }
        let mut casts = vec![String::new(); preference_length];
        let mut cast_ids = vec![None; preference_length];
        for (order, cast_name, cast_id) in preferences {
            let index = usize::try_from(order).map_err(|_| {
                rusqlite::Error::InvalidParameterName("希望キャストの順序が不正です".to_string())
            })?;
            if casts[index].is_empty() {
                casts[index] = cast_name;
                cast_ids[index] = cast_id;
            } else {
                return Err(rusqlite::Error::InvalidParameterName(
                    "希望キャストの順序が重複しています".to_string(),
                ));
            }
        }
        if preference_mode == "flat" {
            let active_indexes = casts
                .iter()
                .enumerate()
                .filter_map(|(index, name)| (!name.is_empty()).then_some(index))
                .collect::<Vec<_>>();
            casts = active_indexes
                .iter()
                .map(|index| casts[*index].clone())
                .collect();
            cast_ids = active_indexes
                .iter()
                .map(|index| cast_ids[*index])
                .collect();
        }
        let raw_extra = {
            let mut stmt = conn.prepare(
                "SELECT field_key, field_value
                 FROM applicant_extra WHERE applicant_id = ?1 ORDER BY id",
            )?;
            let values = stmt
                .query_map([applicant_id], |row| {
                    Ok(RawExtraInput {
                        key: row.get(0)?,
                        value: row.get(1)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            values
        };
        result.push(ApplicantInput {
            name,
            x_id,
            vrc_url,
            casts,
            cast_ids,
            preference_mode,
            is_guaranteed: is_guaranteed == 1,
            raw_extra,
        });
    }
    Ok(result)
}

fn read_session_workflow_input(
    conn: &rusqlite::Connection,
) -> rusqlite::Result<SessionWorkflowStateInput> {
    conn.query_row(
        "SELECT matching_type_code, lottery_count, rotation_count, total_tables,
                users_per_table, casts_per_rotation, reserve_same_day_slots,
                same_day_slot_count, same_day_slot_unit
         FROM session_workflow_state WHERE id = 1",
        [],
        |row| {
            Ok(SessionWorkflowStateInput {
                matching_type_code: row.get(0)?,
                lottery_count: row.get(1)?,
                rotation_count: row.get(2)?,
                total_tables: row.get(3)?,
                users_per_table: row.get(4)?,
                casts_per_rotation: row.get(5)?,
                reserve_same_day_slots: row.get::<_, i64>(6)? == 1,
                same_day_slot_count: row.get(7)?,
                same_day_slot_unit: row.get(8)?,
            })
        },
    )
}

fn validate_saved_lottery_snapshot(
    snapshot: &SavedLotterySnapshot,
    matching_type_code: &str,
    lottery_count: i64,
    guaranteed_count: i64,
    winner_count: i64,
) -> Result<(), String> {
    validate_applicant_inputs(&snapshot.applicants)
        .map_err(|e| sqlite_error("保存済み抽選の応募データが不正です", e))?;
    validate_unique_x_ids(
        snapshot
            .applicants
            .iter()
            .map(|applicant| applicant.x_id.as_str()),
        "保存済み抽選の応募者一覧",
    )
    .map_err(|e| sqlite_error("保存済み抽選の応募データが不正です", e))?;
    validate_session_workflow_state(&snapshot.workflow)?;
    validate_lottery_result_inputs(&snapshot.winners)
        .map_err(|e| sqlite_error("保存済み抽選の当選者データが不正です", e))?;

    if snapshot.workflow.matching_type_code != matching_type_code
        || snapshot.workflow.lottery_count != lottery_count
    {
        return Err("保存済み抽選の見出しと条件が一致しません".to_string());
    }
    let applicants_by_x_id = snapshot
        .applicants
        .iter()
        .map(|applicant| {
            (
                parse_x_username(&applicant.x_id)
                    .unwrap_or(applicant.x_id.as_str())
                    .to_ascii_lowercase(),
                applicant.is_guaranteed,
            )
        })
        .collect::<HashMap<_, _>>();
    let mut restored_guaranteed_count = 0_i64;
    let mut restored_lottery_count = 0_i64;
    for winner in &snapshot.winners {
        let normalized_x_id = parse_x_username(&winner.x_id)
            .ok_or_else(|| "保存済み抽選の当選者X IDが不正です".to_string())?
            .to_ascii_lowercase();
        let applicant_is_guaranteed = applicants_by_x_id
            .get(&normalized_x_id)
            .ok_or_else(|| "保存済み抽選の当選者が応募者一覧に存在しません".to_string())?;
        if *applicant_is_guaranteed != winner.is_guaranteed {
            return Err("保存済み抽選の確定当選区分が応募者データと一致しません".to_string());
        }
        if winner.is_guaranteed {
            restored_guaranteed_count += 1;
        } else {
            restored_lottery_count += 1;
        }
    }
    let applicant_guaranteed_count = snapshot
        .applicants
        .iter()
        .filter(|applicant| applicant.is_guaranteed)
        .count() as i64;
    if restored_lottery_count != lottery_count
        || restored_guaranteed_count != guaranteed_count
        || applicant_guaranteed_count != guaranteed_count
        || snapshot.winners.len() as i64 != winner_count
    {
        return Err("保存済み抽選の見出しと当選者データが一致しません".to_string());
    }
    Ok(())
}

fn read_validated_saved_lottery_result(
    conn: &rusqlite::Connection,
    saved_result_id: i64,
) -> Result<(SavedLotterySnapshot, EventSavedLotteryResultSummary), String> {
    if saved_result_id <= 0 {
        return Err("保存済み抽選結果を特定できません".to_string());
    }
    let row = conn
        .query_row(
            "SELECT label, matching_type_code, lottery_count, guaranteed_count,
                    winner_count, snapshot_json, created_at
             FROM saved_results
             WHERE id = ?1 AND result_type = 'lottery'",
            [saved_result_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()
        .map_err(|e| sqlite_error("保存済み抽選結果を読み込めませんでした", e))?
        .ok_or_else(|| "保存済み抽選結果が見つかりません".to_string())?;
    let snapshot = serde_json::from_str::<SavedLotterySnapshot>(&row.5)
        .map_err(|_| "保存済み抽選結果の表示データが壊れています".to_string())?;
    validate_saved_lottery_snapshot(&snapshot, &row.1, row.2, row.3, row.4)
        .map_err(|_| "保存済み抽選結果の表示データが壊れています".to_string())?;
    Ok((
        snapshot,
        EventSavedLotteryResultSummary {
            saved_result_id,
            label: row.0,
            matching_type_code: row.1,
            lottery_count: row.2,
            guaranteed_count: row.3,
            winner_count: row.4,
            created_at: row.6,
        },
    ))
}

/** 現在の抽選状態を、作業セッションから独立した一件の結果としてイベント共有DBへ保存する。 */
fn save_lottery_result_in_connections(
    session_conn: &mut rusqlite::Connection,
    shared_conn: &mut rusqlite::Connection,
    label: &str,
) -> Result<i64, String> {
    let trimmed_label = label.trim();
    if trimmed_label.is_empty() || trimmed_label.chars().count() > 200 {
        return Err("抽選結果の保存名が不正です".to_string());
    }
    reject_lottery_input_session_write(session_conn)
        .map_err(|e| sqlite_error("抽選結果を保存できませんでした", e))?;
    let session_token = read_session_token(session_conn)
        .map_err(|e| sqlite_error("作業セッションを確認できませんでした", e))?;
    if session_has_saved_result(shared_conn, &session_token)
        .map_err(|e| sqlite_error("保存済み結果を確認できませんでした", e))?
    {
        return Err("この作業セッションでは既に結果を保存しています".to_string());
    }

    let session_tx = session_conn
        .transaction()
        .map_err(|e| sqlite_error("抽選結果の保存準備を開始できませんでした", e))?;
    let (condition_revision, result_revision): (i64, Option<i64>) = session_tx
        .query_row(
            "SELECT condition_revision, lottery_result_revision
             FROM session_workflow_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| sqlite_error("抽選条件を確認できませんでした", e))?;
    if result_revision != Some(condition_revision) {
        return Err("現在の条件で確定した抽選結果がないため保存できません".to_string());
    }
    let winners = read_current_lottery_result_rows(&session_tx)
        .map_err(|e| sqlite_error("抽選結果を読み込めませんでした", e))?;
    if winners.is_empty() {
        return Err("保存できる抽選結果がありません".to_string());
    }
    let counts = validate_lottery_result_rows_against_workflow(&session_tx, &winners)
        .map_err(|e| sqlite_error("抽選結果を確認できませんでした", e))?;
    let snapshot = SavedLotterySnapshot {
        applicants: read_session_applicant_snapshot(&session_tx)
            .map_err(|e| sqlite_error("応募データを保存形式へ変換できませんでした", e))?,
        workflow: read_session_workflow_input(&session_tx)
            .map_err(|e| sqlite_error("抽選条件を保存形式へ変換できませんでした", e))?,
        winners,
    };
    validate_saved_lottery_snapshot(
        &snapshot,
        &snapshot.workflow.matching_type_code,
        counts.lottery_count,
        counts.guaranteed_count,
        counts.winner_count,
    )?;
    let snapshot_json = serde_json::to_string(&snapshot)
        .map_err(|e| format!("抽選結果を保存形式へ変換できませんでした: {e}"))?;
    session_tx
        .commit()
        .map_err(|e| sqlite_error("抽選結果の保存準備を確定できませんでした", e))?;

    let shared_tx = shared_conn
        .transaction()
        .map_err(|e| sqlite_error("抽選結果の保存を開始できませんでした", e))?;
    shared_tx
        .execute(
            "INSERT INTO saved_results
               (source_session_token, result_type, label, matching_type_code,
                lottery_count, guaranteed_count, winner_count, snapshot_json)
             VALUES (?1, 'lottery', ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                session_token,
                trimmed_label,
                &snapshot.workflow.matching_type_code,
                counts.lottery_count,
                counts.guaranteed_count,
                counts.winner_count,
                snapshot_json,
            ],
        )
        .map_err(|e| sqlite_error("抽選結果を保存できませんでした", e))?;
    let saved_result_id = shared_tx.last_insert_rowid();
    shared_tx
        .commit()
        .map_err(|e| sqlite_error("抽選結果の保存を確定できませんでした", e))?;
    Ok(saved_result_id)
}

fn invalid_matching_snapshot(reason: &str) -> String {
    format!("マッチング結果の保存データが不正です: {reason}")
}

fn validate_matching_snapshot_assignment(
    assignment: &MatchingSnapshotAssignmentInput,
    casts_by_id: &HashMap<i64, &MatchingSnapshotCastInput>,
) -> Result<(), String> {
    let cast = casts_by_id
        .get(&assignment.cast_id)
        .ok_or_else(|| invalid_matching_snapshot("存在しないキャストを参照しています"))?;
    if !cast.is_present {
        return Err(invalid_matching_snapshot(
            "欠席扱いのキャストを割り当てています",
        ));
    }
    if !(0..=3).contains(&assignment.rank) {
        return Err(invalid_matching_snapshot("希望順位が不正です"));
    }
    if assignment.rotation_index < 0 {
        return Err(invalid_matching_snapshot("ローテーション番号が不正です"));
    }
    if !assignment.score.is_finite() || assignment.score < 0.0 {
        return Err(invalid_matching_snapshot("評価点が不正です"));
    }
    if assignment.is_ng_warning
        && !matches!(assignment.ng_reason.as_deref(), Some(reason) if !reason.trim().is_empty())
    {
        return Err(invalid_matching_snapshot("NG判定の理由がありません"));
    }
    Ok(())
}

/** 割り当ての基本形式と、M003で要求するラウンド間のキャスト非重複を確認する。 */
fn validate_matching_snapshot_assignments(
    assignments: &[MatchingSnapshotAssignmentInput],
    casts_by_id: &HashMap<i64, &MatchingSnapshotCastInput>,
    require_unique_casts: bool,
) -> Result<(), String> {
    let mut assigned_cast_ids = HashSet::new();
    for assignment in assignments {
        validate_matching_snapshot_assignment(assignment, casts_by_id)?;
        if require_unique_casts && !assigned_cast_ids.insert(assignment.cast_id) {
            return Err(invalid_matching_snapshot(
                "同じキャストが複数のラウンドへ割り当てられています",
            ));
        }
    }
    Ok(())
}

fn matching_score_is_close(left: f64, right: f64) -> bool {
    let scale = left.abs().max(right.abs()).max(1.0);
    (left - right).abs() <= scale * 1e-9
}

/** NG判定と同じ規則で、割り当てを禁止するX IDだけを順序非依存の集合へ正規化する。 */
fn matching_ng_account_ids(entries: &[MatchingSnapshotNgEntryInput]) -> Vec<String> {
    let mut account_ids = entries
        .iter()
        .filter_map(|entry| entry.account_id.as_deref())
        .filter_map(parse_x_username)
        .map(str::to_ascii_lowercase)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    account_ids.sort();
    account_ids
}

/** 保存時点の表示名・出席状態と、割り当てへ影響するNG条件だけを比較する。 */
fn matching_snapshot_cast_is_current(
    snapshot: &MatchingSnapshotCastInput,
    current: &MatchingSnapshotCastInput,
) -> bool {
    snapshot.id == current.id
        && snapshot.name == current.name
        && snapshot.is_present == current.is_present
        && matching_ng_account_ids(&snapshot.ng_entries)
            == matching_ng_account_ids(&current.ng_entries)
}

/** JSONの形だけでなく、応募者・割当・集計値が一つの結果として整合することを確認する。 */
fn validate_matching_snapshot_structure(
    snapshot: &serde_json::Value,
    matching_type_code: &str,
    winner_count: i64,
) -> Result<MatchingResultSnapshotInput, String> {
    if matching_type_code == "M000" || !SUPPORTED_MATCHING_TYPE_CODES.contains(&matching_type_code)
    {
        return Err("保存できないマッチング方式です".to_string());
    }
    let expected_winner_count = usize::try_from(winner_count)
        .ok()
        .filter(|count| *count > 0)
        .ok_or_else(|| "保存できるマッチング結果がありません".to_string())?;
    let parsed = serde_json::from_value::<MatchingResultSnapshotInput>(snapshot.clone())
        .map_err(|_| invalid_matching_snapshot("形式が現在のアプリに対応していません"))?;
    if parsed.applicants.len() != expected_winner_count {
        return Err(invalid_matching_snapshot(
            "当選者数と応募者データの件数が一致しません",
        ));
    }
    if parsed.casts.is_empty() || parsed.table_slots.is_empty() {
        return Err(invalid_matching_snapshot(
            "キャストまたはテーブルのデータがありません",
        ));
    }

    let mut casts_by_id = HashMap::new();
    for cast in &parsed.casts {
        if cast.id <= 0 || cast.name.trim().is_empty() {
            return Err(invalid_matching_snapshot("キャスト情報が不正です"));
        }
        if cast.ng_entries.iter().any(|entry| {
            entry
                .account_id
                .as_deref()
                .is_some_and(|account_id| parse_x_username(account_id).is_none())
        }) {
            return Err(invalid_matching_snapshot("キャストNGのX IDが不正です"));
        }
        if casts_by_id.insert(cast.id, cast).is_some() {
            return Err(invalid_matching_snapshot("キャストIDが重複しています"));
        }
    }

    let mut applicants_by_x_id = HashMap::new();
    let require_unique_casts = matching_type_code == "M003";
    let mut total_score = 0.0_f64;
    let mut match_count = 0_i64;
    let mut first_choice_count = 0_i64;
    let mut second_choice_count = 0_i64;
    let mut third_choice_count = 0_i64;
    let mut flat_preference_count = 0_i64;
    let mut unpreferred_count = 0_i64;
    let mut ng_warning_count = 0_i64;
    for applicant in &parsed.applicants {
        let normalized_x_id = parse_x_username(&applicant.user.x_id)
            .ok_or_else(|| invalid_matching_snapshot("応募者のX IDが不正です"))?
            .to_ascii_lowercase();
        if applicant.matches.is_empty() {
            return Err(invalid_matching_snapshot(
                "割り当てがない応募者が含まれています",
            ));
        }
        if applicants_by_x_id
            .insert(normalized_x_id, applicant)
            .is_some()
        {
            return Err(invalid_matching_snapshot("応募者のX IDが重複しています"));
        }
        validate_matching_snapshot_assignments(
            &applicant.matches,
            &casts_by_id,
            require_unique_casts,
        )?;
        for assignment in &applicant.matches {
            let score = assignment.score;
            total_score += score;
            match_count += 1;
            match assignment.rank {
                1 => first_choice_count += 1,
                2 => second_choice_count += 1,
                3 => third_choice_count += 1,
                _ if score > 0.0 => flat_preference_count += 1,
                _ => unpreferred_count += 1,
            }
            if assignment.is_ng_warning {
                ng_warning_count += 1;
            }
        }
    }

    let mut table_user_x_ids = HashSet::new();
    for table_slot in &parsed.table_slots {
        if table_slot.table_index <= 0 {
            return Err(invalid_matching_snapshot("テーブル番号が不正です"));
        }
        validate_matching_snapshot_assignments(
            &table_slot.matches,
            &casts_by_id,
            require_unique_casts,
        )?;
        let Some(table_user) = &table_slot.user else {
            continue;
        };
        let normalized_x_id = parse_x_username(&table_user.x_id)
            .ok_or_else(|| invalid_matching_snapshot("テーブルの応募者X IDが不正です"))?
            .to_ascii_lowercase();
        let applicant = applicants_by_x_id
            .get(&normalized_x_id)
            .ok_or_else(|| invalid_matching_snapshot("テーブルに当選者以外が含まれています"))?;
        if &applicant.user != table_user || applicant.matches != table_slot.matches {
            return Err(invalid_matching_snapshot(
                "応募者とテーブルの割り当てが一致しません",
            ));
        }
        if !table_user_x_ids.insert(normalized_x_id) {
            return Err(invalid_matching_snapshot(
                "同じ応募者が複数のテーブルに割り当てられています",
            ));
        }
    }
    if table_user_x_ids.len() != applicants_by_x_id.len() {
        return Err(invalid_matching_snapshot(
            "テーブルに割り当てられていない応募者がいます",
        ));
    }

    let summary = &parsed.score_summary;
    let counts = [
        summary.first_choice_count,
        summary.second_choice_count,
        summary.third_choice_count,
        summary.flat_preference_count,
        summary.unpreferred_count,
        summary.ng_warning_count,
    ];
    let average_score = total_score / match_count as f64;
    if !summary.total_score.is_finite()
        || !summary.average_score.is_finite()
        || counts.iter().any(|count| *count < 0)
        || !matching_score_is_close(summary.total_score, total_score)
        || !matching_score_is_close(summary.average_score, average_score)
        || summary.first_choice_count != first_choice_count
        || summary.second_choice_count != second_choice_count
        || summary.third_choice_count != third_choice_count
        || summary.flat_preference_count != flat_preference_count
        || summary.unpreferred_count != unpreferred_count
        || summary.ng_warning_count != ng_warning_count
    {
        return Err(invalid_matching_snapshot(
            "割り当てと評価集計が一致しません",
        ));
    }

    Ok(parsed)
}

/** 保存時点の当選者を正として、別の応募者のマッチング結果が混入していないことを確認する。 */
fn validate_matching_snapshot_against_current_lottery(
    conn: &rusqlite::Connection,
    snapshot: &MatchingResultSnapshotInput,
) -> Result<(), String> {
    validate_stored_applicant_x_ids(conn)
        .map_err(|e| sqlite_error("応募データを確認できませんでした", e))?;
    let current_rows = read_current_lottery_result_rows(conn)
        .map_err(|e| sqlite_error("当選者を確認できませんでした", e))?;
    if current_rows.len() != snapshot.applicants.len() {
        return Err(invalid_matching_snapshot("現在の当選者数と一致しません"));
    }
    for (current, saved) in current_rows.iter().zip(&snapshot.applicants) {
        let current_x_id = parse_x_username(&current.x_id)
            .ok_or_else(|| invalid_matching_snapshot("現在の当選者X IDが不正です"))?;
        let saved_x_id = parse_x_username(&saved.user.x_id)
            .ok_or_else(|| invalid_matching_snapshot("応募者のX IDが不正です"))?;
        if !current_x_id.eq_ignore_ascii_case(saved_x_id) {
            return Err(invalid_matching_snapshot(
                "現在の当選者と応募者データが一致しません",
            ));
        }
    }
    Ok(())
}

/** 保存直前のキャスト名簿・出席・NG条件が、結果を計算した時点から変わっていないことを確認する。 */
fn validate_matching_snapshot_against_current_casts(
    conn: &rusqlite::Connection,
    snapshot: &MatchingResultSnapshotInput,
) -> Result<(), String> {
    let mut ng_entries_by_cast = HashMap::<i64, Vec<MatchingSnapshotNgEntryInput>>::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT cast_id, username, userid
                 FROM cast_ng_entries ORDER BY cast_id, id",
            )
            .map_err(|e| sqlite_error("現在のキャストNG条件を確認できませんでした", e))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    MatchingSnapshotNgEntryInput {
                        username: row.get(1)?,
                        account_id: row.get(2)?,
                    },
                ))
            })
            .map_err(|e| sqlite_error("現在のキャストNG条件を確認できませんでした", e))?;
        for row in rows {
            let (cast_id, entry) =
                row.map_err(|e| sqlite_error("現在のキャストNG条件を確認できませんでした", e))?;
            ng_entries_by_cast.entry(cast_id).or_default().push(entry);
        }
    }

    let current_casts = {
        let mut stmt = conn
            .prepare("SELECT id, name, is_attend FROM casts WHERE is_attend = 1 ORDER BY id")
            .map_err(|e| sqlite_error("現在のキャスト条件を確認できませんでした", e))?;
        let values = stmt
            .query_map([], |row| {
                let id = row.get::<_, i64>(0)?;
                Ok(MatchingSnapshotCastInput {
                    id,
                    name: row.get(1)?,
                    is_present: row.get::<_, i64>(2)? == 1,
                    ng_entries: ng_entries_by_cast.remove(&id).unwrap_or_default(),
                })
            })
            .map_err(|e| sqlite_error("現在のキャスト条件を確認できませんでした", e))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| sqlite_error("現在のキャスト条件を確認できませんでした", e))?;
        values
    };

    if current_casts.len() != snapshot.casts.len()
        || snapshot
            .casts
            .iter()
            .zip(&current_casts)
            .any(|(saved, current)| !matching_snapshot_cast_is_current(saved, current))
    {
        return Err(
            "マッチング実行後にキャスト名簿・出席・NG条件が変更されたため保存できません"
                .to_string(),
        );
    }
    Ok(())
}

fn read_validated_matching_snapshot(
    matching_type_code: &str,
    winner_count: i64,
    snapshot_json: &str,
) -> Result<serde_json::Value, String> {
    let snapshot = serde_json::from_str::<serde_json::Value>(snapshot_json)
        .map_err(|_| "保存済みマッチング結果の表示データが壊れています".to_string())?;
    let parsed = validate_matching_snapshot_structure(&snapshot, matching_type_code, winner_count)
        .map_err(|_| "保存済みマッチング結果の表示データが壊れています".to_string())?;
    drop(parsed);
    Ok(snapshot)
}

/** 現在の抽選結果と一致するマッチング表示を、イベント共有DBへ固定結果として保存する。 */
fn save_matching_result_in_connections(
    session_conn: &mut rusqlite::Connection,
    shared_conn: &mut rusqlite::Connection,
    label: &str,
    matching_type_code: &str,
    winner_count: i64,
    snapshot: &serde_json::Value,
) -> Result<i64, String> {
    let trimmed_label = label.trim();
    if trimmed_label.is_empty() || trimmed_label.chars().count() > 200 {
        return Err("マッチング結果の保存名が不正です".to_string());
    }
    let parsed_snapshot =
        validate_matching_snapshot_structure(snapshot, matching_type_code, winner_count)?;
    let snapshot_json = serde_json::to_string(snapshot)
        .map_err(|e| format!("マッチング結果を保存形式へ変換できませんでした: {e}"))?;
    let session_token = read_session_token(session_conn)
        .map_err(|e| sqlite_error("作業セッションを確認できませんでした", e))?;
    if session_has_saved_result(shared_conn, &session_token)
        .map_err(|e| sqlite_error("保存済み結果を確認できませんでした", e))?
    {
        return Err("この作業セッションでは既に結果を保存しています".to_string());
    }

    let session_tx = session_conn
        .transaction()
        .map_err(|e| sqlite_error("マッチング結果の保存を開始できませんでした", e))?;
    let (stored_type, condition_revision, result_revision): (String, i64, Option<i64>) = session_tx
        .query_row(
            "SELECT matching_type_code, condition_revision, lottery_result_revision
             FROM session_workflow_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| sqlite_error("抽選条件を確認できませんでした", e))?;
    if stored_type != matching_type_code || result_revision != Some(condition_revision) {
        return Err("現在の抽選結果と一致しないため、マッチング結果を保存できません".to_string());
    }
    let current_rows = read_current_lottery_result_rows(&session_tx)
        .map_err(|e| sqlite_error("当選者を確認できませんでした", e))?;
    let validated_counts =
        validate_lottery_result_rows_against_workflow(&session_tx, &current_rows)
            .map_err(|e| sqlite_error("現在の抽選結果を確認できませんでした", e))?;
    if validated_counts.winner_count != winner_count {
        return Err("現在の当選者と一致しないため、マッチング結果を保存できません".to_string());
    }
    validate_matching_snapshot_against_current_lottery(&session_tx, &parsed_snapshot)?;
    session_tx
        .commit()
        .map_err(|e| sqlite_error("マッチング結果の保存準備を確定できませんでした", e))?;

    let shared_tx = shared_conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| sqlite_error("マッチング結果の保存を開始できませんでした", e))?;
    validate_matching_snapshot_against_current_casts(&shared_tx, &parsed_snapshot)?;
    shared_tx
        .execute(
            "INSERT INTO saved_results
           (source_session_token, result_type, label, matching_type_code,
            lottery_count, guaranteed_count, winner_count, snapshot_json)
         VALUES (?1, 'matching', ?2, ?3, NULL, NULL, ?4, ?5)",
            rusqlite::params![
                session_token,
                trimmed_label,
                matching_type_code,
                winner_count,
                snapshot_json
            ],
        )
        .map_err(|e| sqlite_error("マッチング結果を保存できませんでした", e))?;
    let saved_result_id = shared_tx.last_insert_rowid();
    shared_tx
        .commit()
        .map_err(|e| sqlite_error("マッチング結果の保存を確定できませんでした", e))?;
    Ok(saved_result_id)
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
        let has_shared_db = entry
            .path()
            .join(SHARED_DIR)
            .join("db")
            .join("stargazer.db")
            .is_file();
        if is_event_directory_name(&name) && has_shared_db {
            names.push(name);
        }
    }

    names.sort();
    Ok(names)
}

fn ensure_event_name_is_unique_ignoring_ascii_case(
    root: &Path,
    event_name: &str,
) -> Result<(), String> {
    let event_names = list_event_names_at(root)
        .map_err(|e| format!("イベント名の重複を確認できませんでした: {e}"))?;
    if event_names
        .iter()
        .any(|existing_name| existing_name.eq_ignore_ascii_case(event_name))
    {
        return Err(format!("イベント '{event_name}' は既に存在します"));
    }
    Ok(())
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

/** イベント共有DBから、内部整合を確認できた保存済み抽選結果を取得する。 */
#[tauri::command]
fn list_event_saved_lottery_results(
    event_name: String,
) -> Result<Vec<EventSavedLotteryResultSummary>, String> {
    validate_event_name(&event_name)?;
    let (_, conn) = open_event_shared_db(&event_name)?;
    let result_ids = {
        let mut stmt = conn
            .prepare(
                "SELECT id FROM saved_results
                 WHERE result_type = 'lottery'
                 ORDER BY created_at DESC, id DESC",
            )
            .map_err(|e| sqlite_error("保存済み抽選結果を読み込めませんでした", e))?;
        let values = stmt
            .query_map([], |row| row.get::<_, i64>(0))
            .map_err(|e| sqlite_error("保存済み抽選結果を読み込めませんでした", e))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| sqlite_error("保存済み抽選結果を読み込めませんでした", e))?;
        values
    };
    result_ids
        .into_iter()
        .map(|saved_result_id| {
            read_validated_saved_lottery_result(&conn, saved_result_id).map(|(_, summary)| summary)
        })
        .collect()
}

/** イベント共有DBから、内部整合を確認できた保存済みマッチング結果を取得する。 */
#[tauri::command]
fn list_event_saved_matching_results(
    event_name: String,
) -> Result<Vec<EventSavedMatchingResultSummary>, String> {
    validate_event_name(&event_name)?;
    let (_, conn) = open_event_shared_db(&event_name)?;
    let rows = {
        let mut stmt = conn
            .prepare(
                "SELECT id, label, matching_type_code, winner_count, created_at, snapshot_json
                 FROM saved_results
                 WHERE result_type = 'matching'
                 ORDER BY created_at DESC, id DESC",
            )
            .map_err(|e| sqlite_error("保存済みマッチング結果を読み込めませんでした", e))?;
        let values = stmt
            .query_map([], |row| {
                Ok((
                    EventSavedMatchingResultSummary {
                        saved_result_id: row.get(0)?,
                        label: row.get(1)?,
                        matching_type_code: row.get(2)?,
                        winner_count: row.get(3)?,
                        created_at: row.get(4)?,
                    },
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| sqlite_error("保存済みマッチング結果を読み込めませんでした", e))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| sqlite_error("保存済みマッチング結果を読み込めませんでした", e))?;
        values
    };
    rows.into_iter()
        .map(|(summary, snapshot_json)| {
            read_validated_matching_snapshot(
                &summary.matching_type_code,
                summary.winner_count,
                &snapshot_json,
            )
            .map(|_| summary)
        })
        .collect()
}

/** 保存済みマッチング結果1件を、現在の作業セッションから独立して取得する。 */
#[tauri::command]
fn get_event_saved_matching_result(
    event_name: String,
    saved_result_id: i64,
) -> Result<EventSavedMatchingResultDetail, String> {
    validate_event_name(&event_name)?;
    if saved_result_id <= 0 {
        return Err("保存済みマッチング結果を特定できません".to_string());
    }
    let (_, conn) = open_event_shared_db(&event_name)?;
    let row = conn
        .query_row(
            "SELECT label, matching_type_code, winner_count, snapshot_json, created_at
             FROM saved_results
             WHERE id = ?1 AND result_type = 'matching'",
            [saved_result_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|e| sqlite_error("保存済みマッチング結果を読み込めませんでした", e))?
        .ok_or_else(|| "保存済みマッチング結果が見つかりません".to_string())?;
    let snapshot = read_validated_matching_snapshot(&row.1, row.2, &row.3)?;
    Ok(EventSavedMatchingResultDetail {
        saved_result_id,
        label: row.0,
        matching_type_code: row.1,
        winner_count: row.2,
        created_at: row.4,
        snapshot,
    })
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
        let has_session_db = entry.path().join("db").join("stargazer.db").is_file();
        if validate_timestamp(&timestamp).is_ok() && has_session_db {
            sessions.push(timestamp);
        }
    }

    // 単一セッション不変条件の検査結果を決定的にするため、新しい名前から返す。
    sessions.sort_by(|a, b| b.cmp(a));
    Ok(sessions)
}

#[cfg(test)]
fn list_sessions_at(dir: &Path) -> Vec<String> {
    list_session_names_at(dir).unwrap_or_default()
}

fn list_in_progress_session_directories_at(dir: &Path) -> std::io::Result<Vec<(String, PathBuf)>> {
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
        if validate_timestamp(&timestamp).is_ok()
            && entry.path().join(IN_PROGRESS_SESSION_MARKER).is_file()
        {
            sessions.push((timestamp, entry.path()));
        }
    }
    sessions.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(sessions)
}

fn quarantined_session_timestamp(directory_name: &str) -> Option<&str> {
    let remainder = directory_name.strip_prefix('.')?;
    let (timestamp, suffix) = remainder.split_once(".discarding-")?;
    if suffix.is_empty() || validate_timestamp(timestamp).is_err() {
        return None;
    }
    Some(timestamp)
}

fn list_quarantined_session_directories_at(dir: &Path) -> std::io::Result<Vec<(String, PathBuf)>> {
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
        let Ok(directory_name) = entry.file_name().into_string() else {
            continue;
        };
        let Some(timestamp) = quarantined_session_timestamp(&directory_name) else {
            continue;
        };
        sessions.push((timestamp.to_string(), entry.path()));
    }
    sessions.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(sessions)
}

fn quarantine_in_progress_session(directory: &Path, timestamp: &str) -> Result<PathBuf, String> {
    let parent = directory
        .parent()
        .ok_or_else(|| "操作中セッションの保存先が不正です".to_string())?;
    for _ in 0..MAX_STAGING_DIRECTORY_ATTEMPTS {
        let sequence = STAGING_DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let quarantine_dir = parent.join(format!(
            ".{timestamp}.discarding-{}-{sequence}",
            std::process::id()
        ));
        match std::fs::rename(directory, &quarantine_dir) {
            Ok(()) => return Ok(quarantine_dir),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "操作中セッションを破棄対象へ移動できませんでした: {error}"
                ));
            }
        }
    }
    Err("重複しない破棄用ディレクトリ名を確保できませんでした".to_string())
}

fn remove_quarantined_session_directory(directory: &Path) -> Result<(), String> {
    match std::fs::remove_dir_all(directory) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "破棄対象へ移動済みですが、物理削除を完了できませんでした: {error}"
        )),
    }
}

fn discard_session_directory(directory: &Path, timestamp: &str) -> Result<(), String> {
    if !directory
        .try_exists()
        .map_err(|e| format!("作業セッションの保存先を確認できませんでした: {e}"))?
    {
        return Ok(());
    }
    let quarantine_dir = quarantine_in_progress_session(directory, timestamp)?;
    remove_quarantined_session_directory(&quarantine_dir)
}

/** 作業セッションの作成・破棄・イベント移動を同時実行させない。 */
fn lock_work_session_lifecycle() -> Result<MutexGuard<'static, ()>, String> {
    WORK_SESSION_LIFECYCLE_LOCK
        .lock()
        .map_err(|_| "作業セッションの排他状態を取得できませんでした".to_string())
}

/** 指定したDataルートで、強制終了により残った作業セッションだけを破棄する。 */
fn cleanup_in_progress_sessions_at(root: &Path) -> Result<(), String> {
    let event_names = list_event_names_at(root)
        .map_err(|e| format!("操作中セッションのイベント一覧を確認できませんでした: {e}"))?;
    let mut failures = Vec::new();
    for event_name in event_names {
        let event_path = root.join(&event_name);
        match list_quarantined_session_directories_at(&event_path) {
            Ok(directories) => {
                for (_, directory) in directories {
                    if let Err(error) = remove_quarantined_session_directory(&directory) {
                        failures.push(format!("{event_name}: {error}"));
                    }
                }
            }
            Err(error) => failures.push(format!(
                "{event_name}: 破棄未完了セッションを確認できませんでした: {error}"
            )),
        }
        match list_in_progress_session_directories_at(&event_path) {
            Ok(directories) => {
                for (timestamp, directory) in directories {
                    if let Err(error) = discard_session_directory(&directory, &timestamp) {
                        failures.push(format!("{event_name} / {timestamp}: {error}"));
                    }
                }
            }
            Err(error) => failures.push(format!(
                "{event_name}: 操作中セッションを確認できませんでした: {error}"
            )),
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("\n"))
    }
}

/** 強制終了で残った作業セッションは、保存済み抽選・マッチング結果と無関係に破棄する。 */
fn cleanup_in_progress_sessions() -> Result<(), String> {
    let _lifecycle_guard = lock_work_session_lifecycle()?;
    cleanup_in_progress_sessions_at(&resolve_data_root())
}

/** 起動時に前回の作業セッションを完全削除できなかった場合だけ、再起動案内と原因を返す。 */
#[tauri::command]
fn get_startup_session_cleanup_error() -> Option<String> {
    STARTUP_SESSION_CLEANUP_ERROR
        .get()
        .and_then(|error| error.as_ref())
        .map(|error| {
            format!(
                "前回終了時の作業セッションを完全に削除できませんでした。新しい作業を開始できない場合は、アプリを終了してから再度起動してください。\n{error}"
            )
        })
}

/** 接続を閉じた現在の作業セッションだけを、イベント共有結果へ影響させず破棄する。 */
#[tauri::command]
fn discard_session(event_name: String, timestamp: String) -> Result<(), String> {
    validate_event_name(&event_name)?;
    validate_timestamp(&timestamp)?;
    let _lifecycle_guard = lock_work_session_lifecycle()?;
    let directory = session_dir(&event_name, &timestamp);
    if !directory.exists() {
        return Ok(());
    }
    if !session_in_progress_marker_path(&event_name, &timestamp).is_file() {
        return Err("破棄対象が現在の作業セッションではありません".to_string());
    }
    let (_, conn) = open_session_read_only_db(&event_name, &timestamp)?;
    drop(conn);
    discard_session_directory(&directory, &timestamp)
}

/** 応募データ保存まで成功したセッションだけを、操作中の新規取込として公開する。 */
fn ensure_no_work_session() -> Result<(), String> {
    let root = resolve_data_root();
    let event_names = list_event_names_at(&root)
        .map_err(|e| format!("作業セッションのイベント一覧を確認できませんでした: {e}"))?;
    for event_name in event_names {
        let sessions = list_session_names_at(&event_dir(&event_name)).map_err(|e| {
            format!("イベント '{event_name}' の作業セッションを確認できませんでした: {e}")
        })?;
        if !sessions.is_empty() {
            return Err(format!(
                "イベント '{event_name}' に別の作業セッションが残っています。先に現在の作業を終了してください"
            ));
        }
    }
    Ok(())
}

/** 応募データ保存まで成功した一件だけを、現在の作業セッションとして公開する。 */
#[tauri::command]
fn create_import_session_atomic(
    event_name: String,
    users: Vec<ApplicantInput>,
) -> Result<String, String> {
    validate_event_name(&event_name)?;
    if users.is_empty() {
        return Err("取り込む応募データがありません".to_string());
    }
    let (_, shared_conn) = open_event_shared_db(&event_name)?;
    drop(shared_conn);
    let _lifecycle_guard = lock_work_session_lifecycle()?;
    ensure_no_work_session()?;
    let timestamp = now_local_timestamp();
    validate_timestamp(&timestamp)?;
    let final_dir = session_dir(&event_name, &timestamp);
    let relative_db_path = Path::new("db").join("stargazer.db");
    create_initialized_directory_atomically(
        &final_dir,
        &relative_db_path,
        SESSION_SCHEMA,
        "取込セッション",
        SESSION_REQUIRED_TABLES,
        SESSION_SCHEMA_QUERIES,
        |conn| {
            persist_applicants_in_connection(conn, &users)
                .map_err(|e| sqlite_error("応募者一覧の保存に失敗しました", e))?;
            write_session_in_progress_marker(conn)
        },
    )?;
    Ok(timestamp)
}

/** 保存済み抽選の自己完結スナップショットから、後続マッチング用セッションを作成する。 */
#[tauri::command]
fn create_session_from_saved_lottery_atomic(
    event_name: String,
    saved_result_id: i64,
) -> Result<String, String> {
    validate_event_name(&event_name)?;
    let (_, shared_conn) = open_event_shared_db(&event_name)?;
    let (snapshot, _) = read_validated_saved_lottery_result(&shared_conn, saved_result_id)?;
    drop(shared_conn);
    let _lifecycle_guard = lock_work_session_lifecycle()?;
    ensure_no_work_session()?;
    let timestamp = now_local_timestamp();
    validate_timestamp(&timestamp)?;
    let final_dir = session_dir(&event_name, &timestamp);
    let relative_db_path = Path::new("db").join("stargazer.db");
    create_initialized_directory_atomically(
        &final_dir,
        &relative_db_path,
        SESSION_SCHEMA,
        "取込セッション",
        SESSION_REQUIRED_TABLES,
        SESSION_SCHEMA_QUERIES,
        |conn| {
            persist_applicants_in_connection(conn, &snapshot.applicants)
                .map_err(|e| sqlite_error("保存済み抽選の応募データを復元できませんでした", e))?;
            persist_session_workflow_state_in_connection(conn, &snapshot.workflow)
                .map_err(|e| sqlite_error("保存済み抽選の条件を復元できませんでした", e))?;
            let condition_revision = conn
                .query_row(
                    "SELECT condition_revision FROM session_workflow_state WHERE id = 1",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|e| sqlite_error("復元した抽選条件を確認できませんでした", e))?;
            replace_lottery_results_in_connection(conn, &snapshot.winners, condition_revision)
                .map_err(|e| sqlite_error("保存済み抽選の当選者を復元できませんでした", e))?;
            conn.execute(
                "UPDATE session_workflow_state SET is_lottery_read_only = 1 WHERE id = 1",
                [],
            )
            .map_err(|e| sqlite_error("復元した抽選状態を固定できませんでした", e))?;
            write_session_in_progress_marker(conn)
        },
    )?;
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
    reject_session_with_saved_result(&event_name, &conn)?;
    persist_applicants_in_connection(&mut conn, &users)
        .map_err(|e| sqlite_error("応募者一覧の保存に失敗しました", e))
}

/** 応募者1件の希望キャストを現在の名簿から選び直して保存する。 */
#[tauri::command]
fn update_applicant_cast_preferences_atomic(
    event_name: String,
    timestamp: String,
    applicant_id: i64,
    preferences: ApplicantCastPreferencesInput,
) -> Result<(), String> {
    let shared_conn = open_shared_write_connection(&event_name)?;
    let resolved_preferences = resolve_applicant_cast_preferences(&shared_conn, &preferences)
        .map_err(|e| sqlite_error("希望キャストの確認に失敗しました", e))?;
    drop(shared_conn);

    let mut session_conn = open_session_write_connection(&event_name, &timestamp)?;
    reject_session_with_saved_result(&event_name, &session_conn)?;
    update_applicant_cast_preferences_in_connection(
        &mut session_conn,
        applicant_id,
        &resolved_preferences,
    )
    .map_err(|e| sqlite_error("希望キャストの保存に失敗しました", e))
}

/** 応募者1件を安定IDで削除し、残りの応募者は置換しない。 */
#[tauri::command]
fn delete_applicant_atomic(
    event_name: String,
    timestamp: String,
    applicant_id: i64,
) -> Result<(), String> {
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    reject_session_with_saved_result(&event_name, &conn)?;
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
    reject_session_with_saved_result(&event_name, &conn)?;
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
    reject_session_with_saved_result(&event_name, &conn)?;
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

fn read_event_meta_value(
    conn: &rusqlite::Connection,
    key: &str,
) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
        row.get::<_, Option<String>>(0)
    })
    .optional()
    .map(Option::flatten)
}

/** 選択イベントの写真と説明メモを、使用中のDB接続とは分離して読み取る。 */
#[tauri::command]
fn get_event_meta_read_only(event_name: String) -> Result<EventMetaOutput, String> {
    validate_event_name(&event_name)?;
    let (_, conn) = open_event_shared_read_only_db(&event_name)?;
    Ok(EventMetaOutput {
        notes: read_event_meta_value(&conn, "notes")
            .map_err(|e| sqlite_error("イベント説明メモを読み込めませんでした", e))?,
        photo_data_url: read_event_meta_value(&conn, "photo_data_url")
            .map_err(|e| sqlite_error("イベント写真を読み込めませんでした", e))?,
    })
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
    reject_session_with_saved_result(&event_name, &conn)?;
    replace_lottery_results_in_connection(&mut conn, &rows, expected_condition_revision)
        .map_err(|e| sqlite_error("抽選結果の保存に失敗しました", e))
}

/** 現在の抽選結果をイベント共有DBへ保存し、保存結果IDを返す。 */
#[tauri::command]
fn save_lottery_result_atomic(
    event_name: String,
    timestamp: String,
    label: String,
) -> Result<i64, String> {
    let mut session_conn = open_session_write_connection(&event_name, &timestamp)?;
    let mut shared_conn = open_shared_write_connection(&event_name)?;
    save_lottery_result_in_connections(&mut session_conn, &mut shared_conn, &label)
}

/** 現在表示しているマッチング結果をイベント共有DBへ固定結果として保存する。 */
#[tauri::command]
fn save_matching_result_atomic(
    event_name: String,
    timestamp: String,
    label: String,
    matching_type_code: String,
    winner_count: i64,
    snapshot: serde_json::Value,
) -> Result<i64, String> {
    let mut session_conn = open_session_write_connection(&event_name, &timestamp)?;
    let mut shared_conn = open_shared_write_connection(&event_name)?;
    save_matching_result_in_connections(
        &mut session_conn,
        &mut shared_conn,
        &label,
        &matching_type_code,
        winner_count,
        &snapshot,
    )
}

#[tauri::command]
fn create_event(event_name: String) -> Result<(), String> {
    validate_event_name(&event_name)?;
    ensure_event_name_is_unique_ignoring_ascii_case(&resolve_data_root(), &event_name)?;
    // イベント作成時は共有DBだけを作る。取込セッションはCSV取込時に明示的に作成する。
    create_event_shared_db(&event_name)
}

#[tauri::command]
fn delete_event(event_name: String) -> Result<(), String> {
    validate_event_name(&event_name)?;
    let _lifecycle_guard = lock_work_session_lifecycle()?;
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
    let _lifecycle_guard = lock_work_session_lifecycle()?;
    let old_dir = event_dir(&old_name);
    let new_dir = event_dir(&new_name);
    if !old_dir.exists() {
        return Err(format!("イベント '{old_name}' が存在しません"));
    }
    ensure_event_name_is_unique_ignoring_ascii_case(&resolve_data_root(), &new_name)?;
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
    if trimmed.is_empty() {
        return Err("開くURLが指定されていません".to_string());
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
    let webview_data_dir = resolve_webview_data_root();
    // 事前作成に失敗してもWebView側の作成可否へ委ね、アプリ起動を継続する。
    let _ = std::fs::create_dir_all(&webview_data_dir);
    std::env::set_var(
        "WEBVIEW2_USER_DATA_FOLDER",
        webview_data_dir.to_string_lossy().to_string(),
    );

    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        // 二重起動したプロセスが、先に起動している側の操作中セッションを破棄しないようにする。
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|_| {
            // 主プロセスの確定後にだけ、前回の強制終了で残った未保存セッションを回収する。
            let _ = STARTUP_SESSION_CLEANUP_ERROR.set(cleanup_in_progress_sessions().err());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            register_to_stellarecord,
            check_stellarecord_available,
            list_events,
            get_startup_session_cleanup_error,
            get_event_shared_db_uri,
            list_event_saved_lottery_results,
            list_event_saved_matching_results,
            get_event_saved_matching_result,
            create_import_session_atomic,
            create_session_from_saved_lottery_atomic,
            discard_session,
            get_session_db_uri,
            persist_applicants_atomic,
            update_applicant_cast_preferences_atomic,
            delete_applicant_atomic,
            persist_session_workflow_state_atomic,
            replace_applicant_guarantees_atomic,
            insert_cast_atomic,
            update_cast_fields_atomic,
            set_all_cast_presence_atomic,
            rename_cast_atomic,
            delete_cast_atomic,
            record_cast_attendance_atomic,
            get_event_meta_read_only,
            set_event_meta_atomic,
            replace_lottery_results_atomic,
            save_lottery_result_atomic,
            save_matching_result_atomic,
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

    fn open_initialized_shared_db(path: &Path) -> rusqlite::Result<Connection> {
        let mut conn = Connection::open(path)?;
        configure_connection(&conn)?;
        initialize_schema(
            &mut conn,
            SHARED_SCHEMA,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
        )?;
        Ok(conn)
    }

    fn open_initialized_session_db(path: &Path) -> rusqlite::Result<Connection> {
        let mut conn = Connection::open(path)?;
        configure_connection(&conn)?;
        initialize_schema(
            &mut conn,
            SESSION_SCHEMA,
            "取込セッション",
            SESSION_REQUIRED_TABLES,
            SESSION_SCHEMA_QUERIES,
        )?;
        Ok(conn)
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
            preference_mode: "ranked".to_string(),
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
    fn event_names_are_not_restricted_by_internal_directory_names() {
        for name in [
            SHARED_DIR,
            "SHARED",
            WEBVIEW_DATA_DIR,
            "ebwebview",
            "db",
            "LOGS",
        ] {
            assert!(validate_event_name(name).is_ok());
            assert!(is_event_directory_name(name));
        }
    }

    #[test]
    fn event_directory_filter_accepts_visible_event_names_only() {
        assert!(is_event_directory_name("Event_2026-06"));
        assert!(!is_event_directory_name("Manual Test Event"));
        assert!(!is_event_directory_name(".system"));
        assert!(!is_event_directory_name("Event.Name"));
        assert!(!is_event_directory_name(" Event"));
    }

    #[test]
    fn event_name_validation_matches_frontend_path_rules() {
        assert!(validate_event_name(&"A".repeat(64)).is_ok());
        assert!(validate_event_name(&"A".repeat(65)).is_err());
        for name in ["CON", "prn", "Aux", "NUL", "COM1", "com9", "LPT1", "lpt9"] {
            assert!(
                validate_event_name(name).is_err(),
                "{name} should be rejected"
            );
        }
        for name in ["CONCERT", "COM0", "COM10", "LPT0", "LPT10"] {
            assert!(
                validate_event_name(name).is_ok(),
                "{name} should be accepted"
            );
        }
    }

    #[test]
    fn max_length_event_database_can_be_created_beyond_legacy_windows_path_limit() {
        let dir = TestDir::new("long-event-path");
        let long_root = dir.0.join("a".repeat(120)).join("b".repeat(40));
        let event_name = "E".repeat(64);
        let final_dir = long_root.join(&event_name);
        let relative_db_path = Path::new(SHARED_DIR).join("db").join("stargazer.db");
        let expected_db_path = final_dir.join(&relative_db_path);

        assert!(validate_event_name(&event_name).is_ok());
        assert!(expected_db_path.to_string_lossy().encode_utf16().count() > 260);

        let db_path = create_initialized_directory_atomically(
            &final_dir,
            &relative_db_path,
            SHARED_SCHEMA,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
            |_| Ok(()),
        )
        .expect("長いパスでもイベントDBを作成できる必要があります");

        assert_eq!(db_path, expected_db_path);
        assert!(db_path.is_file());
        assert_eq!(list_events_at(&long_root), vec![event_name]);
    }

    #[test]
    fn startup_cleanup_discards_only_in_progress_and_quarantined_sessions() {
        let dir = TestDir::new("startup-session-cleanup");
        let event_dir = dir.0.join("Event_2026");
        let shared_db = event_dir.join(SHARED_DIR).join("db").join("stargazer.db");
        std::fs::create_dir_all(shared_db.parent().expect("shared DB parent"))
            .expect("shared DB directory");
        std::fs::write(&shared_db, b"").expect("shared DB marker");

        let in_progress = event_dir.join("20260808120000");
        std::fs::create_dir_all(&in_progress).expect("in-progress session");
        std::fs::write(
            in_progress.join(IN_PROGRESS_SESSION_MARKER),
            b"in progress\n",
        )
        .expect("in-progress marker");

        let quarantined = event_dir.join(".20260808130000.discarding-test");
        std::fs::create_dir_all(&quarantined).expect("quarantined session");
        let unrelated = event_dir.join("20260808140000");
        std::fs::create_dir_all(&unrelated).expect("unmarked session");

        cleanup_in_progress_sessions_at(&dir.0).expect("startup cleanup");

        assert!(!in_progress.exists());
        assert!(!quarantined.exists());
        assert!(unrelated.exists());
        assert!(shared_db.exists());
    }

    #[test]
    fn missing_database_open_does_not_create_files() {
        let dir = TestDir::new("open-existing-database");
        let db_path = dir.0.join("missing").join("shared.db");

        assert!(open_existing_schema_connection(
            &db_path,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
        )
        .is_err());
        assert!(!db_path.exists());
        assert!(!db_path
            .parent()
            .expect("DB親ディレクトリが必要です")
            .exists());

        let conn = create_schema_connection(
            &db_path,
            SHARED_SCHEMA,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
        )
        .expect("新規作成APIではDBを作成できる必要があります");
        drop(conn);
        assert!(db_path.is_file());
        assert!(create_schema_connection(
            &db_path,
            SHARED_SCHEMA,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
        )
        .is_err());
    }

    #[test]
    fn uninitialized_existing_sqlite_is_not_claimed_as_stargazer_database() -> rusqlite::Result<()>
    {
        let dir = TestDir::new("uninitialized-existing-database");
        let db_path = dir.db_path("uninitialized.db");
        drop(Connection::open(&db_path)?);

        assert!(open_existing_schema_connection(
            &db_path,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
        )
        .is_err());
        let conn = Connection::open(&db_path)?;
        let table_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(table_count, 0);
        Ok(())
    }

    #[test]
    fn new_shared_database_uses_current_schema() -> rusqlite::Result<()> {
        let dir = TestDir::new("current-shared-schema");
        let db_path = dir.db_path("shared.db");
        let conn = create_schema_connection(
            &db_path,
            SHARED_SCHEMA,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
        )
        .expect("共有DBを新規作成できる必要があります");

        validate_current_schema(
            &conn,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
        )?;
        let foreign_keys: i64 = conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
        assert_eq!(foreign_keys, 1);
        Ok(())
    }

    #[test]
    fn new_session_database_uses_current_schema_and_default_workflow() -> rusqlite::Result<()> {
        let dir = TestDir::new("current-session-schema");
        let db_path = dir.db_path("session.db");
        let conn = create_schema_connection(
            &db_path,
            SESSION_SCHEMA,
            "取込セッション",
            SESSION_REQUIRED_TABLES,
            SESSION_SCHEMA_QUERIES,
        )
        .expect("セッションDBを新規作成できる必要があります");

        validate_current_schema(
            &conn,
            "取込セッション",
            SESSION_REQUIRED_TABLES,
            SESSION_SCHEMA_QUERIES,
        )?;
        let workflow: (String, i64, Option<i64>) = conn.query_row(
            "SELECT matching_type_code, condition_revision, lottery_result_revision
             FROM session_workflow_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        assert_eq!(workflow, ("M001".to_string(), 0, None));
        Ok(())
    }

    #[test]
    fn failed_atomic_database_creation_leaves_no_visible_directory() {
        let dir = TestDir::new("atomic-create-failure");
        let final_dir = dir.0.join("Failed Event");
        let relative_db_path = Path::new(SHARED_DIR).join("db").join("stargazer.db");

        let result = create_initialized_directory_atomically(
            &final_dir,
            &relative_db_path,
            SHARED_SCHEMA,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
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
        let final_dir = dir.0.join("Completed_Event");
        let relative_db_path = Path::new(SHARED_DIR).join("db").join("stargazer.db");

        let db_path = create_initialized_directory_atomically(
            &final_dir,
            &relative_db_path,
            SHARED_SCHEMA,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
            |_| Ok(()),
        )
        .expect("イベントDBを作成できる必要があります");

        assert_eq!(db_path, final_dir.join(relative_db_path));
        assert_eq!(list_events_at(&dir.0), vec!["Completed_Event".to_string()]);
    }

    #[test]
    fn database_family_mismatch_is_rejected() -> rusqlite::Result<()> {
        let dir = TestDir::new("database-family");
        let session_path = dir.db_path("session.db");
        drop(open_initialized_session_db(&session_path)?);

        assert!(open_existing_schema_connection(
            &session_path,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
        )
        .is_err());

        let shared_path = dir.db_path("shared.db");
        drop(open_initialized_shared_db(&shared_path)?);
        assert!(open_existing_schema_connection(
            &shared_path,
            "取込セッション",
            SESSION_REQUIRED_TABLES,
            SESSION_SCHEMA_QUERIES,
        )
        .is_err());
        assert!(session_path.is_file());
        Ok(())
    }

    #[test]
    fn shared_database_missing_required_table_is_rejected() -> rusqlite::Result<()> {
        let dir = TestDir::new("shared-missing-table");
        let db_path = dir.db_path("shared.db");
        let conn = open_initialized_shared_db(&db_path)?;
        conn.execute_batch("DROP TABLE settings;")?;
        drop(conn);

        let error = open_existing_schema_connection(
            &db_path,
            "イベント共有",
            SHARED_REQUIRED_TABLES,
            SHARED_SCHEMA_QUERIES,
        )
        .expect_err("必須テーブルがない共有DBを開いてはいけません");
        assert!(error.contains("settings"));
        Ok(())
    }

    #[test]
    fn session_database_missing_required_column_is_rejected() -> rusqlite::Result<()> {
        let dir = TestDir::new("session-missing-column");
        let db_path = dir.db_path("session.db");
        let conn = open_initialized_session_db(&db_path)?;
        conn.execute_batch(
            "DROP INDEX idx_applicant_casts_cast_id;
             ALTER TABLE applicant_casts DROP COLUMN cast_id;",
        )?;
        drop(conn);

        let error = open_existing_schema_connection(
            &db_path,
            "取込セッション",
            SESSION_REQUIRED_TABLES,
            SESSION_SCHEMA_QUERIES,
        )
        .expect_err("必須カラムがないセッションDBを開いてはいけません");
        assert!(error.contains("現行schema"));
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
            vec!["20260725120000".to_string(), "20260724120000".to_string(),]
        );
    }

    #[test]
    fn same_cast_name_does_not_share_attendance_between_event_dbs() -> rusqlite::Result<()> {
        let dir = TestDir::new("event-attendance-isolation");
        let source = open_initialized_shared_db(&dir.db_path("source.db"))?;
        let target = open_initialized_shared_db(&dir.db_path("target.db"))?;
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
    fn persist_applicants_uses_explicit_cast_ids_including_nulls() -> rusqlite::Result<()> {
        let dir = TestDir::new("persist-applicant-cast-ids");
        let mut conn = open_initialized_session_db(&dir.db_path("session.db"))?;
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
            preference_mode: "ranked".to_string(),
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
                ("explicit".to_string(), "Cast A".to_string(), Some(900)),
                ("explicit".to_string(), "Cast B".to_string(), None),
                ("explicit".to_string(), "Cast C".to_string(), None),
            ]
        );
        Ok(())
    }

    #[test]
    fn invalid_applicant_payload_is_rejected_before_replacement() -> rusqlite::Result<()> {
        let dir = TestDir::new("invalid-applicant-payload");
        let mut conn = open_initialized_session_db(&dir.db_path("session.db"))?;
        conn.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES ('@existing', 'ranked')",
            [],
        )?;
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
        let mut conn = open_initialized_session_db(&dir.db_path("session.db"))?;
        conn.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES ('@Duplicate', 'ranked')",
            [],
        )?;
        let duplicate_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES (' @duplicate ', 'ranked')",
            [],
        )?;
        conn.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES ('', 'ranked')",
            [],
        )?;
        let empty_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 0)",
            [duplicate_id],
        )?;
        delete_applicant_in_connection(&mut conn, duplicate_id)?;
        assert!(validate_stored_applicant_x_ids(&conn).is_err());
        delete_applicant_in_connection(&mut conn, empty_id)?;

        validate_stored_applicant_x_ids(&conn)?;
        let remaining_x_id: String =
            conn.query_row("SELECT x_id FROM applicants", [], |row| row.get(0))?;
        let lottery_result_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM lottery_results", [], |row| row.get(0))?;
        let (condition_revision, result_revision): (i64, Option<i64>) = conn.query_row(
            "SELECT condition_revision, lottery_result_revision
             FROM session_workflow_state
             WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        assert_eq!(remaining_x_id, " @duplicate ");
        assert_eq!(lottery_result_count, 0);
        assert_eq!(condition_revision, 2);
        assert_eq!(result_revision, None);
        Ok(())
    }

    #[test]
    fn lottery_result_cannot_be_replaced_while_stored_x_ids_are_invalid() -> rusqlite::Result<()> {
        let dir = TestDir::new("invalid-stored-x-id-lottery");
        let mut conn = open_initialized_session_db(&dir.db_path("session.db"))?;
        conn.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES ('@Duplicate', 'ranked')",
            [],
        )?;
        let applicant_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES (' @duplicate ', 'ranked')",
            [],
        )?;
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
    fn applicant_validation_rejects_inconsistent_preference_payloads() {
        let mut invalid_mode = applicant_input("@invalid-mode");
        invalid_mode.preference_mode = "unknown".to_string();
        assert!(validate_applicant_inputs(&[invalid_mode]).is_err());

        let mut invalid_empty_cast = applicant_input("@invalid-empty-cast");
        invalid_empty_cast.casts = vec![String::new()];
        invalid_empty_cast.cast_ids = vec![Some(1)];
        assert!(validate_applicant_inputs(&[invalid_empty_cast]).is_err());
    }

    #[test]
    fn rename_cast_preserves_id_and_session_snapshot() -> rusqlite::Result<()> {
        let dir = TestDir::new("rename-cast-stable-id");
        let mut shared = open_initialized_shared_db(&dir.db_path("shared.db"))?;
        let cast_id = insert_cast_in_connection(&mut shared, &cast_input("旧キャスト"))?;
        let session = open_initialized_session_db(&dir.db_path("session.db"))?;
        session.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES ('@applicant', 'ranked')",
            [],
        )?;
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
        let mut shared = open_initialized_shared_db(&dir.db_path("shared.db"))?;
        let original_id = insert_cast_in_connection(&mut shared, &cast_input("Cast A"))?;
        let session = open_initialized_session_db(&dir.db_path("session.db"))?;
        session.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES ('@applicant', 'ranked')",
            [],
        )?;
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
    fn persist_applicants_failure_keeps_existing_rows_and_lottery_result() -> rusqlite::Result<()> {
        let dir = TestDir::new("persist-applicants-rollback");
        let mut conn = open_initialized_session_db(&dir.db_path("session.db"))?;
        conn.execute(
            "INSERT INTO applicants (x_id, name, preference_mode) VALUES (?1, ?2, 'ranked')",
            rusqlite::params!["@old_user", "Old User"],
        )?;
        let old_applicant_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, 0)",
            [old_applicant_id],
        )?;
        conn.execute_batch(
            "CREATE TRIGGER reject_new_applicant
             BEFORE INSERT ON applicants
             WHEN NEW.x_id = 'duplicate'
             BEGIN
               SELECT RAISE(ABORT, 'テスト用の応募者保存失敗');
             END;",
        )?;

        let users = vec![
            ApplicantInput {
                name: Some("New User".to_string()),
                x_id: "@duplicate".to_string(),
                vrc_url: None,
                casts: vec!["Cast A".to_string()],
                cast_ids: vec![None],
                preference_mode: "ranked".to_string(),
                is_guaranteed: false,
                raw_extra: vec![],
            },
            ApplicantInput {
                name: Some("Duplicate User".to_string()),
                x_id: "@duplicate".to_string(),
                vrc_url: None,
                casts: vec![],
                cast_ids: vec![],
                preference_mode: "flat".to_string(),
                is_guaranteed: true,
                raw_extra: vec![],
            },
        ];

        assert!(persist_applicants_in_connection(&mut conn, &users).is_err());
        let applicant_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM applicants", [], |row| row.get(0))?;
        let lottery_result_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM lottery_results", [], |row| row.get(0))?;

        assert_eq!(applicant_count, 1);
        assert_eq!(lottery_result_count, 1);
        Ok(())
    }

    #[test]
    fn applicant_replacement_advances_revision_and_rejects_old_lottery() -> rusqlite::Result<()> {
        let dir = TestDir::new("applicant-replacement-revision");
        let mut conn = open_initialized_session_db(&dir.db_path("session.db"))?;

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
        let mut conn = open_initialized_session_db(&dir.db_path("session.db"))?;
        conn.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES ('@old_user', 'ranked')",
            [],
        )?;
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
        let mut conn = open_initialized_session_db(&dir.db_path("session.db"))?;
        conn.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES ('@first', 'ranked')",
            [],
        )?;
        let first_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO applicants (x_id, preference_mode) VALUES ('@second', 'ranked')",
            [],
        )?;
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

    fn prepare_current_lottery_result(conn: &mut Connection) -> rusqlite::Result<()> {
        let mut guaranteed = applicant_input("@guaranteed");
        guaranteed.is_guaranteed = true;
        persist_applicants_in_connection(conn, &[guaranteed, applicant_input("@lottery")])?;
        let condition_revision = conn.query_row(
            "SELECT condition_revision FROM session_workflow_state WHERE id = 1",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        replace_lottery_results_in_connection(
            conn,
            &[
                LotteryResultInput {
                    x_id: "@guaranteed".to_string(),
                    is_guaranteed: true,
                },
                LotteryResultInput {
                    x_id: "@lottery".to_string(),
                    is_guaranteed: false,
                },
            ],
            condition_revision,
        )
    }

    fn matching_result_snapshot(cast_id: i64, cast_name: &str) -> serde_json::Value {
        let assignment = serde_json::json!({
            "castId": cast_id,
            "rank": 1,
            "rotationIndex": 0,
            "score": 100.0,
            "isNgWarning": false,
            "ngReason": null,
        });
        let guaranteed_user = serde_json::json!({
            "name": "確定当選者",
            "xId": "guaranteed",
        });
        let lottery_user = serde_json::json!({
            "name": "抽選当選者",
            "xId": "lottery",
        });
        serde_json::json!({
            "casts": [{
                "id": cast_id,
                "name": cast_name,
                "isPresent": true,
                "ngEntries": [],
            }],
            "applicants": [
                { "user": guaranteed_user.clone(), "matches": [assignment.clone()] },
                { "user": lottery_user.clone(), "matches": [assignment.clone()] },
            ],
            "tableSlots": [
                {
                    "tableIndex": 1,
                    "user": guaranteed_user,
                    "matches": [assignment.clone()],
                },
                {
                    "tableIndex": 2,
                    "user": lottery_user,
                    "matches": [assignment],
                },
            ],
            "scoreSummary": {
                "totalScore": 200.0,
                "averageScore": 100.0,
                "firstChoiceCount": 2,
                "secondChoiceCount": 0,
                "thirdChoiceCount": 0,
                "flatPreferenceCount": 0,
                "unpreferredCount": 0,
                "ngWarningCount": 0,
            },
        })
    }

    #[test]
    fn lottery_result_is_saved_as_a_validated_shared_snapshot() {
        let dir = TestDir::new("save-lottery-result");
        let mut session =
            open_initialized_session_db(&dir.db_path("session.db")).expect("session DB");
        let mut shared = open_initialized_shared_db(&dir.db_path("shared.db")).expect("shared DB");
        prepare_current_lottery_result(&mut session).expect("current lottery result");

        let saved_result_id =
            save_lottery_result_in_connections(&mut session, &mut shared, "  保存結果  ")
                .expect("save result");
        let (snapshot, summary) = read_validated_saved_lottery_result(&shared, saved_result_id)
            .expect("read saved result");

        assert_eq!(summary.label, "保存結果");
        assert_eq!(summary.matching_type_code, "M001");
        assert_eq!(summary.lottery_count, 1);
        assert_eq!(summary.guaranteed_count, 1);
        assert_eq!(summary.winner_count, 2);
        assert_eq!(snapshot.applicants.len(), 2);
        assert_eq!(snapshot.winners.len(), 2);
        assert!(
            save_lottery_result_in_connections(&mut session, &mut shared, "二重保存",).is_err()
        );
    }

    #[test]
    fn stale_lottery_result_cannot_be_saved_to_shared_database() {
        let dir = TestDir::new("save-stale-lottery-result");
        let mut session =
            open_initialized_session_db(&dir.db_path("session.db")).expect("session DB");
        let mut shared = open_initialized_shared_db(&dir.db_path("shared.db")).expect("shared DB");
        persist_applicants_in_connection(&mut session, &[applicant_input("@winner")])
            .expect("applicant");
        session
            .execute(
                "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (1, 0)",
                [],
            )
            .expect("stale lottery row");

        assert!(save_lottery_result_in_connections(&mut session, &mut shared, "保存",).is_err());
        let saved_count = shared
            .query_row("SELECT COUNT(*) FROM saved_results", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("saved result count");
        assert_eq!(saved_count, 0);
    }

    #[test]
    fn shared_snapshot_insert_failure_leaves_no_heading_row() {
        let dir = TestDir::new("save-lottery-result-rollback");
        let mut session =
            open_initialized_session_db(&dir.db_path("session.db")).expect("session DB");
        let mut shared = open_initialized_shared_db(&dir.db_path("shared.db")).expect("shared DB");
        prepare_current_lottery_result(&mut session).expect("current lottery result");
        shared
            .execute_batch(
                "CREATE TRIGGER reject_saved_result
                 BEFORE INSERT ON saved_results
                 BEGIN
                   SELECT RAISE(ABORT, 'テスト用の保存失敗');
                 END;",
            )
            .expect("failure trigger");

        assert!(save_lottery_result_in_connections(&mut session, &mut shared, "保存",).is_err());
        let saved_count = shared
            .query_row("SELECT COUNT(*) FROM saved_results", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("saved result count");
        assert_eq!(saved_count, 0);
    }

    #[test]
    fn corrupt_saved_lottery_snapshot_is_rejected() {
        let dir = TestDir::new("corrupt-saved-lottery-result");
        let shared = open_initialized_shared_db(&dir.db_path("shared.db")).expect("shared DB");
        shared
            .execute(
                "INSERT INTO saved_results
                   (source_session_token, result_type, label, matching_type_code,
                    lottery_count, guaranteed_count, winner_count, snapshot_json)
                 VALUES ('source', 'lottery', '破損', 'M001', 1, 0, 1, '{}')",
                [],
            )
            .expect("corrupt snapshot fixture");
        let saved_result_id = shared.last_insert_rowid();

        assert!(read_validated_saved_lottery_result(&shared, saved_result_id).is_err());
    }

    #[test]
    fn matching_result_is_saved_as_a_validated_shared_snapshot() {
        let dir = TestDir::new("save-matching-result");
        let mut session =
            open_initialized_session_db(&dir.db_path("session.db")).expect("session DB");
        let mut shared = open_initialized_shared_db(&dir.db_path("shared.db")).expect("shared DB");
        prepare_current_lottery_result(&mut session).expect("current lottery result");
        let cast_id =
            insert_cast_in_connection(&mut shared, &cast_input("Cast A")).expect("present cast");
        let snapshot = matching_result_snapshot(cast_id, "Cast A");

        let saved_result_id = save_matching_result_in_connections(
            &mut session,
            &mut shared,
            "  保存結果  ",
            "M001",
            2,
            &snapshot,
        )
        .expect("save matching result");
        let row: (
            String,
            String,
            String,
            Option<i64>,
            Option<i64>,
            i64,
            String,
        ) = shared
            .query_row(
                "SELECT result_type, label, matching_type_code, lottery_count,
                        guaranteed_count, winner_count, snapshot_json
                 FROM saved_results WHERE id = ?1",
                [saved_result_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                },
            )
            .expect("saved matching row");

        assert_eq!(row.0, "matching");
        assert_eq!(row.1, "保存結果");
        assert_eq!(row.2, "M001");
        assert_eq!(row.3, None);
        assert_eq!(row.4, None);
        assert_eq!(row.5, 2);
        let restored = read_validated_matching_snapshot(&row.2, row.5, &row.6)
            .expect("read saved matching snapshot");
        assert_eq!(restored, snapshot);
        assert!(save_matching_result_in_connections(
            &mut session,
            &mut shared,
            "二重保存",
            "M001",
            2,
            &snapshot,
        )
        .is_err());
    }

    #[test]
    fn changed_cast_conditions_prevent_matching_result_save() {
        let dir = TestDir::new("save-stale-matching-result");
        let mut session =
            open_initialized_session_db(&dir.db_path("session.db")).expect("session DB");
        let mut shared = open_initialized_shared_db(&dir.db_path("shared.db")).expect("shared DB");
        prepare_current_lottery_result(&mut session).expect("current lottery result");
        let cast_id =
            insert_cast_in_connection(&mut shared, &cast_input("Cast A")).expect("present cast");
        let snapshot = matching_result_snapshot(cast_id, "Cast A");
        shared
            .execute("UPDATE casts SET name = 'Cast B' WHERE id = ?1", [cast_id])
            .expect("change cast name");

        assert!(save_matching_result_in_connections(
            &mut session,
            &mut shared,
            "保存",
            "M001",
            2,
            &snapshot,
        )
        .is_err());
        let saved_count = shared
            .query_row("SELECT COUNT(*) FROM saved_results", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("saved result count");
        assert_eq!(saved_count, 0);
    }

    #[test]
    fn corrupt_saved_matching_snapshot_is_rejected() {
        assert!(read_validated_matching_snapshot("M001", 1, "{}").is_err());
    }

    #[test]
    fn insert_cast_saves_aliases_and_ng_notes_in_same_transaction() -> rusqlite::Result<()> {
        let dir = TestDir::new("insert-cast-aliases");
        let mut conn = open_initialized_shared_db(&dir.db_path("shared.db"))?;
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
                "target".to_string(),
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
        let mut conn = open_initialized_shared_db(&dir.db_path("shared.db"))?;
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
        assert_eq!(ng, ("new".to_string(), "NG理由".to_string()));
        assert_eq!(aliases, vec!["別名A".to_string(), "別名B".to_string()]);
        Ok(())
    }

    #[test]
    fn missing_cast_id_fails_update_rename_and_delete() -> rusqlite::Result<()> {
        let dir = TestDir::new("missing-cast-write-target");
        let mut conn = open_initialized_shared_db(&dir.db_path("shared.db"))?;
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
        let mut conn = open_initialized_shared_db(&dir.db_path("shared.db"))?;
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
        let mut conn = open_initialized_shared_db(&dir.db_path("shared.db"))?;
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
