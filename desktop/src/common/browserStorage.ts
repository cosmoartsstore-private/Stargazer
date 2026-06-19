/**
 * ブラウザ localStorage の安全なアクセス境界。
 * SSR・テスト・権限拒否環境では、呼び出し側が復旧可能な失敗値を受け取れるようにする。
 */

export type BrowserStorageReadResult =
  | { ok: true; value: string | null }
  | { ok: false; value: null };

/** 使用可能な localStorage を返す。ブラウザ外または権限拒否時は null を返す。 */
export function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** localStorage の文字列値を、読み取り成否つきで取得する。 */
export function readBrowserStorageItemResult(key: string): BrowserStorageReadResult {
  const storage = getBrowserStorage();
  if (!storage) return { ok: false, value: null };
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false, value: null };
  }
}

/** localStorage の文字列値を読み取る。読み取れない場合は未保存と同じ null を返す。 */
export function readBrowserStorageItem(key: string): string | null {
  const result = readBrowserStorageItemResult(key);
  return result.ok ? result.value : null;
}

/** localStorage へ文字列値を書き込む。成功した場合だけ true を返す。 */
export function writeBrowserStorageItem(key: string, value: string): boolean {
  const storage = getBrowserStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** localStorage の指定キーを削除する。成功した場合だけ true を返す。 */
export function removeBrowserStorageItem(key: string): boolean {
  const storage = getBrowserStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
