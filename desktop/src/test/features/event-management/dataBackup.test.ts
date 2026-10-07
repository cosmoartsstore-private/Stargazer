import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackupWithClosedEvent, restoreBackupWithClosedEvent } from '@/features/event-management/dataBackup';

const boundary = vi.hoisted(() => ({ calls: [] as string[], close: vi.fn(), open: vi.fn(), create: vi.fn(), prepare: vi.fn(), commit: vi.fn(), cancel: vi.fn(), lock: vi.fn() }));
vi.mock('@/db/database', () => ({ closeEvent: boundary.close, openEvent: boundary.open }));
vi.mock('@/db/repositories/commandContext', () => ({ runWithEventLifecycleLock: boundary.lock }));
vi.mock('@/tauri', () => ({ createDataBackupArchive: boundary.create, prepareDataBackupRestore: boundary.prepare, commitPreparedDataBackupRestore: boundary.commit, cancelPreparedDataBackupRestore: boundary.cancel }));

const settings = { stargazer_theme_id: null, stargazer_theme_customization: null, stargazer_import_column_mappings: null, stargazer_applicant_display_columns: null, 'stargazer:lastLocation': null };
const result = { settings, cleanup_warning: null };

beforeEach(() => {
  vi.resetAllMocks();
  boundary.calls.length = 0;
  boundary.lock.mockImplementation(async (_events: string[], operation: () => Promise<unknown>) => {
    boundary.calls.push('lock');
    try { return await operation(); } finally { boundary.calls.push('unlock'); }
  });
  boundary.close.mockImplementation(async () => { boundary.calls.push('close'); });
  boundary.open.mockImplementation(async () => { boundary.calls.push('open'); });
  boundary.create.mockImplementation(async () => { boundary.calls.push('create'); });
  boundary.prepare.mockImplementation(async () => { boundary.calls.push('prepare'); return { restore_token: 'token' }; });
  boundary.commit.mockImplementation(async () => { boundary.calls.push('commit'); return result; });
  boundary.cancel.mockImplementation(async () => { boundary.calls.push('cancel'); });
});

describe('Dataバックアップの接続境界', () => {
  it('使用中のイベントを閉じて作成し、開き直してから書込み停止を解除する', async () => {
    await createBackupWithClosedEvent('イベントA', 'backup.zip', settings);
    expect(boundary.calls).toEqual(['lock', 'close', 'create', 'open', 'unlock']);
    expect(boundary.lock).toHaveBeenCalledWith(['イベントA'], expect.any(Function));
    expect(boundary.create).toHaveBeenCalledWith('backup.zip', settings);
    expect(boundary.open).toHaveBeenCalledWith('イベントA');
  });

  it('イベント未選択では接続を操作せず作成する', async () => {
    await createBackupWithClosedEvent(null, 'backup.zip', settings);
    expect(boundary.calls).toEqual(['lock', 'create', 'unlock']);
    expect(boundary.lock).toHaveBeenCalledWith([], expect.any(Function));
  });

  it('接続を閉じられない場合はバックアップ作成を開始しない', async () => {
    const failure = new Error('接続終了失敗');
    boundary.close.mockRejectedValue(failure);
    await expect(createBackupWithClosedEvent('イベントA', 'backup.zip', settings)).rejects.toBe(failure);
    expect(boundary.create).not.toHaveBeenCalled();
    expect(boundary.open).not.toHaveBeenCalled();
    expect(boundary.calls[boundary.calls.length - 1]).toBe('unlock');
  });

  it('作成失敗時も元のイベントを開き直し、元の例外を返す', async () => {
    const failure = new Error('作成失敗');
    boundary.create.mockRejectedValue(failure);
    await expect(createBackupWithClosedEvent('イベントA', 'backup.zip', settings)).rejects.toBe(failure);
    expect(boundary.open).toHaveBeenCalledWith('イベントA');
  });

  it('作成成功後の接続復旧失敗は、作成済みであることを伝える', async () => {
    boundary.open.mockRejectedValue('接続失敗');
    await expect(createBackupWithClosedEvent('イベントA', 'backup.zip', settings)).rejects.toThrow('バックアップは作成されましたが、使用中のイベントを開き直せませんでした: 接続失敗');
  });

  it('作成と接続復旧がともに失敗した場合は両方の理由を返す', async () => {
    boundary.create.mockRejectedValue('作成失敗');
    boundary.open.mockRejectedValue(new Error('接続失敗'));
    await expect(createBackupWithClosedEvent('イベントA', 'backup.zip', settings)).rejects.toThrow('作成失敗 また、使用中のイベントを開き直せませんでした: 接続失敗');
  });

  it('イベント未選択の作成失敗も元の例外を保持する', async () => {
    const failure = new Error('作成失敗');
    boundary.create.mockRejectedValue(failure);
    await expect(createBackupWithClosedEvent(null, 'backup.zip', settings)).rejects.toBe(failure);
    expect(boundary.open).not.toHaveBeenCalled();
  });
});

describe('Data復元の接続境界', () => {
  it('検証後に接続を閉じて復元し、成功時は旧イベントを開き直さない', async () => {
    await expect(restoreBackupWithClosedEvent('イベントA', 'backup.zip')).resolves.toBe(result);
    expect(boundary.calls).toEqual(['lock', 'prepare', 'close', 'commit', 'unlock']);
    expect(boundary.prepare).toHaveBeenCalledWith('backup.zip');
    expect(boundary.commit).toHaveBeenCalledWith('token');
    expect(boundary.cancel).not.toHaveBeenCalled();
    expect(boundary.open).not.toHaveBeenCalled();
  });

  it('イベント未選択では接続を操作せず復元する', async () => {
    await expect(restoreBackupWithClosedEvent(null, 'backup.zip')).resolves.toBe(result);
    expect(boundary.calls).toEqual(['lock', 'prepare', 'commit', 'unlock']);
    expect(boundary.lock).toHaveBeenCalledWith([], expect.any(Function));
  });

  it('ZIP検証失敗時には使用中の接続を操作しない', async () => {
    const failure = new Error('検証失敗');
    boundary.prepare.mockRejectedValue(failure);
    await expect(restoreBackupWithClosedEvent('イベントA', 'backup.zip')).rejects.toBe(failure);
    expect(boundary.close).not.toHaveBeenCalled();
    expect(boundary.cancel).not.toHaveBeenCalled();
    expect(boundary.commit).not.toHaveBeenCalled();
  });

  it('接続終了失敗時は検証済み一時Dataを破棄し、復元を開始しない', async () => {
    const failure = new Error('接続終了失敗');
    boundary.close.mockRejectedValue(failure);
    await expect(restoreBackupWithClosedEvent('イベントA', 'backup.zip')).rejects.toBe(failure);
    expect(boundary.cancel).toHaveBeenCalledWith('token');
    expect(boundary.commit).not.toHaveBeenCalled();
    expect(boundary.open).not.toHaveBeenCalled();
  });

  it('復元失敗時は一時Dataを破棄して元のイベントを開き直す', async () => {
    const failure = new Error('復元失敗');
    boundary.commit.mockImplementation(async () => { boundary.calls.push('commit'); throw failure; });
    await expect(restoreBackupWithClosedEvent('イベントA', 'backup.zip')).rejects.toBe(failure);
    expect(boundary.calls).toEqual(['lock', 'prepare', 'close', 'commit', 'cancel', 'open', 'unlock']);
  });

  it('破棄の失敗が元の復元エラーと接続復旧を妨げない', async () => {
    const failure = new Error('復元失敗');
    boundary.commit.mockRejectedValue(failure);
    boundary.cancel.mockRejectedValue(new Error('破棄失敗'));
    await expect(restoreBackupWithClosedEvent('イベントA', 'backup.zip')).rejects.toBe(failure);
    expect(boundary.open).toHaveBeenCalledWith('イベントA');
  });

  it('復元と接続復旧がともに失敗した場合は両方の理由を返す', async () => {
    boundary.commit.mockRejectedValue('復元失敗');
    boundary.open.mockRejectedValue(new Error('接続失敗'));
    await expect(restoreBackupWithClosedEvent('イベントA', 'backup.zip')).rejects.toThrow('復元失敗 また、使用中のイベントを開き直せませんでした: 接続失敗');
  });

  it('イベント未選択の復元失敗では一時Dataだけを破棄する', async () => {
    const failure = new Error('復元失敗');
    boundary.commit.mockRejectedValue(failure);
    await expect(restoreBackupWithClosedEvent(null, 'backup.zip')).rejects.toBe(failure);
    expect(boundary.cancel).toHaveBeenCalledWith('token');
    expect(boundary.open).not.toHaveBeenCalled();
  });
});
