// アプリ全体のサイドバー、テーマ、データ読込状態、各機能画面の切替を構成する。

import React, { useState, useEffect, useMemo } from 'react';
import { Menu, X, Users, Settings, CalendarDays, HelpCircle } from 'lucide-react';
import { DataManagementPage } from '@/features/data-management/DataManagementPage';
import { InternalManagementPage } from '@/features/internal-management/InternalManagementPage';
import { EventManagementPage } from '@/features/event-management/EventManagementPage';
import { GuidePage } from '@/features/guide/GuidePage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ClickEffect } from '@/components/ClickEffect';
import { ConfirmDialog, NoticeDialog } from '@/components/ConfirmModal';
import { HeaderLogo } from '@/components/HeaderLogo';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useAppContext } from '@/stores/AppContext';
import type { PageType } from './appNavigation';
import { buildThemeCssVariables } from '@/common/themeCustomization';
import {
  getInitialThemeCustomization,
  getInitialThemeId,
  persistTheme,
  persistThemeCustomization,
} from '@/stores/app-storage-store';
import { useImportCommit } from '@/features/import/hooks/useImportCommit';
import { getVisiblePage, isPageActive, isSidebarPageDisabled } from './appNavigation';
import { useAppDataHydration } from './hooks/useAppDataHydration';
import styles from './AppContainer.module.css';
import { ThemeSelector } from '@/components/ThemeSelector';
import { getMsg } from '@/messages/getMsg';

interface SidebarItem {
  text: string;
  page: PageType;
  icon: React.ReactNode;
}

interface SidebarButtonProps {
  item: SidebarItem;
  isActive: boolean;
  disabled: boolean;
  onSelect: (page: PageType) => void;
}

const SidebarButton = ({ item, isActive, disabled, onSelect }: SidebarButtonProps) => {
  const handleClick = () => {
    if (!disabled) onSelect(item.page);
  };
  const className = [
    styles.sidebarButton,
    isActive ? styles.active : '',
    disabled ? styles.sidebarButtonDisabled : '',
  ].filter(Boolean).join(' ');
  const ariaLabel = disabled
    ? getMsg('AppContainer.disabledPage', { pageName: item.text })
    : item.text;

  return (
    <button type="button" className={className} onClick={handleClick} disabled={disabled} aria-disabled={disabled} aria-current={isActive ? 'page' : undefined} aria-label={ariaLabel}>
      {item.icon}
      <span className={styles.sidebarButtonLabel}>{item.text}</span>
    </button>
  );
};

export const AppContainer: React.FC = () => {
  // 全体レイアウトが調停する画面遷移とイベント選択を取得する。
  const {
    activePage,
    setActivePage,
    currentEventName,
  } = useAppContext();
  // 全体レイアウトと確認ダイアログの状態。
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  // テーマは実際にbodyへ適用するAppContainerが所有する。
  const [themeId, setThemeId] = useState(getInitialThemeId);
  const [themeCustomization, setThemeCustomizationState] = useState(getInitialThemeCustomization);
  const themeCssVariables = useMemo(
    () => buildThemeCssVariables(themeId, themeCustomization),
    [themeId, themeCustomization],
  );

  const setThemeCustomization: typeof setThemeCustomizationState = (stateOrUpdater) => {
    setThemeCustomizationState((prev) => {
      const next = typeof stateOrUpdater === 'function' ? stateOrUpdater(prev) : stateOrUpdater;
      persistThemeCustomization(next);
      return next;
    });
  };

  useEffect(() => {
    persistTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    document.body.dataset.theme = themeId;
    Object.entries(themeCssVariables).forEach(([key, value]) => {
      document.body.style.setProperty(key, value);
    });
    return () => {
      delete document.body.dataset.theme;
      Object.keys(themeCssVariables).forEach((key) => {
        document.body.style.removeProperty(key);
      });
    };
  }, [themeId, themeCssVariables]);

  const {
    isSharedDataLoading,
    isSessionDataLoading,
    requestSessionReload,
  } = useAppDataHydration({ onAlert: setAlertMessage });
  const {
    isMutationLoading,
    pendingImport,
    importUsers: handleImportUsers,
    confirmImportOverwrite: handleConfirmImportOverwrite,
    cancelImportOverwrite: handleCancelImportOverwrite,
  } = useImportCommit({
    onAlert: setAlertMessage,
    requestSessionReload,
  });
  const isDataLoading = isSharedDataLoading || isSessionDataLoading || isMutationLoading;

  // レイアウト部品から呼ばれる操作を、型付き引数で画面状態へ接続する。
  const handleToggleMenu = () => setIsMenuOpen((current) => !current);
  const handleCloseMenu = () => setIsMenuOpen(false);
  const handleCloseAlert = () => setAlertMessage(null);
  const handleSidebarPageSelect = (page: PageType) => {
    setActivePage(page);
    setIsMenuOpen(false);
  };

  // サイドバーの表示項目と、イベント状態を反映した実表示ページ。
  const sidebarButtons: SidebarItem[] = [
    { text: getMsg('AppContainer.dataManagement'), page: 'dataManagement', icon: <Users size={18} /> },
    { text: getMsg('AppContainer.internalManagement'), page: 'internalManagement', icon: <Settings size={18} /> },
    { text: getMsg('AppContainer.eventManagement'), page: 'eventManagement', icon: <CalendarDays size={18} /> },
    { text: getMsg('AppContainer.guide'), page: 'guide', icon: <HelpCircle size={18} /> },
  ];
  const visiblePage = getVisiblePage(activePage, currentEventName);

  const renderPage = () => {
    switch (visiblePage) {
      // 応募管理配下のページは、DataManagementPage 内のタブとして切り替える。
      case 'dataManagement':
      case 'lottery':
      case 'matching':
      case 'import':
        return <DataManagementPage onImportUsers={handleImportUsers} />;
      // 内部管理配下のページは、InternalManagementPage 内のタブとして切り替える。
      case 'internalManagement':
      case 'cast':
      case 'ngManagement':
      case 'tweet':
      case 'attendance':
        return <InternalManagementPage />;
      case 'eventManagement':
        return <EventManagementPage />;
      case 'guide':
        return <GuidePage />;
    }
  };

  return (
    <ErrorBoundary>
      <ClickEffect />
      <div className={styles.appContainer} data-theme={themeId} style={themeCssVariables as React.CSSProperties}>
        <div className={styles.mobileHeader} data-context="mobile-header">
          <HeaderLogo />
          <button type="button" className={styles.menuToggle} aria-label={getMsg(isMenuOpen ? 'AppContainer.closeMenu' : 'AppContainer.openMenu')} aria-expanded={isMenuOpen} aria-controls="app-sidebar" onClick={handleToggleMenu}>{isMenuOpen ? <X size={24} /> : <Menu size={24} />}</button>
        </div>
        <aside id="app-sidebar" className={`${styles.sidebar} ${isMenuOpen ? styles.open : ''}`}>
          <div className={styles.sidebarInner}>
            <div className={styles.sidebarTitle}><HeaderLogo /></div>
            <nav className={styles.sidebarNavigation} aria-label={getMsg('AppContainer.navigationLabel')}>
              {sidebarButtons.map((item) => {
                const disabled = isSidebarPageDisabled(item.page, currentEventName);
                return <SidebarButton key={item.page} item={item} isActive={!disabled && isPageActive(visiblePage, item.page)} disabled={disabled} onSelect={handleSidebarPageSelect} />;
              })}
            </nav>
            <div className={`${styles.sidebarBlock} ${styles.sidebarBlockPush}`} />
            <div className={`${styles.sidebarBlock} ${styles.sidebarThemeSlider}`}>
              <ThemeSelector themeId={themeId} setThemeId={setThemeId} customization={themeCustomization} setCustomization={setThemeCustomization} />
            </div>
          </div>
        </aside>
        {isMenuOpen && <button type="button" className={styles.overlay} aria-label={getMsg('AppContainer.closeMenu')} onClick={handleCloseMenu} />}
        {alertMessage !== null && (
          <NoticeDialog
            title={getMsg('AppContainer.dataManagement')}
            message={alertMessage}
            closeLabel={getMsg('common.close')}
            onClose={handleCloseAlert}
          />
        )}
        {pendingImport !== null && (
          <ConfirmDialog
            title={getMsg('AppContainer.importOverwriteTitle')}
            message={getMsg('AppContainer.importOverwriteMessage')}
            confirmLabel={getMsg('AppContainer.importOverwriteConfirm')}
            cancelLabel={getMsg('common.cancel')}
            onConfirm={handleConfirmImportOverwrite}
            onCancel={handleCancelImportOverwrite}
          />
        )}
        <main className={styles.mainContent}>
          {isDataLoading && <LoadingOverlay message={getMsg('AppContainer.dataLoading')} />}
          <div className={styles.mainContentScroll}>
            {renderPage()}
          </div>
        </main>
        <div id="modal-root" />
      </div>
    </ErrorBoundary>
  );
};
