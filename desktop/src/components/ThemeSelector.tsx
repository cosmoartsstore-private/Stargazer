// テーマ選択ダイアログとテーマ固有の色・方向・強度・色相設定を提供する。

import React, { type ChangeEvent, type CSSProperties, useEffect, useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { THEME_IDS, type ThemeId } from '@/common/themes';
import {
  CUSTOM_THEME_MAX_COLORS,
  DEFAULT_THEME_CUSTOMIZATION,
  isHexColor,
  normalizeHexColor,
  type DefaultThemeCustomization,
  type ThemeCustomizationState,
} from '@/common/themeCustomization';
import { AppDialog } from '@/components/AppDialog';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from './ThemeSelector.module.css';

type ThemeSelectorProps = {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  customization: ThemeCustomizationState;
  setCustomization: (customization: ThemeCustomizationState | ((prev: ThemeCustomizationState) => ThemeCustomizationState)) => void;
};

interface ThemeModeButtonProps {
  id: ThemeId;
  label: string;
  selected: boolean;
  onSelect: (id: ThemeId) => void;
}

function ThemeModeButton({ id, label, selected, onSelect }: ThemeModeButtonProps) {
  const handleClick = () => onSelect(id);
  const className = `${styles.themeModeButton}${selected ? ` ${styles.themeModeButtonActive}` : ''}`;

  return <button type="button" className={className} aria-pressed={selected} onClick={handleClick}>{label}</button>;
}

interface ThemeColorRowProps {
  index: number;
  color: string;
  draftColor: string;
  canRemove: boolean;
  onColorChange: (index: number, color: string) => void;
  onDraftColorChange: (index: number, color: string) => void;
  onDraftColorBlur: (index: number) => void;
  onRemove: (index: number) => void;
}

function ThemeColorRow({
  index,
  color,
  draftColor,
  canRemove,
  onColorChange,
  onDraftColorChange,
  onDraftColorBlur,
  onRemove,
}: ThemeColorRowProps) {
  const colorNumber = index + 1;
  const hexInputClassName = `${styles.themeHexInput}${
    isHexColor(draftColor) ? '' : ` ${styles.themeHexInputInvalid}`
  }`;
  const handleColorChange = (event: ChangeEvent<HTMLInputElement>) => {
    onColorChange(index, event.currentTarget.value);
  };
  const handleDraftColorChange = (event: ChangeEvent<HTMLInputElement>) => {
    onDraftColorChange(index, event.currentTarget.value);
  };
  const handleDraftColorBlur = () => onDraftColorBlur(index);
  const handleRemove = () => onRemove(index);

  return (
    <div className={styles.themeColorRow}>
      <input type="color" value={color} aria-label={getMsg('ThemeSelector.colorLabel', { index: colorNumber })} onChange={handleColorChange} />
      <input type="text" value={draftColor} aria-label={getMsg('ThemeSelector.colorHexLabel', { index: colorNumber })} className={hexInputClassName} onChange={handleDraftColorChange} onBlur={handleDraftColorBlur} />
      <button type="button" className={styles.themeIconButton} onClick={handleRemove} disabled={!canRemove} aria-label={getMsg('ThemeSelector.removeColor', { index: colorNumber })}><Trash2 size={14} /></button>
    </div>
  );
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ themeId, setThemeId, customization, setCustomization }) => {
  // ダイアログ表示と、16進数入力中の未確定値を保持する。
  const [open, setOpen] = useState(false);
  const [draftColors, setDraftColors] = useState<string[]>(customization.dark.colors);
  const customColorsHeadingId = useId();
  const directionInputId = useId();
  const intensityInputId = useId();
  const hueInputId = useId();

  useEffect(() => {
    setDraftColors(customization.dark.colors);
  }, [customization.dark.colors]);

  // ダークテーマの設定更新と、色配列の追加・削除・確定処理。
  const updateDefaultTheme = (patch: Partial<DefaultThemeCustomization>) => {
    setCustomization((prev) => ({
      ...prev,
      dark: { ...prev.dark, ...patch },
    }));
  };

  const updateColor = (index: number, color: string) => {
    const fallbackColor = customization.dark.colors[index]
      ?? DEFAULT_THEME_CUSTOMIZATION.dark.colors[0];
    const normalized = normalizeHexColor(color, fallbackColor);
    const nextColors = customization.dark.colors.map((current, currentIndex) => (
      currentIndex === index ? normalized : current
    ));
    setDraftColors(nextColors);
    updateDefaultTheme({ colors: nextColors });
  };

  const commitDraftColor = (index: number) => {
    const color = draftColors[index]
      ?? customization.dark.colors[index]
      ?? DEFAULT_THEME_CUSTOMIZATION.dark.colors[0];
    updateColor(index, color);
  };

  const addColor = () => {
    if (customization.dark.colors.length >= CUSTOM_THEME_MAX_COLORS) return;
    const nextColor = DEFAULT_THEME_CUSTOMIZATION.dark.colors[customization.dark.colors.length]
      ?? '#5865F2';
    const nextColors = [...customization.dark.colors, nextColor];
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

  // ダイアログと各設定入力のUIイベント。
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  const handleAccentChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateDefaultTheme({ accent: event.currentTarget.value });
  };
  const handleDraftColorChange = (index: number, color: string) => {
    const nextDraft = [...draftColors];
    nextDraft[index] = color;
    setDraftColors(nextDraft);
  };
  const handleDirectionChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateDefaultTheme({ direction: Number(event.currentTarget.value) });
  };
  const handleIntensityChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateDefaultTheme({ intensity: Number(event.currentTarget.value) });
  };
  const handleHueChange = (event: ChangeEvent<HTMLInputElement>) => {
    const hue = Number(event.currentTarget.value);
    setCustomization((prev) => ({
      ...prev,
      skyblue: { hue },
    }));
  };
  // 現在設定から、プレビューと選択ボタンの表示値を導出する。
  const getThemeName = (id: ThemeId) => getMsg(
    id === 'dark' ? 'ThemeSelector.darkThemeName' : 'ThemeSelector.skyblueThemeName',
  );
  const themePreviewStyle: CSSProperties = {
    background: `linear-gradient(${customization.dark.direction}deg, ${customization.dark.colors.join(', ')})`,
  };
  const huePreviewStyle = {
    '--preview-hue': customization.skyblue.hue,
  } as CSSProperties;

  return (
    <>
      <button type="button" className={`${shared.btnSecondary} ${styles.themeButton}`} onClick={handleOpen}>{getMsg('ThemeSelector.openButton')}</button>

      {open && (
        <AppDialog
          open={open}
          onOpenChange={setOpen}
          title={getMsg('ThemeSelector.dialogTitle')}
          description={getMsg('ThemeSelector.dialogDescription')}
          className={styles.themeDialog}
          showClose
          closeOnInteractOutside={false}
        >
          <div className={styles.themeModeSwitch} role="group" aria-label={getMsg('ThemeSelector.themeGroupLabel')}>
            {THEME_IDS.map((id) => (
              <ThemeModeButton key={id} id={id} label={getThemeName(id)} selected={themeId === id} onSelect={setThemeId} />
            ))}
          </div>

          {themeId === 'dark' ? (
            /* ダークテーマのグラデーション設定 */
            <div className={styles.themeEditorGrid}>
              <section className={styles.themeEditorPanel} aria-labelledby={customColorsHeadingId}>
                <div className={styles.themeEditorHeader}>
                  <span id={customColorsHeadingId}>{getMsg('ThemeSelector.customColors')}</span>
                  <button type="button" className={styles.themeIconButton} onClick={addColor} disabled={customization.dark.colors.length >= CUSTOM_THEME_MAX_COLORS} aria-label={getMsg('ThemeSelector.addColor')}><Plus size={14} /></button>
                </div>
                <div className={styles.themeAccentRow}>
                  <span>{getMsg('ThemeSelector.accent')}</span>
                  <input type="color" value={customization.dark.accent} aria-label={getMsg('ThemeSelector.accentAriaLabel')} onChange={handleAccentChange} />
                  <strong>{customization.dark.accent}</strong>
                </div>
                <div className={styles.themeColorList}>
                  {customization.dark.colors.map((color, index) => {
                    const draftColor = draftColors[index] ?? color;
                    return (
                      <ThemeColorRow
                        key={`theme-color-${index}`}
                        index={index}
                        color={color}
                        draftColor={draftColor}
                        canRemove={customization.dark.colors.length > 1}
                        onColorChange={updateColor}
                        onDraftColorChange={handleDraftColorChange}
                        onDraftColorBlur={commitDraftColor}
                        onRemove={removeColor}
                      />
                    );
                  })}
                </div>
              </section>

              <div className={styles.themeEditorPanel}>
                <label className={styles.themeRangeLabel} htmlFor={directionInputId}>
                  <span>{getMsg('ThemeSelector.direction')}</span>
                  <strong>{customization.dark.direction}°</strong>
                </label>
                <input id={directionInputId} type="range" min={0} max={360} value={customization.dark.direction} onChange={handleDirectionChange} />

                <label className={styles.themeRangeLabel} htmlFor={intensityInputId}>
                  <span>{getMsg('ThemeSelector.intensity')}</span>
                  <strong>{customization.dark.intensity}%</strong>
                </label>
                <input id={intensityInputId} type="range" min={0} max={100} value={customization.dark.intensity} onChange={handleIntensityChange} />

                <div className={styles.themePreview} style={themePreviewStyle} aria-hidden />
              </div>
            </div>
          ) : (
            /* スカイブルーテーマの色相設定 */
            <div className={styles.themeEditorPanel}>
              <label className={styles.themeRangeLabel} htmlFor={hueInputId}>
                <span>{getMsg('ThemeSelector.hue')}</span>
                <strong>{customization.skyblue.hue}°</strong>
              </label>
              <input id={hueInputId} type="range" min={0} max={360} value={customization.skyblue.hue} onChange={handleHueChange} />
              <div className={styles.themeHuePreview} style={huePreviewStyle} aria-hidden><span /><span /><span /></div>
            </div>
          )}

          <div className={styles.themeDialogFooter}>
            <button type="button" className={shared.btnSecondary} onClick={resetCurrentTheme}>{getMsg('common.resetToDefault')}</button>
            <button type="button" className={shared.btnPrimary} onClick={handleClose}>{getMsg('common.close')}</button>
          </div>
        </AppDialog>
      )}
    </>
  );
};
