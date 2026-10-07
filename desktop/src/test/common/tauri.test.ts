import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/common/config';
import * as bridge from '@/tauri';

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(), open: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: native.isTauri }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: native.open, save: native.save }));

const settings: bridge.DataBackupDeviceSettings = { stargazer_theme_id: 'dark', stargazer_theme_customization: null, stargazer_import_column_mappings: '{"version":1,"entries":[]}', stargazer_applicant_display_columns: null, 'stargazer:lastLocation': '{"eventName":"イベントA"}' };

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  vi.stubGlobal('window', { localStorage: storage });
  return { values, storage };
}

beforeEach(() => { vi.resetAllMocks(); native.isTauri.mockReturnValue(true); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('バックアップの端末設定', () => {
  it('設定5種を元の文字列と未保存値のまま読み取る', () => {
    const initial = Object.fromEntries(Object.entries(settings).filter((entry): entry is [string, string] => entry[1] !== null));
    const { storage } = installStorage(initial);
    expect(bridge.getDataBackupDeviceSettings()).toEqual(settings);
    expect(storage.getItem).toHaveBeenCalledTimes(5);
  });

  it('読込拒否時に未保存値としてバックアップしない', () => {
    const { storage } = installStorage();
    storage.getItem.mockImplementation(() => { throw new Error('読込拒否'); });
    expect(() => bridge.getDataBackupDeviceSettings()).toThrow('端末設定を読み取れないため、バックアップを作成できません。');
  });

  it('復元する設定5種を反映し、nullのキーだけ削除する', () => {
    const { values } = installStorage({ unrelated: '保持', [STORAGE_KEYS.THEME_CUSTOMIZATION]: '旧値' });
    bridge.applyRestoredDeviceSettings(settings);
    expect(Object.fromEntries(values)).toEqual({ unrelated: '保持', stargazer_theme_id: 'dark', stargazer_import_column_mappings: settings.stargazer_import_column_mappings, 'stargazer:lastLocation': settings['stargazer:lastLocation'] });
  });

  it('途中の書込み失敗では既存値と未保存状態を戻し、元の例外を返す', () => {
    const initial = { [STORAGE_KEYS.THEME]: 'skyblue', [STORAGE_KEYS.THEME_CUSTOMIZATION]: '旧値', unrelated: '保持' };
    const { values, storage } = installStorage(initial);
    const failure = new Error('書込拒否');
    let failed = false;
    storage.setItem.mockImplementation((key, value) => {
      if (!failed && key === STORAGE_KEYS.IMPORT_COLUMN_MAPPINGS) { failed = true; throw failure; }
      values.set(key, value);
    });
    expect(() => bridge.applyRestoredDeviceSettings(settings)).toThrow(failure);
    expect(Object.fromEntries(values)).toEqual(initial);
  });

  it('以前の値への復旧も失敗した場合はその状態を伝える', () => {
    const { storage } = installStorage({ [STORAGE_KEYS.THEME]: 'skyblue' });
    storage.setItem.mockImplementation(() => { throw new Error('書込拒否'); });
    expect(() => bridge.applyRestoredDeviceSettings(settings)).toThrow('復元した端末設定を反映できず、以前の設定にも戻せませんでした。');
  });

  it('保存領域がない場合は反映を開始しない', () => {
    vi.stubGlobal('window', undefined);
    expect(() => bridge.applyRestoredDeviceSettings(settings)).toThrow('端末設定の保存領域を利用できません。');
  });
});

describe('デスクトップcommandと選択ダイアログ', () => {
  it('日時付きZIP名と専用filterを保存ダイアログへ渡す', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 12, 34, 56));
    native.save.mockResolvedValue('chosen.zip');
    await expect(bridge.selectDataBackupDestination()).resolves.toBe('chosen.zip');
    expect(native.save).toHaveBeenCalledWith({ defaultPath: 'Stargazer-backup-20261007-123456.zip', filters: [{ name: 'Stargazer バックアップ', extensions: ['zip'] }] });
  });

  it.each(['chosen.zip', null, ['unexpected.zip']])('読込選択は単一パスだけを返す: %s', async (selected) => {
    native.open.mockResolvedValue(selected);
    await expect(bridge.selectDataBackupSource()).resolves.toBe(typeof selected === 'string' ? selected : null);
    expect(native.open).toHaveBeenCalledWith({ multiple: false, directory: false, filters: [{ name: 'Stargazer バックアップ', extensions: ['zip'] }] });
  });

  it('command名と引数の契約を保持して作成・検証・破棄・復元を呼ぶ', async () => {
    native.invoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ restore_token: 'token' }).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ settings, cleanup_warning: null });
    await bridge.createDataBackupArchive('destination.zip', settings);
    await expect(bridge.prepareDataBackupRestore('source.zip')).resolves.toEqual({ restore_token: 'token' });
    await bridge.cancelPreparedDataBackupRestore('token');
    await expect(bridge.commitPreparedDataBackupRestore('token')).resolves.toEqual({ settings, cleanup_warning: null });
    expect(native.invoke.mock.calls).toEqual([['create_data_backup_archive', { destinationPath: 'destination.zip', settings }], ['prepare_data_backup_restore', { sourcePath: 'source.zip' }], ['cancel_prepared_data_backup_restore', { restoreToken: 'token' }], ['commit_prepared_data_backup_restore', { restoreToken: 'token' }]]);
  });

  it('ブラウザ実行時はバックアップ操作をcommandへ渡さない', async () => {
    native.isTauri.mockReturnValue(false);
    for (const operation of [() => bridge.selectDataBackupDestination(), () => bridge.selectDataBackupSource(), () => bridge.createDataBackupArchive('destination.zip', settings), () => bridge.prepareDataBackupRestore('source.zip'), () => bridge.cancelPreparedDataBackupRestore('token'), () => bridge.commitPreparedDataBackupRestore('token')]) {
      await expect(operation()).rejects.toThrow('データのバックアップと復元はデスクトップアプリでのみ利用できます。');
    }
    expect(native.invoke).not.toHaveBeenCalled();
    expect(native.save).not.toHaveBeenCalled();
    expect(native.open).not.toHaveBeenCalled();
  });

  it('外部URLはデスクトップcommandまたはブラウザへ渡す', async () => {
    await bridge.openExternalUrl('https://example.test');
    expect(native.invoke).toHaveBeenCalledWith('open_external_url', { url: 'https://example.test' });
    const openWindow = vi.fn();
    vi.stubGlobal('window', { open: openWindow });
    native.isTauri.mockReturnValue(false);
    await bridge.openExternalUrl('https://example.test/browser');
    expect(openWindow).toHaveBeenCalledWith('https://example.test/browser', '_blank', 'noopener,noreferrer');
  });

  it('StellaRecordの確認と登録をデスクトップcommandへ渡す', async () => {
    native.invoke.mockResolvedValueOnce(true);
    await expect(bridge.isStellaRecordAvailable()).resolves.toBe(true);
    await bridge.registerToStellaRecord();
    expect(native.invoke.mock.calls).toEqual([['check_stellarecord_available'], ['register_to_stellarecord']]);
    native.isTauri.mockReturnValue(false);
    await expect(bridge.isStellaRecordAvailable()).resolves.toBe(false);
    await expect(bridge.registerToStellaRecord()).rejects.toThrow('StellaRecordへの登録はデスクトップアプリでのみ利用できます。');
    expect(native.invoke).toHaveBeenCalledTimes(2);
  });
});
