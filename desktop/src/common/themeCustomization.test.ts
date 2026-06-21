import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_CUSTOMIZATION,
  buildThemeCssVariables,
  normalizeHexColor,
  normalizeThemeCustomization,
} from './themeCustomization';

describe('themeCustomization', () => {
  it('Hex 色を #RRGGBB 形式に正規化する', () => {
    expect(normalizeHexColor('abc', '#000000')).toBe('#AABBCC');
    expect(normalizeHexColor('12aBef', '#000000')).toBe('#12ABEF');
    expect(normalizeHexColor('invalid', '#123456')).toBe('#123456');
  });

  it('保存済みテーマ設定の不正値を既定値へ戻す', () => {
    const normalized = normalizeThemeCustomization({
      dark: {
        accent: '#778899',
        colors: ['#123456', 'invalid', '#654321', '#abcdef', '#111111', '#222222'],
        direction: 999,
        intensity: -10,
      },
      skyblue: {
        hue: 999,
      },
    });

    expect(normalized.dark.colors).toEqual(['#123456', DEFAULT_THEME_CUSTOMIZATION.dark.colors[1], '#654321', '#ABCDEF', '#111111']);
    expect(normalized.dark.accent).toBe('#778899');
    expect(normalized.dark.direction).toBe(360);
    expect(normalized.dark.intensity).toBe(0);
    expect(normalized.skyblue.hue).toBe(360);
  });

  it('デフォルトテーマ用の CSS 変数を生成する', () => {
    const vars = buildThemeCssVariables('dark', DEFAULT_THEME_CUSTOMIZATION);

    expect(vars['--theme-dark-background']).toContain('linear-gradient');
    expect(vars['--theme-dark-accent']).toBe(DEFAULT_THEME_CUSTOMIZATION.dark.accent);
    expect(vars['--theme-accent-rgb']).toBe('88, 101, 242');
  });

  it('チェックテーマ用の CSS 変数は色相だけから生成する', () => {
    const vars = buildThemeCssVariables('skyblue', {
      ...DEFAULT_THEME_CUSTOMIZATION,
      skyblue: { hue: 120 },
    });

    expect(vars['--theme-check-hue']).toBe('120');
    expect(vars['--theme-check-accent']).toMatch(/^#[0-9A-F]{6}$/);
    expect(vars['--theme-check-deep-text']).toMatch(/^#[0-9A-F]{6}$/);
  });
});
