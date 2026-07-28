/**
 * 端末単位の表示設定を保存する localStorage 境界。
 * 応募者、抽選結果、抽選・マッチング条件などの業務データはSQLiteへ保存する。
 */

import { STORAGE_KEYS } from '@/common/config';
import {
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from '@/common/browserStorage';
import { DEFAULT_THEME_ID, THEME_IDS, type ThemeId } from '@/common/themes';
import {
  DEFAULT_THEME_CUSTOMIZATION,
  normalizeThemeCustomization,
  type ThemeCustomizationState,
} from '@/common/themeCustomization';

/** JSON 文字列を object として読み取る。壊れた JSON や配列は復元不可として扱う。 */
function parseStoredObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** localStorage から初期テーマを復元する。未保存または不正値なら既定テーマを返す。 */
export function getInitialThemeId(): ThemeId {
  const raw = readBrowserStorageItem(STORAGE_KEYS.THEME);
  if (!raw) return DEFAULT_THEME_ID;
  const id = raw.trim();
  return THEME_IDS.includes(id as ThemeId) ? (id as ThemeId) : DEFAULT_THEME_ID;
}

/** localStorage からテーマカラー設定を復元する。壊れた値は既定設定に戻す。 */
export function getInitialThemeCustomization(): ThemeCustomizationState {
  const stored = parseStoredObject(readBrowserStorageItem(STORAGE_KEYS.THEME_CUSTOMIZATION));
  return stored ? normalizeThemeCustomization(stored) : DEFAULT_THEME_CUSTOMIZATION;
}

/** テーマ選択を localStorage に保存する。 */
export function persistTheme(themeId: ThemeId): void {
  writeBrowserStorageItem(STORAGE_KEYS.THEME, themeId);
}

/** テーマカラー設定を localStorage に保存する。 */
export function persistThemeCustomization(customization: ThemeCustomizationState): void {
  writeBrowserStorageItem(STORAGE_KEYS.THEME_CUSTOMIZATION, JSON.stringify(normalizeThemeCustomization(customization)));
}
