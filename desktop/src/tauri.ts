/**
 * Tauri の invoke を安全に使うためのラッパー。
 * ブラウザで直接開いた場合（npm run dev のみ）は invoke が undefined になるため、
 * ここで存在チェックしてエラーメッセージを出す。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CoreModule = { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } | any;

import * as core from '@tauri-apps/api/core';

const TAURI_REQUIRED_MSG =
  'Tauri のウィンドウで実行してください。ブラウザで開いている場合は、npm run tauri:dev で起動してください。';

function getInvoke(): (cmd: string, args?: Record<string, unknown>) => Promise<unknown> {
  const mod = core as CoreModule;
  const base = mod?.default ?? mod;
  const fn = base != null && typeof (base as { invoke?: unknown }).invoke === 'function'
    ? (base as { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }).invoke
    : undefined;
  if (typeof fn !== 'function') {
    throw new Error(TAURI_REQUIRED_MSG);
  }
  return fn;
}

/** Tauri の invoke。ブラウザのみで開いていると undefined になるため、このラッパー経由で呼ぶ。 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const fn = getInvoke();
  return fn(cmd, args) as Promise<T>;
}

/** Tauri アプリ内で実行されているか。ブラウザで開いている場合は false。 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return w.__TAURI__ != null || w.__TAURI_INTERNALS__ != null;
}
