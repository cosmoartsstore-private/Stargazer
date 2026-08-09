import type { ThemeId } from './themes';

// 背景グラデーションの編集UIで許可する色数。
export const CUSTOM_THEME_MAX_COLORS = 5;
const CUSTOM_THEME_MIN_COLORS = 1;

export interface DefaultThemeCustomization {
  accent: string;
  colors: string[];
  direction: number;
  intensity: number;
}

export interface CheckThemeCustomization {
  hue: number;
}

export interface ThemeCustomizationState {
  dark: DefaultThemeCustomization;
  skyblue: CheckThemeCustomization;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

// 各テーマの初期表示と、保存値が不正な場合の復元先。
export const DEFAULT_THEME_CUSTOMIZATION: ThemeCustomizationState = {
  dark: {
    accent: '#5865F2',
    colors: ['#1A0A1A', '#05121B'],
    direction: 135,
    intensity: 70,
  },
  skyblue: {
    hue: 204,
  },
};

// darkテーマの強度計算と、accentから導出する状態色の配合規則。
const DARK_THEME_RECIPE = {
  gradientBaseAlpha: 0.22,
  gradientIntensityAlpha: 0.58,
  gradientFallback: '#0d0b1e',
  accentHoverShade: -0.18,
  hoverAlpha: 0.12,
  selectedAlpha: 0.18,
  borderAlpha: 0.34,
  linkShade: 0.24,
} as const;

// skyblueテーマで基準色相から各用途の色を導出するHSL規則。
const CHECK_THEME_RECIPE = {
  accentSaturation: 65,
  accentLightness: 50,
  accentHoverLightness: 43,
  deepTextSaturation: 54,
  deepTextLightness: 23,
  mutedTextSaturation: 44,
  mutedTextLightness: 34,
  mutedTextAlpha: 0.70,
  linkSaturation: 72,
  linkLightness: 41,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecordWithExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function isHexColor(value: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(value.trim()) || /^#?[0-9a-fA-F]{3}$/.test(value.trim());
}

/** CSS に渡す Hex 色を #RRGGBB 形式へ正規化する。 */
export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const raw = value.trim();
  if (!isHexColor(raw)) return fallback;
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  const expanded = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  return `#${expanded.toUpperCase()}`;
}

function isDefaultThemeCustomization(value: unknown): value is DefaultThemeCustomization {
  if (!isRecordWithExactKeys(value, ['accent', 'colors', 'direction', 'intensity'])) return false;
  return typeof value.accent === 'string'
    && isHexColor(value.accent)
    && Array.isArray(value.colors)
    && value.colors.length >= CUSTOM_THEME_MIN_COLORS
    && value.colors.length <= CUSTOM_THEME_MAX_COLORS
    && value.colors.every((color) => typeof color === 'string' && isHexColor(color))
    && isIntegerInRange(value.direction, 0, 360)
    && isIntegerInRange(value.intensity, 0, 100);
}

function isCheckThemeCustomization(value: unknown): value is CheckThemeCustomization {
  return isRecordWithExactKeys(value, ['hue']) && isIntegerInRange(value.hue, 0, 360);
}

/** 現行設定を検証し、一項目でも不正なら設定全体を既定値へ戻す。 */
export function normalizeThemeCustomization(value: unknown): ThemeCustomizationState {
  if (
    !isRecordWithExactKeys(value, ['dark', 'skyblue'])
    || !isDefaultThemeCustomization(value.dark)
    || !isCheckThemeCustomization(value.skyblue)
  ) {
    return DEFAULT_THEME_CUSTOMIZATION;
  }
  return {
    dark: {
      accent: normalizeHexColor(value.dark.accent, value.dark.accent),
      colors: value.dark.colors.map((color) => normalizeHexColor(color, color)),
      direction: value.dark.direction,
      intensity: value.dark.intensity,
    },
    skyblue: { hue: value.skyblue.hue },
  };
}

function parseHexColor(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex, '#000000').slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function rgba(color: RgbColor, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha.toFixed(3)})`;
}

function mixRgb(base: RgbColor, overlay: RgbColor, ratio: number): RgbColor {
  const clampedRatio = clamp(ratio, 0, 1);
  return {
    r: base.r + (overlay.r - base.r) * clampedRatio,
    g: base.g + (overlay.g - base.g) * clampedRatio,
    b: base.b + (overlay.b - base.b) * clampedRatio,
  };
}

function shadeHex(hex: string, ratio: number): string {
  const color = parseHexColor(hex);
  const target = ratio >= 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  return rgbToHex(mixRgb(color, target, Math.abs(ratio)));
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbColor {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;

  if (s === 0) {
    const value = l * 255;
    return { r: value, g: value, b: value };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const convert = (t: number) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };

  return {
    r: convert(h + 1 / 3) * 255,
    g: convert(h) * 255,
    b: convert(h - 1 / 3) * 255,
  };
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  return rgbToHex(hslToRgb(hue, saturation, lightness));
}

function rgbTriplet(color: RgbColor): string {
  return `${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}`;
}

function buildGradient(colors: readonly string[], direction: number, intensity: number): string {
  const alpha = DARK_THEME_RECIPE.gradientBaseAlpha
    + (clamp(intensity, 0, 100) / 100) * DARK_THEME_RECIPE.gradientIntensityAlpha;
  const stops = colors.map((color, index) => {
    const rgb = parseHexColor(color);
    const position = colors.length === 1 ? 0 : Math.round((index / (colors.length - 1)) * 100);
    return `${rgba(rgb, alpha)} ${position}%`;
  });
  return `linear-gradient(${direction}deg, ${stops.join(', ')}), ${DARK_THEME_RECIPE.gradientFallback}`;
}

function buildDarkVariables(customization: DefaultThemeCustomization): Record<string, string> {
  const accent = customization.accent;
  const accentRgb = parseHexColor(accent);
  return {
    '--theme-dark-background': buildGradient(customization.colors, customization.direction, customization.intensity),
    '--theme-dark-accent': accent,
    '--theme-dark-accent-hover': shadeHex(accent, DARK_THEME_RECIPE.accentHoverShade),
    '--theme-accent-rgb': rgbTriplet(accentRgb),
    '--theme-dark-hover': rgba(accentRgb, DARK_THEME_RECIPE.hoverAlpha),
    '--theme-dark-selected': rgba(accentRgb, DARK_THEME_RECIPE.selectedAlpha),
    '--theme-dark-border': rgba(accentRgb, DARK_THEME_RECIPE.borderAlpha),
    '--theme-dark-link': shadeHex(accent, DARK_THEME_RECIPE.linkShade),
  };
}

function buildCheckVariables(customization: CheckThemeCustomization): Record<string, string> {
  const hue = customization.hue;
  const accent = hslToHex(hue, CHECK_THEME_RECIPE.accentSaturation, CHECK_THEME_RECIPE.accentLightness);
  const accentRgb = hslToRgb(hue, CHECK_THEME_RECIPE.accentSaturation, CHECK_THEME_RECIPE.accentLightness);
  return {
    '--theme-check-hue': `${hue}`,
    '--theme-check-accent': accent,
    '--theme-check-accent-hover': hslToHex(hue, CHECK_THEME_RECIPE.accentSaturation, CHECK_THEME_RECIPE.accentHoverLightness),
    '--theme-check-deep-text': hslToHex(hue, CHECK_THEME_RECIPE.deepTextSaturation, CHECK_THEME_RECIPE.deepTextLightness),
    '--theme-check-muted-text': rgba(
      hslToRgb(
        hue,
        CHECK_THEME_RECIPE.mutedTextSaturation,
        CHECK_THEME_RECIPE.mutedTextLightness,
      ),
      CHECK_THEME_RECIPE.mutedTextAlpha,
    ),
    '--theme-check-link': hslToHex(hue, CHECK_THEME_RECIPE.linkSaturation, CHECK_THEME_RECIPE.linkLightness),
    '--theme-accent-rgb': rgbTriplet(accentRgb),
  };
}

/** 選択中テーマへ適用する CSS カスタムプロパティを返す。 */
export function buildThemeCssVariables(
  themeId: ThemeId,
  customization: ThemeCustomizationState,
): Record<string, string> {
  return themeId === 'skyblue'
    ? buildCheckVariables(customization.skyblue)
    : buildDarkVariables(customization.dark);
}
