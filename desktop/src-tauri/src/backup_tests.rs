// バックアップの検証・展開・置換失敗を、テスト所有の一時領域だけで確認する。
use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).expect("現在時刻を取得できません").as_nanos();
        let path = std::env::temp_dir().join(format!("stargazer-backup-test-{}-{nanos}", std::process::id()));
        std::fs::create_dir(&path).expect("テスト用directoryを作成できません");
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
}

fn manifest_value(events: &[&str]) -> serde_json::Value {
    serde_json::json!({
        "format": DATA_BACKUP_FORMAT, "format_version": DATA_BACKUP_FORMAT_VERSION,
        "created_at": "2026-10-07T12:00:00Z", "application_version": "0.1.0", "events": events,
        "settings": { "stargazer_theme_id": null, "stargazer_theme_customization": null, "stargazer_import_column_mappings": null, "stargazer_applicant_display_columns": null, "stargazer:lastLocation": null }
    })
}

fn validate_manifest_value(value: &serde_json::Value) -> Result<DataBackupManifest, String> {
    validate_manifest_bytes(&serde_json::to_vec(value).expect("manifestを直列化できません"))
}

fn write_zip(path: &Path, entries: &[(String, Vec<u8>)]) {
    let mut archive = zip::ZipWriter::new(File::create(path).expect("ZIPを作成できません"));
    for (name, bytes) in entries {
        archive.start_file(name, zip::write::SimpleFileOptions::default()).expect("ZIP項目を作成できません");
        archive.write_all(bytes).expect("ZIP項目を書き込めません");
    }
    archive.finish().expect("ZIPを確定できません");
}

#[test]
fn current_manifest_preserves_events_and_nullable_device_settings() {
    let manifest = validate_manifest_value(&manifest_value(&["EventA"])).expect("現行manifestを受け付けません");
    assert_eq!(manifest.events, vec!["EventA"]);
    assert!(manifest.settings.stargazer_theme_id.is_none());
    assert!(manifest.settings.stargazer_last_location.is_none());
}

#[test]
fn manifest_rejects_old_formats_unknown_keys_and_invalid_creation_metadata() {
    for (key, value) in [("format", serde_json::json!("other")), ("format_version", serde_json::json!(1)), ("created_at", serde_json::json!("invalid")), ("application_version", serde_json::json!(" ")), ("unknown", serde_json::json!(true))] {
        let mut manifest = manifest_value(&[]);
        manifest[key] = value;
        assert!(validate_manifest_value(&manifest).is_err(), "{key}");
    }
    assert!(validate_manifest_bytes(b"not json").is_err());
    let mut manifest = manifest_value(&[]);
    manifest["settings"].as_object_mut().expect("設定はobjectです").remove("stargazer_theme_id");
    assert!(validate_manifest_value(&manifest).is_err());
}

#[test]
fn manifest_requires_sorted_unique_valid_event_names_and_matching_last_event() {
    for events in [vec!["B", "A"], vec!["A", "A"], vec!["A", "a"], vec!["../outside"]] {
        assert!(validate_manifest_value(&manifest_value(&events)).is_err());
    }
    let mut manifest = manifest_value(&["EventA"]);
    manifest["settings"]["stargazer:lastLocation"] = serde_json::json!("{\"eventName\":\"EventB\"}");
    assert!(validate_manifest_value(&manifest).is_err());
    manifest["settings"]["stargazer:lastLocation"] = serde_json::json!("{\"eventName\":\"EventA\"}");
    assert!(validate_manifest_value(&manifest).is_ok());
}

#[test]
fn device_settings_reject_invalid_theme_mapping_and_display_column_contracts() {
    for (key, value) in [("stargazer_theme_id", "unknown"), ("stargazer_theme_customization", "{}"), ("stargazer_import_column_mappings", "{\"version\":2,\"entries\":[]}"), ("stargazer_applicant_display_columns", "{\"version\":1,\"entries\":[{\"schema\":[\"備考\"],\"selectedColumnIds\":[\"raw_extra:2\"]}]}"), ("stargazer:lastLocation", "invalid")] {
        let mut manifest = manifest_value(&[]);
        manifest["settings"][key] = serde_json::json!(value);
        assert!(validate_manifest_value(&manifest).is_err(), "{key}");
    }
}

#[test]
fn archive_rejects_paths_outside_managed_event_database_entries() {
    let directory = TestDir::new();
    let zip_path = directory.0.join("backup.zip");
    let manifest = serde_json::to_vec(&manifest_value(&[])).expect("manifestを直列化できません");
    for entry in ["../outside.txt", "Data/../shared/db/stargazer.db", "Data/A/private.txt", "Data/A/shared/db/other.db", "Data/A/shared/db/stargazer.db/extra"] {
        write_zip(&zip_path, &[(DATA_BACKUP_MANIFEST_ENTRY.to_string(), manifest.clone()), (entry.to_string(), vec![1])]);
        assert!(inspect_backup_archive(&zip_path).is_err(), "{entry}");
        assert!(!directory.0.join("outside.txt").exists());
    }
}

#[test]
fn archive_requires_manifest_and_event_list_matching_database_entries() {
    let directory = TestDir::new();
    let zip_path = directory.0.join("backup.zip");
    write_zip(&zip_path, &[]);
    assert!(inspect_backup_archive(&zip_path).is_err());
    write_zip(&zip_path, &[(backup_database_entry_name("A"), vec![1])]);
    assert!(inspect_backup_archive(&zip_path).is_err());
    let manifest = serde_json::to_vec(&manifest_value(&["A"])).expect("manifestを直列化できません");
    write_zip(&zip_path, &[(DATA_BACKUP_MANIFEST_ENTRY.to_string(), manifest)]);
    assert!(inspect_backup_archive(&zip_path).is_err());
}

#[cfg(target_os = "windows")]
#[test]
fn data_path_boundary_preserves_case_separator_and_sibling_rules() {
    let root = Path::new(r"C:\Apps\Stargazer\Data\");
    for candidate in [r"C:\Apps\Stargazer\Data", r"c:\apps\stargazer\data\A", "C:\\Apps\\Stargazer\\Data/A"] {
        assert!(path_is_within(Path::new(candidate), root), "{candidate}");
    }
    for candidate in [r"C:\Apps\Stargazer\Data-other", r"C:\Apps\Stargazer", r"D:\Apps\Stargazer\Data"] {
        assert!(!path_is_within(Path::new(candidate), root), "{candidate}");
    }
}

#[test]
fn archive_extracts_current_database_and_preserves_persisted_rows() {
    let directory = TestDir::new();
    let original = directory.0.join("original.db");
    let mut connection = rusqlite::Connection::open(&original).expect("DBを作成できません");
    configure_connection(&connection).expect("DBを設定できません");
    initialize_schema(&mut connection, SHARED_SCHEMA, "イベント共有", SHARED_REQUIRED_TABLES, SHARED_SCHEMA_QUERIES).expect("現行schemaを作成できません");
    connection.execute("INSERT INTO casts(name) VALUES ('保存済みキャスト')", []).expect("DBへ行を保存できません");
    drop(connection);
    let zip_path = directory.0.join("backup.zip");
    write_zip(&zip_path, &[(DATA_BACKUP_MANIFEST_ENTRY.to_string(), serde_json::to_vec(&manifest_value(&["A"])).expect("manifestを直列化できません")), (backup_database_entry_name("A"), std::fs::read(&original).expect("DBを読み取れません"))]);
    let staging = directory.0.join("staging");
    std::fs::create_dir(&staging).expect("一時Dataを作成できません");
    let manifest = extract_backup_to_staging(&zip_path, &staging).expect("ZIPを展開できません");
    let restored = staging.join("A/shared/db/stargazer.db");
    let connection = rusqlite::Connection::open(&restored).expect("復元DBを開けません");
    assert_eq!(connection.query_row("SELECT name FROM casts", [], |row| row.get::<_, String>(0)).expect("保存済み行を読めません"), "保存済みキャスト");
    drop(connection);
    let pending = PendingDataRestore { restore_token: "test".to_string(), staging_data_root: staging, events: manifest.events, settings: manifest.settings };
    assert!(validate_staged_restore(&pending).is_ok());
    std::fs::remove_file(&restored).expect("テストDBを削除できません");
    assert!(validate_staged_restore(&pending).is_err());
    assert!(original.exists());
}

#[test]
fn extraction_rejects_database_with_noncurrent_schema() {
    let directory = TestDir::new();
    let original = directory.0.join("old.db");
    let connection = rusqlite::Connection::open(&original).expect("旧形式DBを作成できません");
    connection.execute("CREATE TABLE old_data(value TEXT)", []).expect("旧形式tableを作成できません");
    drop(connection);
    let zip_path = directory.0.join("backup.zip");
    write_zip(&zip_path, &[(DATA_BACKUP_MANIFEST_ENTRY.to_string(), serde_json::to_vec(&manifest_value(&["A"])).expect("manifestを直列化できません")), (backup_database_entry_name("A"), std::fs::read(&original).expect("DBを読み取れません"))]);
    let staging = directory.0.join("staging");
    std::fs::create_dir(&staging).expect("一時Dataを作成できません");
    assert!(extract_backup_to_staging(&zip_path, &staging).is_err());
    assert!(original.exists());
}

#[test]
fn archive_publication_replaces_file_and_rolls_back_failed_replacement() {
    let directory = TestDir::new();
    let destination = directory.0.join("backup.zip");
    let temporary = directory.0.join("writing.tmp");
    std::fs::write(&destination, b"previous").expect("既存ファイルを書き込めません");
    assert!(publish_backup_archive(&temporary, &destination).is_err());
    assert_eq!(std::fs::read(&destination).expect("既存ファイルを読めません"), b"previous");
    std::fs::write(&temporary, b"new").expect("一時ファイルを書き込めません");
    publish_backup_archive(&temporary, &destination).expect("ファイルを置換できません");
    assert_eq!(std::fs::read(&destination).expect("置換ファイルを読めません"), b"new");
    assert!(!temporary.exists());
    assert_eq!(std::fs::read_dir(&directory.0).expect("テストdirectoryを読めません").count(), 1);
}

#[test]
fn archive_publication_does_not_replace_directory() {
    let directory = TestDir::new();
    let destination = directory.0.join("backup.zip");
    let temporary = directory.0.join("writing.tmp");
    std::fs::create_dir(&destination).expect("保存先directoryを作成できません");
    std::fs::write(&temporary, b"new").expect("一時ファイルを書き込めません");
    assert!(publish_backup_archive(&temporary, &destination).is_err());
    assert!(destination.is_dir());
    assert!(temporary.is_file());
}
