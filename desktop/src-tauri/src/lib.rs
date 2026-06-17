use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

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

const SESSION_MIGRATIONS: &[(i32, &str)] = &[
    (1, SESSION_MIGRATION_V1),
    (2, SESSION_MIGRATION_V2),
];

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
            let path = std::env::temp_dir().join(format!(
                "stargazer-{name}-{}-{nanos}",
                std::process::id()
            ));
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
}
