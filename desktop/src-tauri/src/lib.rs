use serde::Serialize;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

const KEYRING_SERVICE: &str = "Stargazer";
const KEYRING_USER: &str = "DiscordBot";

// Reserved subdirectory name: any folder literally called "shared" under an
// event holds the event-shared DB and therefore cannot be a session timestamp
// or an event name.
const SHARED_DIR: &str = "shared";

struct BotState {
    child: Mutex<Option<Child>>,
}

impl Default for BotState {
    fn default() -> Self {
        Self { child: Mutex::new(None) }
    }
}

fn resolve_data_root() -> PathBuf {
    if let Some(install_dir) = get_install_location() {
        return PathBuf::from(install_dir).join("Data");
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            return parent.join("Data");
        }
    }
    let local = std::env::var("LOCALAPPDATA")
        .unwrap_or_else(|_| r"C:\ProgramData".to_string());
    PathBuf::from(local)
        .join("CosmoArtsStore")
        .join("Stargazer")
        .join("Data")
}

fn get_install_location() -> Option<String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let key = hkcu.open_subkey(r"Software\CosmoArtsStore\Stargazer").ok()?;
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
// Keeping them in their own DB makes session deletion safe (it never touches
// event-level data) and makes the Discord bot's writes (cast registration)
// independent of whatever CSV happens to be open in the UI.
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
  discord_user_id TEXT,
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

const SESSION_MIGRATIONS: &[(i32, &str)] = &[(1, SESSION_MIGRATION_V1)];

fn validate_event_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("イベント名が空です".to_string());
    }
    // The literal "shared" is reserved for the event-shared subdirectory;
    // allowing it as an event name would collide with Data/<event>/shared/.
    if name == SHARED_DIR {
        return Err("イベント名 'shared' は予約されています".to_string());
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
            return Err(format!("イベント名に使用できない文字が含まれています: '{ch}'"));
        }
    }
    Ok(())
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
    session_dir(event_name, timestamp).join("db").join("stargazer.db")
}

fn ensure_event_shared_db(event_name: &str) -> Result<PathBuf, String> {
    let db_path = event_shared_db_path(event_name);
    let db_dir = db_path.parent().ok_or_else(|| "DBパスが不正です".to_string())?;
    std::fs::create_dir_all(db_dir)
        .map_err(|e| format!("ディレクトリ作成に失敗しました: {e}"))?;

    let mut conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("DBを開けませんでした: {e}"))?;
    run_shared_migrations(&mut conn)
        .map_err(|e| format!("マイグレーションに失敗しました: {e}"))?;
    drop(conn);

    Ok(db_path)
}

fn ensure_session_db(event_name: &str, timestamp: &str) -> Result<PathBuf, String> {
    let db_path = session_db_path(event_name, timestamp);
    let db_dir = db_path.parent().ok_or_else(|| "DBパスが不正です".to_string())?;
    std::fs::create_dir_all(db_dir)
        .map_err(|e| format!("ディレクトリ作成に失敗しました: {e}"))?;

    let mut conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("DBを開けませんでした: {e}"))?;
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
        .filter(|n| !n.starts_with('.') && validate_event_name(n).is_ok())
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
    std::fs::remove_dir_all(&dir)
        .map_err(|e| format!("セッション削除に失敗しました: {e}"))?;
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
    std::fs::remove_dir_all(&dir)
        .map_err(|e| format!("削除に失敗しました: {e}"))?;
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
    std::fs::rename(&old_dir, &new_dir)
        .map_err(|e| format!("リネームに失敗しました: {e}"))?;
    Ok(())
}

fn read_discord_token() -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("資格情報マネージャーにアクセスできません: {e}"))?;
    entry
        .get_password()
        .map_err(|_| "Discord トークンが未設定です".to_string())
}

#[tauri::command]
fn discord_token_save(token: String) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("トークンが空です".to_string());
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("資格情報マネージャーにアクセスできません: {e}"))?;
    entry
        .set_password(trimmed)
        .map_err(|e| format!("トークン保存に失敗しました: {e}"))
}

#[tauri::command]
fn discord_token_exists() -> bool {
    let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) else {
        return false;
    };
    entry.get_password().is_ok()
}

#[tauri::command]
fn discord_token_clear() -> Result<(), String> {
    let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) else {
        return Ok(());
    };
    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("トークン削除に失敗しました: {e}")),
    }
}

fn read_bot_entry_registry() -> Option<String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let key = hkcu.open_subkey(r"Software\CosmoArtsStore\Stargazer").ok()?;
    let value: String = key.get_value("BotEntry").ok()?;
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn write_bot_entry_registry(path: Option<&str>) -> Result<(), String> {
    use winreg::enums::*;
    let hkcu = winreg::RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(r"Software\CosmoArtsStore\Stargazer")
        .map_err(|e| format!("レジストリキー作成に失敗しました: {e}"))?;
    match path {
        Some(p) => key
            .set_value("BotEntry", &p.to_string())
            .map_err(|e| format!("レジストリ書き込みに失敗しました: {e}")),
        None => {
            // delete_value returns NotFound if absent; treat as success
            let _ = key.delete_value("BotEntry");
            Ok(())
        }
    }
}

fn resolve_bot_entry() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("STARGAZER_BOT_ENTRY") {
        let path = PathBuf::from(p);
        if path.exists() {
            return Ok(path);
        }
        return Err("STARGAZER_BOT_ENTRY のパスが存在しません".to_string());
    }
    let Some(stored) = read_bot_entry_registry() else {
        return Err(
            "bot 実行ファイルのパスが未設定です。Discord 連携画面で設定してください。"
                .to_string(),
        );
    };
    let path = PathBuf::from(&stored);
    if !path.exists() {
        return Err(format!(
            "設定された bot のパスにファイルがありません: {stored}"
        ));
    }
    Ok(path)
}

#[tauri::command]
fn bot_entry_get() -> Option<String> {
    read_bot_entry_registry()
}

#[tauri::command]
fn bot_entry_set(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("パスが空です".to_string());
    }
    let p = PathBuf::from(trimmed);
    if !p.exists() {
        return Err(format!("指定されたパスにファイルがありません: {trimmed}"));
    }
    write_bot_entry_registry(Some(trimmed))
}

#[tauri::command]
fn bot_entry_clear() -> Result<(), String> {
    write_bot_entry_registry(None)
}

#[tauri::command]
fn discord_bot_start(
    state: tauri::State<BotState>,
    event_name: String,
) -> Result<(), String> {
    validate_event_name(&event_name)?;

    let mut guard = state.child.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        if matches!(child.try_wait(), Ok(None)) {
            return Err("bot は既に起動しています".to_string());
        }
        *guard = None;
    }

    let token = read_discord_token()?;
    // The bot writes cast registrations (and reads existing casts / NG lists)
    // which now live exclusively in the event-shared DB. Pointing the bot at
    // any session DB would silently fail because those tables no longer
    // exist there, and would also tie cast data to a single CSV import.
    let db_path = ensure_event_shared_db(&event_name)?;
    let bot_entry = resolve_bot_entry()?;

    // Run a .js entry via `node`; otherwise execute the file directly
    // (built bot exe / SEA / any single-file runtime).
    let is_script = bot_entry
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("js") || e.eq_ignore_ascii_case("mjs"))
        .unwrap_or(false);

    let mut command = if is_script {
        let mut c = Command::new("node");
        c.arg(&bot_entry);
        c
    } else {
        Command::new(&bot_entry)
    };

    command
        .env("STARGAZER_BOT_TOKEN", token)
        .env("STARGAZER_BOT_DB_PATH", db_path.to_string_lossy().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: prevents a console window from flashing on spawn
        command.creation_flags(0x0800_0000);
    }

    let child = command
        .spawn()
        .map_err(|e| format!("bot を起動できませんでした（Node.js が必要です）: {e}"))?;

    *guard = Some(child);
    Ok(())
}

#[tauri::command]
fn discord_bot_stop(state: tauri::State<BotState>) -> Result<(), String> {
    let mut guard = state.child.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

#[tauri::command]
fn discord_bot_status(state: tauri::State<BotState>) -> bool {
    let mut guard = state.child.lock().unwrap();
    let Some(child) = guard.as_mut() else {
        return false;
    };
    match child.try_wait() {
        Ok(None) => true,
        _ => {
            *guard = None;
            false
        }
    }
}

fn get_stellarecord_db_path() -> Option<String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let key = hkcu.open_subkey(r"Software\CosmoArtsStore\StellaRecord").ok()?;
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

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("DB を開けませんでした: {e}"))?;
    conn.execute_batch(APPS_SCHEMA)
        .map_err(|e| format!("テーブル作成に失敗しました: {e}"))?;

    let exe_path = std::env::current_exe()
        .map_err(|e| format!("実行パスを取得できませんでした: {e}"))?;

    let icon_data: Option<Vec<u8>> = app.path()
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
    ).map_err(|e| format!("登録に失敗しました: {e}"))?;

    Ok("StellaRecord に登録しました".to_string())
}

#[tauri::command]
fn unregister_from_stellarecord() -> Result<String, String> {
    let db_path = get_stellarecord_db_path()
        .ok_or_else(|| "StellaRecord がインストールされていません".to_string())?;

    if !std::path::Path::new(&db_path).exists() {
        return Ok("DB が存在しないため削除不要です".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("DB を開けませんでした: {e}"))?;

    conn.execute("DELETE FROM apps WHERE name = ?1", rusqlite::params!["Stargazer"])
        .map_err(|e| format!("登録解除に失敗しました: {e}"))?;

    Ok("StellaRecord から登録解除しました".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let webview_data_dir = resolve_data_root().join("EBWebView");
    std::fs::create_dir_all(&webview_data_dir).ok();
    std::env::set_var(
        "WEBVIEW2_USER_DATA_FOLDER",
        webview_data_dir.to_string_lossy().to_string(),
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(BotState::default())
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
            discord_token_save,
            discord_token_exists,
            discord_token_clear,
            discord_bot_start,
            discord_bot_stop,
            discord_bot_status,
            bot_entry_get,
            bot_entry_set,
            bot_entry_clear,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            use tauri::Manager;
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<BotState>() {
                    let mut guard = state.child.lock().unwrap();
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}
