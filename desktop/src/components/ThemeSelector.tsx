import React from 'react';
import { Palette } from '@/common/icons';
import type { ThemeId } from '@/common/themes';
import shared from '@/styles/shared.module.css';

export const ThemeSelector: React.FC<{
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}> = ({ themeId, setThemeId }) => {
  const toggleTheme = () => {
    setThemeId(themeId === 'dark' ? 'skyblue' : 'dark');
  };

  return (
    <button
      type="button"
      className={shared.btnSecondary}
      onClick={toggleTheme}
      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
    >
      <Palette size={16} />
      <span>テーマ切替：{themeId === 'dark' ? 'デフォルト' : 'チェック'}</span>
    </button>
  );
};
