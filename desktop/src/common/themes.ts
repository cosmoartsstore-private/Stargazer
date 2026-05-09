export const THEME_IDS = [
  'dark',
  'skyblue',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_NAMES: Record<ThemeId, string> = {
  dark: 'デフォルト',
  skyblue: 'チェック',
};

export const DEFAULT_THEME_ID: ThemeId = 'dark';
