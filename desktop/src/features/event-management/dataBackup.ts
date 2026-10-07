// Data全体を扱う間、repository書込みとSQLite接続を同じ境界で停止する。

import { closeEvent, openEvent } from '@/db/database';
import { runWithEventLifecycleLock } from '@/db/repositories/commandContext';
import { cancelPreparedDataBackupRestore, commitPreparedDataBackupRestore, createDataBackupArchive, prepareDataBackupRestore, type DataBackupDeviceSettings, type DataRestoreResult } from '@/tauri';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 共有DBの書込みを完了して接続を閉じ、WAL確定済みのバックアップを作成後に開き直す。 */
export async function createBackupWithClosedEvent(currentEventName: string | null, destinationPath: string, settings: DataBackupDeviceSettings): Promise<void> {
  await runWithEventLifecycleLock(
    currentEventName === null ? [] : [currentEventName],
    async () => {
      if (currentEventName !== null) await closeEvent();
      let backupError: unknown = null;
      try {
        await createDataBackupArchive(destinationPath, settings);
      } catch (error) {
        backupError = error;
      }

      if (currentEventName !== null) {
        try {
          await openEvent(currentEventName);
        } catch (reopenError) {
          const detail = errorMessage(reopenError);
          if (backupError !== null) {
            throw new Error(`${errorMessage(backupError)} また、使用中のイベントを開き直せませんでした: ${detail}`);
          }
          throw new Error(`バックアップは作成されましたが、使用中のイベントを開き直せませんでした: ${detail}`);
        }
      }
      if (backupError !== null) throw backupError;
    },
  );
}

/** 書込み停止中にZIP検証とData置換を続け、失敗した場合だけ元の接続を開き直す。 */
export async function restoreBackupWithClosedEvent(currentEventName: string | null, sourcePath: string): Promise<DataRestoreResult> {
  return runWithEventLifecycleLock(
    currentEventName === null ? [] : [currentEventName],
    async () => {
      let restoreToken: string | null = null;
      let connectionWasClosed = false;
      try {
        const prepared = await prepareDataBackupRestore(sourcePath);
        restoreToken = prepared.restore_token;
        if (currentEventName !== null) {
          await closeEvent();
          connectionWasClosed = true;
        }
        const result = await commitPreparedDataBackupRestore(prepared.restore_token);
        restoreToken = null;
        return result;
      } catch (restoreError) {
        if (restoreToken !== null) {
          await cancelPreparedDataBackupRestore(restoreToken).catch(() => undefined);
        }
        if (connectionWasClosed && currentEventName !== null) {
          try {
            await openEvent(currentEventName);
          } catch (reopenError) {
            throw new Error(`${errorMessage(restoreError)} また、使用中のイベントを開き直せませんでした: ${errorMessage(reopenError)}`);
          }
        }
        throw restoreError;
      }
    },
  );
}
