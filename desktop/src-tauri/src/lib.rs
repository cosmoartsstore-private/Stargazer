use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

const SHARED_DIR: &str = "shared";
const CACHE_DIR: &str = "Cache";
const WEBVIEW_DATA_DIR: &str = "EBWebView";

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

// === Event-shared DB schema =================================================
// This DB is split from session DBs because casts, NG lists, caution users,
// header templates and event-wide settings are properties of the EVENT itself.
// A user may re-import a CSV many times (creating new sessions), but the cast
// roster, attendance flags, header-template auto-apply config and reservation
// lists should not be duplicated, reset, or pinned to any one CSV import.
// Keeping them in their own DB makes session deletion safe because it never
// touches event-level data.
const SHARED_MIGRATION_V1: &str = r#"
PRAGMA foreign_keys = ON;

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

-- signature-based lookup: when a CSV is imported, the backend hashes the
-- header row into a normalized "signature" string and queries this table by
-- equality. Storing the signature lets us auto-apply the previously saved
-- column mapping for any CSV with the SAME columns, regardless of file name,
-- without forcing the user to re-pick columns each import.
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

const SHARED_MIGRATIONS: &[(i32, &str)] = &[(1, SHARED_MIGRATION_V1)];

// === Session DB schema ======================================================
// One per CSV import. applicants/applicant_casts/applicant_extra reflect the
// CSV row state at the moment of import and are treated as immutable history:
// once committed they are read-only from the UI's perspective. lottery_results
// is the single exception — re-running the lottery TRUNCATEs and re-INSERTs
// it, which is fine because it is a derived selection over applicants.
// lottery_saved_runs stores user-approved snapshots that can be selected later.
//
// Matching results (applicant -> cast assignment) are deliberately NOT stored
// in either DB. They are a pure function of (lottery_results, shared casts,
// shared cast_ng_entries, applicant_casts) and the inputs already live in the
// two DBs. Persisting them would force us to invalidate the cache every time
// a cast is edited, an NG entry is added, or attendance toggles — none of
// which the user expects to "redo a match". Recomputing on view is cheap and
// always correct.
const SESSION_MIGRATION_V1: &str = r#"
PRAGMA foreign_keys = ON;

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

const SESSION_MIGRATIONS: &[(i32, &str)] = &[(1, SESSION_MIGRATION_V1), (2, SESSION_MIGRATION_V2)];

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

// Strict 14-digit ASCII check (yyyymmddhhmmss). We never let unverified
// strings be joined onto a filesystem path: if the caller forged "..", a
// trailing slash, or anything outside [0-9], we reject before touching
// std::fs. This is the only thing standing between the timestamp parameter
// and a directory traversal.
fn validate_timestamp(ts: &str) -> Result<(), String> {
    if ts.len() != 14 {
        return Err("タイムスタンプは14桁である必要があります".to_string());
    }
    if !ts.bytes().all(|b| b.is_ascii_digit()) {
        return Err("タイムスタンプは数字のみで構成されている必要があります".to_string());
    }
    Ok(())
}

fn apply_migrations(
    conn: &mut rusqlite::Connection,
    migrations: &[(i32, &str)],
) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;

    let current: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    for (version, sql) in migrations {
        if *version > current {
            let tx = conn.transaction()?;
            tx.execute_batch(sql)?;
            // PRAGMA user_version doesn't support bind params; interpolate the trusted const.
            tx.execute_batch(&format!("PRAGMA user_version = {version};"))?;
            tx.commit()?;
        }
    }

    Ok(())
}

fn run_shared_migrations(conn: &mut rusqlite::Connection) -> rusqlite::Result<()> {
    apply_migrations(conn, SHARED_MIGRATIONS)
}

fn run_session_migrations(conn: &mut rusqlite::Connection) -> rusqlite::Result<()> {
    apply_migrations(conn, SESSION_MIGRATIONS)
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

fn ensure_event_shared_db(event_name: &str) -> Result<PathBuf, String> {
    let db_path = event_shared_db_path(event_name);
    let db_dir = db_path
        .parent()
        .ok_or_else(|| "DBパスが不正です".to_string())?;
    std::fs::create_dir_all(db_dir).map_err(|e| format!("ディレクトリ作成に失敗しました: {e}"))?;

    let mut conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("DBを開けませんでした: {e}"))?;
    run_shared_migrations(&mut conn).map_err(|e| format!("マイグレーションに失敗しました: {e}"))?;
    drop(conn);

    Ok(db_path)
}

fn ensure_session_db(event_name: &str, timestamp: &str) -> Result<PathBuf, String> {
    let db_path = session_db_path(event_name, timestamp);
    let db_dir = db_path
        .parent()
        .ok_or_else(|| "DBパスが不正です".to_string())?;
    std::fs::create_dir_all(db_dir).map_err(|e| format!("ディレクトリ作成に失敗しました: {e}"))?;

    let mut conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("DBを開けませんでした: {e}"))?;
    run_session_migrations(&mut conn)
        .map_err(|e| format!("マイグレーションに失敗しました: {e}"))?;
    drop(conn);

    Ok(db_path)
}

fn path_to_sqlite_uri(path: &std::path::Path) -> String {
    format!("sqlite:{}", path.to_string_lossy().replace('\\', "/"))
}

fn now_local_timestamp() -> String {
    use chrono::Local;
    Local::now().format("%Y%m%d%H%M%S").to_string()
}

#[derive(Serialize)]
struct SessionInfo {
    timestamp: String,
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
    preference_mode: Option<String>,
    is_guaranteed: bool,
    raw_extra: Vec<RawExtraInput>,
}

#[derive(Deserialize)]
struct NgUserInput {
    username: Option<String>,
    #[serde(rename = "accountId")]
    account_id: Option<String>,
}

#[derive(Deserialize)]
struct CastInput {
    name: String,
    is_present: bool,
    contact_urls: Vec<String>,
    ng_entries: Vec<NgUserInput>,
    group_name: Option<String>,
    photo_data_url: Option<String>,
    memo: Option<String>,
}

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
}

#[derive(Deserialize)]
struct LotteryResultInput {
    applicant_id: i64,
    is_guaranteed: bool,
}

/** SQLite エラーに、呼び出し元の操作名を付けたユーザー向けメッセージを作る。 */
fn sqlite_error(context: &str, error: rusqlite::Error) -> String {
    format!("{context}: {error}")
}

/** イベント共有 DB を、foreign key を有効化した書き込み用 connection として開く。 */
fn open_shared_write_connection(event_name: &str) -> Result<rusqlite::Connection, String> {
    validate_event_name(event_name)?;
    let db_path = ensure_event_shared_db(event_name)?;
    let conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("DBを開けませんでした: {e}"))?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| format!("DB待機設定に失敗しました: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("DB設定に失敗しました: {e}"))?;
    Ok(conn)
}

/** 取込セッション DB を、foreign key を有効化した書き込み用 connection として開く。 */
fn open_session_write_connection(
    event_name: &str,
    timestamp: &str,
) -> Result<rusqlite::Connection, String> {
    validate_event_name(event_name)?;
    validate_timestamp(timestamp)?;
    let db_path = ensure_session_db(event_name, timestamp)?;
    let conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("DBを開けませんでした: {e}"))?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| format!("DB待機設定に失敗しました: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("DB設定に失敗しました: {e}"))?;
    Ok(conn)
}

/** キャスト本体、連絡先 URL、NG エントリを同じ transaction に挿入する。 */
fn insert_cast_in_transaction(
    tx: &rusqlite::Transaction<'_>,
    cast: &CastInput,
) -> rusqlite::Result<()> {
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
    let cast_id: i64 = tx.query_row("SELECT last_insert_rowid()", [], |row| row.get(0))?;
    tx.execute(
        "INSERT OR REPLACE INTO event_cast_present (cast_id, is_present) VALUES (?1, ?2)",
        rusqlite::params![cast_id, if cast.is_present { 1 } else { 0 }],
    )?;
    for url in &cast.contact_urls {
        tx.execute(
            "INSERT INTO cast_urls (cast_id, url) VALUES (?1, ?2)",
            rusqlite::params![cast_id, url],
        )?;
    }
    for ng in &cast.ng_entries {
        tx.execute(
            "INSERT INTO cast_ng_entries (cast_id, username, userid) VALUES (?1, ?2, ?3)",
            rusqlite::params![cast_id, ng.username.as_deref(), ng.account_id.as_deref()],
        )?;
    }
    Ok(())
}

/** 応募者一覧と依存する保存済み抽選結果を、単一 SQLite transaction で全置換する。 */
fn persist_applicants_in_connection(
    conn: &mut rusqlite::Connection,
    users: &[ApplicantInput],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM lottery_saved_run_results", [])?;
    tx.execute("DELETE FROM lottery_saved_runs", [])?;
    tx.execute("DELETE FROM applicants", [])?;
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
        let applicant_id: i64 = tx.query_row("SELECT last_insert_rowid()", [], |row| row.get(0))?;
        for (index, cast_name) in user.casts.iter().enumerate() {
            if cast_name.is_empty() {
                continue;
            }
            tx.execute(
                "INSERT INTO applicant_casts (applicant_id, preference_order, cast_name)
                 VALUES (?1, ?2, ?3)",
                rusqlite::params![applicant_id, index as i64, cast_name],
            )?;
        }
        tx.execute(
            "INSERT INTO applicant_extra (applicant_id, field_key, field_value)
             VALUES (?1, '__preference_mode', ?2)",
            rusqlite::params![
                applicant_id,
                user.preference_mode
                    .as_deref()
                    .filter(|mode| *mode == "flat" || *mode == "ranked")
                    .unwrap_or("ranked")
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
    tx.commit()
}

/** キャスト一覧を、関連 URL/NG エントリを含めて単一 transaction で全置換する。 */
fn persist_all_casts_in_connection(
    conn: &mut rusqlite::Connection,
    casts: &[CastInput],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM casts", [])?;
    for cast in casts {
        insert_cast_in_transaction(&tx, cast)?;
    }
    tx.commit()
}

/** キャスト1件と関連 URL/NG エントリを単一 transaction で追加する。 */
fn insert_cast_in_connection(
    conn: &mut rusqlite::Connection,
    cast: &CastInput,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    insert_cast_in_transaction(&tx, cast)?;
    tx.commit()
}

/** キャストの部分更新を、関連 URL/NG エントリの全置換と同じ transaction にまとめる。 */
fn update_cast_fields_in_connection(
    conn: &mut rusqlite::Connection,
    name: &str,
    patch: &CastPatchInput,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    if patch.update_is_present {
        tx.execute(
            "UPDATE casts SET is_attend = ?1 WHERE name = ?2",
            rusqlite::params![if patch.is_present { 1 } else { 0 }, name],
        )?;
    }
    if patch.update_group_name {
        tx.execute(
            "UPDATE casts SET group_name = ?1 WHERE name = ?2",
            rusqlite::params![patch.group_name.as_deref(), name],
        )?;
    }
    if patch.update_photo_data_url {
        tx.execute(
            "UPDATE casts SET photo_data_url = ?1 WHERE name = ?2",
            rusqlite::params![patch.photo_data_url.as_deref(), name],
        )?;
    }
    if patch.update_memo {
        tx.execute(
            "UPDATE casts SET memo = ?1 WHERE name = ?2",
            rusqlite::params![patch.memo.as_deref(), name],
        )?;
    }

    if patch.update_is_present || patch.update_contact_urls || patch.update_ng_entries {
        let cast_id: Option<i64> = tx
            .query_row("SELECT id FROM casts WHERE name = ?1", [name], |row| {
                row.get(0)
            })
            .optional()?;
        if let Some(cast_id) = cast_id {
            if patch.update_is_present {
                tx.execute(
                    "INSERT OR REPLACE INTO event_cast_present (cast_id, is_present)
                     VALUES (?1, ?2)",
                    rusqlite::params![cast_id, if patch.is_present { 1 } else { 0 }],
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
                        "INSERT INTO cast_ng_entries (cast_id, username, userid)
                         VALUES (?1, ?2, ?3)",
                        rusqlite::params![
                            cast_id,
                            ng.username.as_deref(),
                            ng.account_id.as_deref()
                        ],
                    )?;
                }
            }
        }
    }
    tx.commit()
}

/** キャストのイベント内出席状態を単一 transaction で保存する。 */
fn update_cast_attend_in_connection(
    conn: &mut rusqlite::Connection,
    name: &str,
    is_present: bool,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    let cast_id: Option<i64> = tx
        .query_row("SELECT id FROM casts WHERE name = ?1", [name], |row| {
            row.get(0)
        })
        .optional()?;
    if let Some(cast_id) = cast_id {
        tx.execute(
            "UPDATE casts SET is_attend = ?1 WHERE id = ?2",
            rusqlite::params![if is_present { 1 } else { 0 }, cast_id],
        )?;
        tx.execute(
            "INSERT OR REPLACE INTO event_cast_present (cast_id, is_present)
             VALUES (?1, ?2)",
            rusqlite::params![cast_id, if is_present { 1 } else { 0 }],
        )?;
    }
    tx.commit()
}

/** キャスト名を変更する。関連テーブルは cast_id 参照のため更新しない。 */
fn rename_cast_in_connection(
    conn: &mut rusqlite::Connection,
    old_name: &str,
    new_name: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE casts SET name = ?1 WHERE name = ?2",
        rusqlite::params![new_name, old_name],
    )?;
    Ok(())
}

/** キャストと関連 URL/NG エントリを単一 transaction で削除する。 */
fn delete_cast_in_connection(conn: &mut rusqlite::Connection, name: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    let cast_id: Option<i64> = tx
        .query_row("SELECT id FROM casts WHERE name = ?1", [name], |row| {
            row.get(0)
        })
        .optional()?;
    if let Some(cast_id) = cast_id {
        tx.execute("DELETE FROM cast_urls WHERE cast_id = ?1", [cast_id])?;
        tx.execute("DELETE FROM cast_ng_entries WHERE cast_id = ?1", [cast_id])?;
    }
    tx.execute("DELETE FROM casts WHERE name = ?1", [name])?;
    tx.commit()
}

/** 指定日のキャスト出席記録を、既存行削除と新規挿入を含めて単一 transaction で保存する。 */
fn record_cast_attendance_in_connection(
    conn: &mut rusqlite::Connection,
    present_cast_names: &[String],
    recorded_at: &str,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM cast_attendance WHERE DATE(recorded_at) = DATE(?1)",
        [recorded_at],
    )?;
    for name in present_cast_names {
        let cast_id: Option<i64> = tx
            .query_row(
                "SELECT id FROM casts WHERE name = ?1 LIMIT 1",
                [name],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(cast_id) = cast_id {
            tx.execute(
                "INSERT INTO cast_attendance (cast_id, recorded_at) VALUES (?1, ?2)",
                rusqlite::params![cast_id, recorded_at],
            )?;
        }
    }
    tx.commit()
}

/** 現在セッションの抽選結果を単一 transaction で全置換する。 */
fn replace_lottery_results_in_connection(
    conn: &mut rusqlite::Connection,
    rows: &[LotteryResultInput],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM lottery_results", [])?;
    for row in rows {
        tx.execute(
            "INSERT INTO lottery_results (applicant_id, is_guaranteed) VALUES (?1, ?2)",
            rusqlite::params![row.applicant_id, if row.is_guaranteed { 1 } else { 0 }],
        )?;
    }
    tx.commit()
}

/** 現在セッションの抽選結果を削除する。 */
fn clear_lottery_results_in_connection(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM lottery_results", [])?;
    Ok(())
}

/** 抽選結果スナップショットを、見出し行と当選者行を単一 transaction で保存する。 */
fn save_lottery_run_in_connection(
    conn: &mut rusqlite::Connection,
    label: &str,
    matching_type_code: &str,
    lottery_count: i64,
    guaranteed_count: i64,
    rows: &[LotteryResultInput],
) -> rusqlite::Result<i64> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO lottery_saved_runs
           (label, matching_type_code, lottery_count, guaranteed_count, winner_count)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            label,
            matching_type_code,
            lottery_count,
            guaranteed_count,
            rows.len() as i64
        ],
    )?;
    let run_id: i64 = tx.query_row("SELECT last_insert_rowid()", [], |row| row.get(0))?;
    for (index, row) in rows.iter().enumerate() {
        tx.execute(
            "INSERT INTO lottery_saved_run_results
               (run_id, applicant_id, is_guaranteed, result_order)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                run_id,
                row.applicant_id,
                if row.is_guaranteed { 1 } else { 0 },
                index as i64
            ],
        )?;
    }
    tx.commit()?;
    Ok(run_id)
}

#[tauri::command]
fn list_events() -> Vec<String> {
    let root = resolve_data_root();
    let Ok(entries) = std::fs::read_dir(&root) else {
        return Vec::new();
    };

    let mut names: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| is_event_directory_name(n))
        .collect();

    names.sort();
    names
}

#[tauri::command]
fn get_event_shared_db_uri(event_name: String) -> Result<String, String> {
    validate_event_name(&event_name)?;
    let db_path = ensure_event_shared_db(&event_name)?;
    Ok(path_to_sqlite_uri(&db_path))
}

#[tauri::command]
fn list_sessions(event_name: String) -> Result<Vec<SessionInfo>, String> {
    validate_event_name(&event_name)?;
    let dir = event_dir(&event_name);
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        // A missing event dir means "no sessions yet" rather than an error;
        // the UI calls this freely while the user is still on the event list.
        Err(_) => return Ok(Vec::new()),
    };

    let mut sessions: Vec<SessionInfo> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| validate_timestamp(n).is_ok())
        .map(|timestamp| SessionInfo { timestamp })
        .collect();

    // Newest first because the UI's session picker shows the most recent
    // import at the top by default.
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(sessions)
}

#[tauri::command]
fn create_session(event_name: String) -> Result<String, String> {
    validate_event_name(&event_name)?;
    if !event_dir(&event_name).exists() {
        return Err(format!("イベント '{event_name}' が存在しません"));
    }

    let timestamp = now_local_timestamp();
    // Defensive: the generator is trusted, but routing the value through the
    // same validator the public API uses guarantees no path-traversal hole
    // can be opened by accidentally changing the format string above.
    validate_timestamp(&timestamp)?;

    if session_dir(&event_name, &timestamp).exists() {
        return Err("同名のセッションが既に存在します".to_string());
    }

    ensure_session_db(&event_name, &timestamp)?;
    Ok(timestamp)
}

#[tauri::command]
fn get_session_db_uri(event_name: String, timestamp: String) -> Result<String, String> {
    validate_event_name(&event_name)?;
    validate_timestamp(&timestamp)?;
    let db_path = ensure_session_db(&event_name, &timestamp)?;
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

/** キャスト一覧の全置換を Rust 側の単一 SQLite transaction で実行する。 */
#[tauri::command]
fn persist_all_casts_atomic(event_name: String, casts: Vec<CastInput>) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    persist_all_casts_in_connection(&mut conn, &casts)
        .map_err(|e| sqlite_error("キャスト一覧の保存に失敗しました", e))
}

/** キャスト追加を Rust 側の単一 SQLite transaction で実行する。 */
#[tauri::command]
fn insert_cast_atomic(event_name: String, cast: CastInput) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    insert_cast_in_connection(&mut conn, &cast)
        .map_err(|e| sqlite_error("キャスト追加に失敗しました", e))
}

/** キャスト部分更新を Rust 側の単一 SQLite transaction で実行する。 */
#[tauri::command]
fn update_cast_fields_atomic(
    event_name: String,
    name: String,
    patch: CastPatchInput,
) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    update_cast_fields_in_connection(&mut conn, &name, &patch)
        .map_err(|e| sqlite_error("キャスト更新に失敗しました", e))
}

/** キャスト出席状態の保存を Rust 側で実行する。 */
#[tauri::command]
fn update_cast_attend_atomic(
    event_name: String,
    name: String,
    is_present: bool,
) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    update_cast_attend_in_connection(&mut conn, &name, is_present)
        .map_err(|e| sqlite_error("キャスト出席状態の保存に失敗しました", e))
}

/** キャスト名変更を Rust 側で実行する。 */
#[tauri::command]
fn rename_cast_atomic(
    event_name: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    rename_cast_in_connection(&mut conn, &old_name, &new_name)
        .map_err(|e| sqlite_error("キャスト名変更に失敗しました", e))
}

/** キャスト削除を Rust 側の単一 SQLite transaction で実行する。 */
#[tauri::command]
fn delete_cast_atomic(event_name: String, name: String) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    delete_cast_in_connection(&mut conn, &name)
        .map_err(|e| sqlite_error("キャスト削除に失敗しました", e))
}

/** 指定日のキャスト出席記録を Rust 側の単一 SQLite transaction で保存する。 */
#[tauri::command]
fn record_cast_attendance_atomic(
    event_name: String,
    present_cast_names: Vec<String>,
    recorded_at: String,
) -> Result<(), String> {
    let mut conn = open_shared_write_connection(&event_name)?;
    record_cast_attendance_in_connection(&mut conn, &present_cast_names, &recorded_at)
        .map_err(|e| sqlite_error("キャスト出席記録の保存に失敗しました", e))
}

/** 現在セッションの抽選結果全置換を Rust 側の単一 SQLite transaction で実行する。 */
#[tauri::command]
fn replace_lottery_results_atomic(
    event_name: String,
    timestamp: String,
    rows: Vec<LotteryResultInput>,
) -> Result<(), String> {
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    replace_lottery_results_in_connection(&mut conn, &rows)
        .map_err(|e| sqlite_error("抽選結果の保存に失敗しました", e))
}

/** 現在セッションの抽選結果削除を Rust 側で実行する。 */
#[tauri::command]
fn clear_lottery_results_atomic(event_name: String, timestamp: String) -> Result<(), String> {
    let conn = open_session_write_connection(&event_name, &timestamp)?;
    clear_lottery_results_in_connection(&conn)
        .map_err(|e| sqlite_error("抽選結果の削除に失敗しました", e))
}

/** 保存済み抽選結果を Rust 側の単一 SQLite transaction で保存し、作成 ID を返す。 */
#[tauri::command]
fn save_lottery_run_atomic(
    event_name: String,
    timestamp: String,
    label: String,
    matching_type_code: String,
    lottery_count: i64,
    guaranteed_count: i64,
    rows: Vec<LotteryResultInput>,
) -> Result<i64, String> {
    let mut conn = open_session_write_connection(&event_name, &timestamp)?;
    save_lottery_run_in_connection(
        &mut conn,
        &label,
        &matching_type_code,
        lottery_count,
        guaranteed_count,
        &rows,
    )
    .map_err(|e| sqlite_error("保存済み抽選結果の保存に失敗しました", e))
}

#[tauri::command]
fn delete_session(event_name: String, timestamp: String) -> Result<(), String> {
    validate_event_name(&event_name)?;
    validate_timestamp(&timestamp)?;
    let dir = session_dir(&event_name, &timestamp);
    if !dir.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&dir).map_err(|e| format!("セッション削除に失敗しました: {e}"))?;
    Ok(())
}

#[tauri::command]
fn create_event(event_name: String) -> Result<(), String> {
    validate_event_name(&event_name)?;
    let dir = event_dir(&event_name);
    if dir.exists() {
        return Err(format!("イベント '{event_name}' は既に存在します"));
    }
    // Only the shared DB is created at event-creation time. Sessions are
    // explicit user actions (CSV import) and are NOT auto-created here.
    ensure_event_shared_db(&event_name)?;
    Ok(())
}

#[tauri::command]
fn delete_event(event_name: String) -> Result<(), String> {
    validate_event_name(&event_name)?;
    let dir = event_dir(&event_name);
    if !dir.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&dir).map_err(|e| format!("削除に失敗しました: {e}"))?;
    Ok(())
}

#[tauri::command]
fn rename_event(old_name: String, new_name: String) -> Result<(), String> {
    validate_event_name(&old_name)?;
    validate_event_name(&new_name)?;
    if old_name == new_name {
        return Ok(());
    }
    let old_dir = event_dir(&old_name);
    let new_dir = event_dir(&new_name);
    if !old_dir.exists() {
        return Err(format!("イベント '{old_name}' が存在しません"));
    }
    if new_dir.exists() {
        return Err(format!("イベント '{new_name}' は既に存在します"));
    }
    std::fs::rename(&old_dir, &new_dir).map_err(|e| format!("リネームに失敗しました: {e}"))?;
    Ok(())
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
    get_stellarecord_db_path()
        .map(|p| std::path::Path::new(&p).exists())
        .unwrap_or(false)
}

#[tauri::command]
fn register_to_stellarecord(app: tauri::AppHandle) -> Result<String, String> {
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
        .map(|d: std::path::PathBuf| d.join("icons").join("128x128.png"))
        .and_then(|p| std::fs::read(&p).ok());

    conn.execute(
        "INSERT OR REPLACE INTO apps (name, description, path, category, icon)
         VALUES (?1, ?2, ?3, 'fastparty', ?4)",
        rusqlite::params![
            "Stargazer",
            "VRChatワールド・インスタンス情報ビューア",
            exe_path.to_string_lossy().to_string(),
            icon_data,
        ],
    )
    .map_err(|e| format!("登録に失敗しました: {e}"))?;

    Ok("StellaRecord に登録しました".to_string())
}

#[tauri::command]
fn unregister_from_stellarecord() -> Result<String, String> {
    let db_path = get_stellarecord_db_path()
        .ok_or_else(|| "StellaRecord がインストールされていません".to_string())?;

    if !std::path::Path::new(&db_path).exists() {
        return Ok("DB が存在しないため削除不要です".to_string());
    }

    let conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("DB を開けませんでした: {e}"))?;

    conn.execute(
        "DELETE FROM apps WHERE name = ?1",
        rusqlite::params!["Stargazer"],
    )
    .map_err(|e| format!("登録解除に失敗しました: {e}"))?;

    Ok("StellaRecord から登録解除しました".to_string())
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
    std::fs::create_dir_all(&webview_data_dir).ok();
    std::env::set_var(
        "WEBVIEW2_USER_DATA_FOLDER",
        webview_data_dir.to_string_lossy().to_string(),
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            register_to_stellarecord,
            unregister_from_stellarecord,
            check_stellarecord_available,
            list_events,
            get_event_shared_db_uri,
            list_sessions,
            create_session,
            get_session_db_uri,
            persist_applicants_atomic,
            persist_all_casts_atomic,
            insert_cast_atomic,
            update_cast_fields_atomic,
            update_cast_attend_atomic,
            rename_cast_atomic,
            delete_cast_atomic,
            record_cast_attendance_atomic,
            replace_lottery_results_atomic,
            clear_lottery_results_atomic,
            save_lottery_run_atomic,
            delete_session,
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
    fn legacy_webview_cleanup_guard_requires_profile_shape() {
        let dir = TestDir::new("legacy-webview-cleanup");
        let plain_dir = dir.0.join(WEBVIEW_DATA_DIR);
        std::fs::create_dir_all(&plain_dir).expect("空のEBWebViewディレクトリを作成できません");
        assert!(!looks_like_webview_data_root(&plain_dir));

        std::fs::create_dir_all(plain_dir.join(WEBVIEW_DATA_DIR).join("Default"))
            .expect("WebView2プロファイル相当のディレクトリを作成できません");
        assert!(looks_like_webview_data_root(&plain_dir));
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
    fn session_migration_creates_saved_lottery_run_tables() -> rusqlite::Result<()> {
        let dir = TestDir::new("saved-lottery-runs");
        let conn = open_migrated_session_db(&dir.db_path("session.db"))?;

        let user_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        let table_count: i64 = conn.query_row(
            "SELECT COUNT(*)
             FROM sqlite_master
             WHERE type = 'table'
               AND name IN ('lottery_saved_runs', 'lottery_saved_run_results')",
            [],
            |row| row.get(0),
        )?;

        assert_eq!(user_version, 2);
        assert_eq!(table_count, 2);
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
                preference_mode: Some("ranked".to_string()),
                is_guaranteed: false,
                raw_extra: vec![],
            },
            ApplicantInput {
                name: Some("Duplicate User".to_string()),
                x_id: "@duplicate".to_string(),
                vrc_url: None,
                casts: vec![],
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
            applicant_id: 999_999,
            is_guaranteed: false,
        }];

        assert!(replace_lottery_results_in_connection(&mut conn, &rows).is_err());
        let remaining_applicant_id: i64 =
            conn.query_row("SELECT applicant_id FROM lottery_results", [], |row| {
                row.get(0)
            })?;
        assert_eq!(remaining_applicant_id, applicant_id);
        Ok(())
    }

    #[test]
    fn save_lottery_run_failure_rolls_back_heading_row() -> rusqlite::Result<()> {
        let dir = TestDir::new("save-lottery-run-rollback");
        let mut conn = open_migrated_session_db(&dir.db_path("session.db"))?;
        let rows = vec![LotteryResultInput {
            applicant_id: 999_999,
            is_guaranteed: false,
        }];

        assert!(save_lottery_run_in_connection(&mut conn, "保存", "M002", 1, 0, &rows).is_err());
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

        let patch = CastPatchInput {
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
            }],
        };

        update_cast_fields_in_connection(&mut conn, "Cast A", &patch)?;

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
        let userid: String = conn.query_row(
            "SELECT userid FROM cast_ng_entries WHERE cast_id = ?1",
            [cast_id],
            |row| row.get(0),
        )?;
        let present_flag: i64 = conn.query_row(
            "SELECT is_present FROM event_cast_present WHERE cast_id = ?1",
            [cast_id],
            |row| row.get(0),
        )?;

        assert_eq!(row, (None, 0, Some("updated".to_string())));
        assert_eq!(url, "https://example.test/new");
        assert_eq!(userid, "@new");
        assert_eq!(present_flag, 0);
        Ok(())
    }

    #[test]
    fn cast_persistence_keeps_event_present_table_in_sync() -> rusqlite::Result<()> {
        let dir = TestDir::new("cast-present-sync");
        let mut conn = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        let casts = vec![
            CastInput {
                name: "Cast A".to_string(),
                is_present: false,
                contact_urls: vec![],
                ng_entries: vec![],
                group_name: None,
                photo_data_url: None,
                memo: None,
            },
            CastInput {
                name: "Cast B".to_string(),
                is_present: true,
                contact_urls: vec![],
                ng_entries: vec![],
                group_name: None,
                photo_data_url: None,
                memo: None,
            },
        ];

        persist_all_casts_in_connection(&mut conn, &casts)?;

        let present_flags: Vec<i64> = {
            let mut stmt = conn.prepare(
                "SELECT ecp.is_present
                 FROM event_cast_present ecp
                 JOIN casts c ON c.id = ecp.cast_id
                 ORDER BY c.name",
            )?;
            let rows = stmt
                .query_map([], |row| row.get(0))?
                .collect::<rusqlite::Result<Vec<i64>>>()?;
            rows
        };

        assert_eq!(present_flags, vec![0, 1]);
        Ok(())
    }

    #[test]
    fn update_cast_presence_keeps_cast_table_in_sync() -> rusqlite::Result<()> {
        let dir = TestDir::new("update-cast-present-sync");
        let mut conn = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        conn.execute(
            "INSERT INTO casts (name, is_attend) VALUES ('Cast A', 0)",
            [],
        )?;

        update_cast_attend_in_connection(&mut conn, "Cast A", true)?;

        let row: (i64, i64) = conn.query_row(
            "SELECT c.is_attend, ecp.is_present
             FROM casts c
             JOIN event_cast_present ecp ON ecp.cast_id = c.id
             WHERE c.name = 'Cast A'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        assert_eq!(row, (1, 1));
        Ok(())
    }

    #[test]
    fn record_cast_attendance_replaces_same_day_rows() -> rusqlite::Result<()> {
        let dir = TestDir::new("record-attendance");
        let mut conn = open_migrated_shared_db(&dir.db_path("shared.db"))?;
        conn.execute("INSERT INTO casts (name) VALUES ('Cast A')", [])?;
        let cast_a_id = conn.last_insert_rowid();
        conn.execute("INSERT INTO casts (name) VALUES ('Cast B')", [])?;
        conn.execute(
            "INSERT INTO cast_attendance (cast_id, recorded_at) VALUES (?1, '2026-06-18')",
            [cast_a_id],
        )?;

        record_cast_attendance_in_connection(
            &mut conn,
            &["Cast B".to_string(), "Missing Cast".to_string()],
            "2026-06-18",
        )?;

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
}
