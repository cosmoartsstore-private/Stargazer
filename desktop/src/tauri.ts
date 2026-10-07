import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getBrowserStorage, readBrowserStorageItemResult } from '@/common/browserStorage';
import { STORAGE_KEYS } from '@/common/config';

export interface DataBackupDeviceSettings {
  stargazer_theme_id: string | null;
  stargazer_theme_customization: string | null;
  stargazer_import_column_mappings: string | null;
  stargazer_applicant_display_columns: string | null;
  'stargazer:lastLocation': string | null;
}

export interface PreparedDataRestore {
  restore_token: string;
}

export interface DataRestoreResult {
  settings: DataBackupDeviceSettings;
  cleanup_warning: string | null;
}

const DATA_BACKUP_FILTER = [{ name: 'Stargazer バックアップ', extensions: ['zip'] }];
const DEVICE_SETTING_KEYS = [STORAGE_KEYS.THEME, STORAGE_KEYS.THEME_CUSTOMIZATION, STORAGE_KEYS.IMPORT_COLUMN_MAPPINGS, STORAGE_KEYS.APPLICANT_DISPLAY_COLUMNS, STORAGE_KEYS.LAST_LOCATION] as const;

function getDefaultBackupFileName(): string {
  const now = new Date();
  const datePart = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
  const timePart = [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0')].join('');
  return `Stargazer-backup-${datePart}-${timePart}.zip`;
}

function requireDesktopApp(): void {
  if (!isTauri()) {
    throw new Error('データのバックアップと復元はデスクトップアプリでのみ利用できます。');
  }
}

/** Dataと同じZIPへ含める、現在の端末設定5種を取得する。 */
export function getDataBackupDeviceSettings(): DataBackupDeviceSettings {
  const readSetting = (key: string): string | null => {
    const result = readBrowserStorageItemResult(key);
    if (!result.ok) {
      throw new Error('端末設定を読み取れないため、バックアップを作成できません。');
    }
    return result.value;
  };
  return { stargazer_theme_id: readSetting(STORAGE_KEYS.THEME), stargazer_theme_customization: readSetting(STORAGE_KEYS.THEME_CUSTOMIZATION), stargazer_import_column_mappings: readSetting(STORAGE_KEYS.IMPORT_COLUMN_MAPPINGS), stargazer_applicant_display_columns: readSetting(STORAGE_KEYS.APPLICANT_DISPLAY_COLUMNS), 'stargazer:lastLocation': readSetting(STORAGE_KEYS.LAST_LOCATION) };
}

/** OSの保存ダイアログでバックアップZIPの保存先を選択する。 */
export async function selectDataBackupDestination(): Promise<string | null> {
  requireDesktopApp();
  return save({ defaultPath: getDefaultBackupFileName(), filters: DATA_BACKUP_FILTER });
}

/** OSの読込ダイアログで復元元のバックアップZIPを選択する。 */
export async function selectDataBackupSource(): Promise<string | null> {
  requireDesktopApp();
  const selected = await open({ multiple: false, directory: false, filters: DATA_BACKUP_FILTER });
  return typeof selected === 'string' ? selected : null;
}

/** 書込みを停止してDB接続を閉じた呼出元から、全イベントのバックアップを作成する。 */
export async function createDataBackupArchive(destinationPath: string, settings: DataBackupDeviceSettings): Promise<void> {
  requireDesktopApp();
  await invoke<void>('create_data_backup_archive', { destinationPath, settings });
}

/** 復元前にZIP全体を一時Dataへ展開し、manifest・パス・現行schemaを検証する。 */
export async function prepareDataBackupRestore(sourcePath: string): Promise<PreparedDataRestore> {
  requireDesktopApp();
  return invoke<PreparedDataRestore>('prepare_data_backup_restore', { sourcePath });
}

/** 検証済みの一時Dataを破棄する。 */
export async function cancelPreparedDataBackupRestore(restoreToken: string): Promise<void> {
  requireDesktopApp();
  await invoke<void>('cancel_prepared_data_backup_restore', { restoreToken });
}

/** DB接続を閉じた呼出元から、検証済みDataを現在のDataへ安全に置き換える。 */
export async function commitPreparedDataBackupRestore(restoreToken: string): Promise<DataRestoreResult> {
  requireDesktopApp();
  return invoke<DataRestoreResult>('commit_prepared_data_backup_restore', { restoreToken });
}

/** 復元した5設定をまとめて反映し、途中で失敗した場合は以前の値へ戻す。 */
export function applyRestoredDeviceSettings(settings: DataBackupDeviceSettings): void {
  const storage = getBrowserStorage();
  if (!storage) throw new Error('端末設定の保存領域を利用できません。');
  const previous = new Map<string, string | null>();
  for (const key of DEVICE_SETTING_KEYS) previous.set(key, storage.getItem(key));

  try {
    for (const key of DEVICE_SETTING_KEYS) {
      const value = settings[key];
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  } catch (error) {
    try {
      for (const key of DEVICE_SETTING_KEYS) {
        const value = previous.get(key) ?? null;
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      }
    } catch {
      throw new Error('復元した端末設定を反映できず、以前の設定にも戻せませんでした。');
    }
    throw error;
  }
}

/** 外部URLをTauriではBackend経由、ブラウザ開発時は新しいタブで開く。 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    await invoke<void>('open_external_url', { url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** StellaRecord連携先がこの端末で利用できるか確認する。ブラウザ実行時は利用不可とする。 */
export async function isStellaRecordAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>('check_stellarecord_available');
}

/** 現在のStargazerをStellaRecordへ登録する。 */
export async function registerToStellaRecord(): Promise<void> {
  if (!isTauri()) {
    throw new Error('StellaRecordへの登録はデスクトップアプリでのみ利用できます。');
  }
  await invoke<void>('register_to_stellarecord');
}
