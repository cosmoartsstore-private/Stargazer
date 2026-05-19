use std::path::PathBuf;

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

const EVENT_MIGRATION_V1: &str = r#"
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

CREATE TABLE attendance (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id     INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  matched_cast_id  INTEGER REFERENCES casts(id),
  seat_label       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE cast_attendance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id     INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE event_cast_present (
  cast_id    INTEGER PRIMARY KEY REFERENCES casts(id) ON DELETE CASCADE,
  is_present INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

const EVENT_MIGRATIONS: &[(i32, &str)] = &[(1, EVENT_MIGRATION_V1)];

fn validate_event_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("イベント名が空です".to_string());
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

fn run_migrations(conn: &mut rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;

    let current: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    for (version, sql) in EVENT_MIGRATIONS {
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

fn event_dir(name: &str) -> PathBuf {
    resolve_data_root().join(name)
}

fn event_db_path(name: &str) -> PathBuf {
    event_dir(name).join("db").join("stargazer.db")
}

fn ensure_event_db(name: &str) -> Result<PathBuf, String> {
    let db_path = event_db_path(name);
    let db_dir = db_path.parent().ok_or_else(|| "DBパスが不正です".to_string())?;
    std::fs::create_dir_all(db_dir)
        .map_err(|e| format!("ディレクトリ作成に失敗しました: {e}"))?;

    let mut conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("DBを開けませんでした: {e}"))?;
    run_migrations(&mut conn).map_err(|e| format!("マイグレーションに失敗しました: {e}"))?;
    drop(conn);

    Ok(db_path)
}

fn path_to_sqlite_uri(path: &std::path::Path) -> String {
    format!("sqlite:{}", path.to_string_lossy().replace('\\', "/"))
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
fn get_event_db_uri(event_name: String) -> Result<String, String> {
    validate_event_name(&event_name)?;
    let db_path = ensure_event_db(&event_name)?;
    Ok(path_to_sqlite_uri(&db_path))
}

#[tauri::command]
fn create_event(event_name: String) -> Result<(), String> {
    validate_event_name(&event_name)?;
    let dir = event_dir(&event_name);
    if dir.exists() {
        return Err(format!("イベント '{event_name}' は既に存在します"));
    }
    ensure_event_db(&event_name)?;
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
        .invoke_handler(tauri::generate_handler![
            register_to_stellarecord,
            unregister_from_stellarecord,
            check_stellarecord_available,
            list_events,
            get_event_db_uri,
            create_event,
            delete_event,
            rename_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
