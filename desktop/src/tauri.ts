import { invoke, isTauri } from '@tauri-apps/api/core';

/** 外部URLをTauriではbackend経由、ブラウザ開発時は新しいタブで開く。 */
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
