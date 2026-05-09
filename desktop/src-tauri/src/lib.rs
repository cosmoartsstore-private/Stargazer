use tauri_plugin_sql::{Migration, MigrationKind};
use std::path::PathBuf;

/// Resolve the Stargazer data root: `$LOCALAPPDATA\CosmoArtsStore\Stargazer\Data\`
/// Falls back to deriving from the executable location if the registry key is absent.
fn resolve_data_root() -> PathBuf {
    // Try registry first
    if let Some(install_dir) = get_install_location() {
        return PathBuf::from(install_dir).join("Data");
    }
    // Fallback: exe dir (for dev / portable)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            return parent.join("Data");
        }
    }
    // Last resort: LOCALAPPDATA
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

/// Build the absolute `sqlite:<path>` URI for the Stargazer database.
fn resolve_db_uri() -> String {
    let db_dir = resolve_data_root().join("db");
    std::fs::create_dir_all(&db_dir).ok();
    let db_path = db_dir.join("stargazer.db");
    // tauri-plugin-sql accepts forward-slash absolute paths after `sqlite:`
    format!("sqlite:{}", db_path.to_string_lossy().replace('\\', "/"))
}

const MIGRATION_V1: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  event_date  TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS casts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  group_name  TEXT,
  is_attend   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS cast_urls (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id  INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  url      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cast_ng_entries (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id  INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  username TEXT,
  userid   TEXT
);

CREATE TABLE IF NOT EXISTS applicants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  x_id          TEXT NOT NULL,
  name          TEXT,
  vrc_url       TEXT,
  is_guaranteed INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(event_id, x_id)
);

CREATE TABLE IF NOT EXISTS applicant_casts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id     INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  preference_order INTEGER NOT NULL,
  cast_name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applicant_extra (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  field_key    TEXT NOT NULL,
  field_value  TEXT
);

CREATE TABLE IF NOT EXISTS caution_users (
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

CREATE TABLE IF NOT EXISTS attendance (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  applicant_id     INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  matched_cast_id  INTEGER REFERENCES casts(id),
  seat_label       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

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

/// Return the sqlite URI for the Stargazer database so the frontend can call Database.load() with it.
#[tauri::command]
fn get_db_uri() -> String {
    resolve_db_uri()
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
    let db_uri = resolve_db_uri();

    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: MIGRATION_V1,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_cast_photo_and_memo",
            sql: "ALTER TABLE casts ADD COLUMN photo_data_url TEXT; ALTER TABLE casts ADD COLUMN memo TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_event_photo",
            sql: "ALTER TABLE events ADD COLUMN photo_data_url TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_cast_attendance",
            sql: "CREATE TABLE IF NOT EXISTS cast_attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE, recorded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')));",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_event_cast_present",
            sql: "CREATE TABLE IF NOT EXISTS event_cast_present (event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE, is_present INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (event_id, cast_id));",
            kind: MigrationKind::Up,
        },
    ];

    // WebView2 user data directory: Data\EBWebView under install root
    let webview_data_dir = resolve_data_root().join("EBWebView");
    std::fs::create_dir_all(&webview_data_dir).ok();
    // Set the environment variable that WebView2 respects for user data folder.
    // Tauri 2 reads WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS but the proper way is
    // the UDF env var picked up by the Tauri WRY layer.
    std::env::set_var(
        "WEBVIEW2_USER_DATA_FOLDER",
        webview_data_dir.to_string_lossy().to_string(),
    );

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&db_uri, migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            register_to_stellarecord,
            unregister_from_stellarecord,
            check_stellarecord_available,
            get_db_uri
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
