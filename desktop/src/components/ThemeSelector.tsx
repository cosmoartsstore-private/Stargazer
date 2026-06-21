import React, { useEffect, useState } from 'react';
import { Palette, Plus, Trash2 } from '@/common/icons';
import { THEME_NAMES, type ThemeId } from '@/common/themes';
import {
  CUSTOM_THEME_MAX_COLORS,
  DEFAULT_THEME_CUSTOMIZATION,
  isHexColor,
  normalizeHexColor,
  type DefaultThemeCustomization,
  type ThemeCustomizationState,
} from '@/common/themeCustomization';
import { AppDialog } from '@/components/AppDialog';
import shared from '@/styles/shared.module.css';
import styles from './ThemeSelector.module.css';

export const ThemeSelector: React.FC<{
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  customization: ThemeCustomizationState;
  setCustomization: (customization: ThemeCustomizationState | ((prev: ThemeCustomizationState) => ThemeCustomizationState)) => void;
}> = ({ themeId, setThemeId, customization, setCustomization }) => {
  const [open, setOpen] = useState(false);
  const [draftColors, setDraftColors] = useState<string[]>(customization.dark.colors);

  useEffect(() => {
    setDraftColors(customization.dark.colors);
  }, [customization.dark.colors]);

  const updateDefaultTheme = (patch: Partial<DefaultThemeCustomization>) => {
    setCustomization((prev) => ({
      ...prev,
      dark: { ...prev.dark, ...patch },
    }));
  };

  const updateColor = (index: number, color: string) => {
    const normalized = normalizeHexColor(color, customization.dark.colors[index] ?? DEFAULT_THEME_CUSTOMIZATION.dark.colors[0]);
    const nextColors = customization.dark.colors.map((current, currentIndex) => currentIndex === index ? normalized : current);
    setDraftColors(nextColors);
    updateDefaultTheme({ colors: nextColors });
  };

  const commitDraftColor = (index: number) => {
    updateColor(index, draftColors[index] ?? customization.dark.colors[index] ?? DEFAULT_THEME_CUSTOMIZATION.dark.colors[0]);
  };

  const addColor = () => {
    if (customization.dark.colors.length >= CUSTOM_THEME_MAX_COLORS) return;
    const nextColors = [...customization.dark.colors, DEFAULT_THEME_CUSTOMIZATION.dark.colors[customization.dark.colors.length] ?? '#5865F2'];
    setDraftColors(nextColors);
    updateDefaultTheme({ colors: nextColors });
  };

  const removeColor = (index: number) => {
    if (customization.dark.colors.length <= 1) return;
    const nextColors = customization.dark.colors.filter((_, currentIndex) => currentIndex !== index);
    setDraftColors(nextColors);
    updateDefaultTheme({ colors: nextColors });
  };

  const resetCurrentTheme = () => {
    setCustomization((prev) => ({
      ...prev,
      [themeId]: DEFAULT_THEME_CUSTOMIZATION[themeId],
    }));
  };

  return (
    <>
      <button
        type="button"
        className={`${shared.btnSecondary} ${styles.themeButton}`}
        onClick={() => setOpen(true)}
        title="テーマカラーを編集"
      >
        <Palette size={16} />
        <span>テーマを変更する</span>
      </button>

      {open && (
        <AppDialog
          open={open}
          onOpenChange={setOpen}
          title="テーマカラー"
          description="表示テーマとカラーを調整します。"
          className={styles.themeDialog}
          showClose
        >
          <div className={styles.themeModeSwitch} role="group" aria-label="テーマ">
            {(['dark', 'skyblue'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={`${styles.themeModeButton}${themeId === id ? ` ${styles.themeModeButtonActive}` : ''}`}
                onClick={() => setThemeId(id)}
              >
                {THEME_NAMES[id]}
              </button>
            ))}
          </div>

          {themeId === 'dark' ? (
            <div className={styles.themeEditorGrid}>
              <section className={styles.themeEditorPanel}>
                <div className={styles.themeEditorHeader}>
                  <span>カスタムカラー</span>
                  <button
                    type="button"
                    className={styles.themeIconButton}
                    onClick={addColor}
                    disabled={customization.dark.colors.length >= CUSTOM_THEME_MAX_COLORS}
                    title="色を追加"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className={styles.themeAccentRow}>
                  <span>アクセント</span>
                  <input
                    type="color"
                    value={customization.dark.accent}
                    aria-label="アクセントカラー"
                    onChange={(event) => updateDefaultTheme({ accent: event.currentTarget.value })}
                  />
                  <strong>{customization.dark.accent}</strong>
                </div>
                <div className={styles.themeColorList}>
                  {customization.dark.colors.map((color, index) => (
                    <div key={`${index}-${color}`} className={styles.themeColorRow}>
                      <input
                        type="color"
                        value={color}
                        aria-label={`カラー ${index + 1}`}
                        onChange={(event) => updateColor(index, event.currentTarget.value)}
                      />
                      <input
                        type="text"
                        value={draftColors[index] ?? color}
                        aria-label={`カラー ${index + 1} Hex`}
                        className={`${styles.themeHexInput}${isHexColor(draftColors[index] ?? color) ? '' : ` ${styles.themeHexInputInvalid}`}`}
                        onChange={(event) => {
                          const nextDraft = [...draftColors];
                          nextDraft[index] = event.currentTarget.value;
                          setDraftColors(nextDraft);
                        }}
                        onBlur={() => commitDraftColor(index)}
                      />
                      <button
                        type="button"
                        className={styles.themeIconButton}
                        onClick={() => removeColor(index)}
                        disabled={customization.dark.colors.length <= 1}
                        title="色を削除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.themeEditorPanel}>
                <label className={styles.themeRangeLabel}>
                  <span>方向</span>
                  <strong>{customization.dark.direction}°</strong>
                </label>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={customization.dark.direction}
                  onChange={(event) => updateDefaultTheme({ direction: Number(event.currentTarget.value) })}
                />

                <label className={styles.themeRangeLabel}>
                  <span>強度</span>
                  <strong>{customization.dark.intensity}%</strong>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={customization.dark.intensity}
                  onChange={(event) => updateDefaultTheme({ intensity: Number(event.currentTarget.value) })}
                />

                <div
                  className={styles.themePreview}
                  style={{
                    background: `linear-gradient(${customization.dark.direction}deg, ${customization.dark.colors.join(', ')})`,
                  }}
                />
              </section>
            </div>
          ) : (
            <section className={styles.themeEditorPanel}>
              <label className={styles.themeRangeLabel}>
                <span>色相</span>
                <strong>{customization.skyblue.hue}°</strong>
              </label>
              <input
                type="range"
                min={0}
                max={360}
                value={customization.skyblue.hue}
                onChange={(event) => {
                  const hue = Number(event.currentTarget.value);
                  setCustomization((prev) => ({
                    ...prev,
                    skyblue: { hue },
                  }));
                }}
              />
              <div className={styles.themeHuePreview} style={{ ['--preview-hue' as string]: customization.skyblue.hue }}>
                <span />
                <span />
                <span />
              </div>
            </section>
          )}

          <div className={styles.themeDialogFooter}>
            <button type="button" className={shared.btnSecondary} onClick={resetCurrentTheme}>
              初期値に戻す
            </button>
            <button type="button" className={shared.btnPrimary} onClick={() => setOpen(false)}>
              閉じる
            </button>
          </div>
        </AppDialog>
      )}
    </>
  );
};
