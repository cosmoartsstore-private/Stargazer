import React from 'react';
import type { ThemeId } from '@/common/themes';

export const ThemeSelector: React.FC<{
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}> = ({ themeId, setThemeId }) => (
  <div className="sidebar-theme-pills" role="group" aria-label="テーマ">
    <button
      type="button"
      className={`sidebar-theme-pill${themeId === 'dark' ? ' active' : ''}`}
      onClick={() => setThemeId('dark')}
    >
      デフォルト
    </button>
    <button
      type="button"
      className={`sidebar-theme-pill${themeId === 'skyblue' ? ' active' : ''}`}
      onClick={() => setThemeId('skyblue')}
    >
      チェック
    </button>
  </div>
);
