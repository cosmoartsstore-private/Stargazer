// アプリ全体のサイドバー、テーマ、データ読込状態、各機能画面の切替を構成する。

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Menu, X, Users, Settings, CalendarDays, HelpCircle } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
import {
  APPLICATION_PAGES,
  getDataManagementSidebarTarget,
  getVisiblePage,
  isPageActive,
  isSidebarPageDisabled,
} from './appNavigation';
import { useAppDataHydration } from './hooks/useAppDataHydration';
import styles from './AppContainer.module.css';
import { ThemeSelector } from '@/components/ThemeSelector';
import { getMsg } from '@/messages/getMsg';
import { flushPendingPageCommits } from '@/common/pageCommitRegistry';

interface SidebarItem {
  text: string;
  page: PageType;
  icon: React.ReactNode;
}

interface PendingEventBoundaryRequest {
  action: () => Promise<boolean>;
  resolve: (result: boolean) => void;
}

type EventBoundaryKind = 'switch' | 'rename';

interface SidebarButtonProps {
  item: SidebarItem;
  isActive: boolean;
  disabled: boolean;
  onSelect: (page: PageType) => void;
}

type GlobalDialogKind = 'dataLoadError' | 'alert' | 'import' | 'exit' | 'sessionBoundary' | 'eventBoundary' | 'theme';

const GLOBAL_DIALOG_KINDS: GlobalDialogKind[] = [
  'dataLoadError',
  'alert',
  'import',
  'sessionBoundary',
  'eventBoundary',
  'theme',
  'exit',
];

const MOBILE_SIDEBAR_QUERY = '(max-width: 768px)';

const SidebarButton = ({ item, isActive, disabled, onSelect }: SidebarButtonProps) => {
  const handleClick = () => {
    if (!disabled) onSelect(item.page);
  };
  // 編集欄からのクリックはblurによるbusy反映を待たず、遷移側の明示commitへ渡す。
  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) event.preventDefault();
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
    <button type="button" className={className} onMouseDown={handleMouseDown} onClick={handleClick} disabled={disabled} aria-disabled={disabled} aria-current={isActive ? 'page' : undefined} aria-label={ariaLabel}>
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
    currentSessionTimestamp,
    initializationError,
    discardCurrentSession,
    closeCurrentEventForExit,
    discardInProgressWorkAndClose,
  } = useAppContext();
  // 全体レイアウトと確認ダイアログの状態。
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [dataManagementPage, setDataManagementPage] = useState<PageType>('dataManagement');
  const [hasUnsavedDataManagementWork, setHasUnsavedDataManagementWork] = useState(false);
  const [isDataManagementBusy, setIsDataManagementBusy] = useState(false);
  const [isInternalManagementBusy, setIsInternalManagementBusy] = useState(false);
  const [isEventManagementBusy, setIsEventManagementBusy] = useState(false);
  const [isCloseChecking, setIsCloseChecking] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [isExitClosing, setIsExitClosing] = useState(false);
  const [sessionBoundaryRequested, setSessionBoundaryRequested] = useState(false);
  const [isSessionDiscarding, setIsSessionDiscarding] = useState(false);
  const [pendingEventBoundaryRequest, setPendingEventBoundaryRequest] = useState<PendingEventBoundaryRequest | null>(null);
  const [themeDialogRequested, setThemeDialogRequested] = useState(false);
  const [globalDialogOrder, setGlobalDialogOrder] = useState<GlobalDialogKind[]>([]);
  const [isMobileSidebar, setIsMobileSidebar] = useState(
    () => window.matchMedia(MOBILE_SIDEBAR_QUERY).matches,
  );
  const unsavedWorkRef = useRef(false);
  const closeCheckRunningRef = useRef(false);
  const dataOperationBusyRef = useRef(false);
  const exitClosingRef = useRef(false);
  const sessionDiscardingRef = useRef(false);
  const previousEventNameRef = useRef<string | null>(null);
  const previousSessionTimestampRef = useRef<string | null>(null);
  const currentSessionTimestampRef = useRef(currentSessionTimestamp);
  const closeCurrentEventForExitRef = useRef(closeCurrentEventForExit);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainContentScrollRef = useRef<HTMLDivElement>(null);
  const wasMobileMenuOpenRef = useRef(false);
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
    if (initializationError !== null) setAlertMessage(initializationError);
  }, [initializationError]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_SIDEBAR_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileSidebar(event.matches);
      if (!event.matches) setIsMenuOpen(false);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // モバイルサイドバーを開いたときは内部へフォーカスを移し、閉じた後は開閉ボタンへ戻す。
  useEffect(() => {
    if (!isMobileSidebar) {
      wasMobileMenuOpenRef.current = false;
      return;
    }
    if (isMenuOpen) {
      wasMobileMenuOpenRef.current = true;
      sidebarRef.current?.querySelector<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )?.focus();
      return;
    }
    if (
      wasMobileMenuOpenRef.current
      || sidebarRef.current?.contains(document.activeElement)
    ) {
      menuToggleRef.current?.focus();
    }
    wasMobileMenuOpenRef.current = false;
  }, [isMenuOpen, isMobileSidebar]);

  useEffect(() => {
    if (!isMobileSidebar || !isMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setIsMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen, isMobileSidebar]);

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
    dataLoadError,
    retryDataLoad,
    requestSessionReload,
  } = useAppDataHydration();
  const {
    isMutationLoading,
    pendingImport,
    importUsers: handleImportUsers,
    importNewUsers: handleImportNewUsers,
    confirmImportOverwrite: handleConfirmImportOverwrite,
    cancelImportOverwrite: handleCancelImportOverwrite,
  } = useImportCommit({
    onAlert: setAlertMessage,
    requestSessionReload,
  });
  const isDataLoading = isSharedDataLoading
    || isSessionDataLoading
    || isMutationLoading
    || isDataManagementBusy
    || isInternalManagementBusy
    || isEventManagementBusy
    || isCloseChecking;
  dataOperationBusyRef.current = isSharedDataLoading
    || isSessionDataLoading
    || isMutationLoading
    || isDataManagementBusy
    || isInternalManagementBusy
    || isEventManagementBusy;
  const isDataBlocked = isDataLoading || dataLoadError !== null;

  useEffect(() => {
    const requestedDialogs: GlobalDialogKind[] = [];
    if (dataLoadError !== null) requestedDialogs.push('dataLoadError');
    if (alertMessage !== null) requestedDialogs.push('alert');
    if (pendingImport !== null) requestedDialogs.push('import');
    if (sessionBoundaryRequested) requestedDialogs.push('sessionBoundary');
    if (pendingEventBoundaryRequest !== null) requestedDialogs.push('eventBoundary');
    if (themeDialogRequested) requestedDialogs.push('theme');
    if (exitConfirmOpen) requestedDialogs.push('exit');

    setGlobalDialogOrder((current) => {
      const retained = current.filter((kind) => requestedDialogs.includes(kind));
      const next = [
        ...retained,
        ...GLOBAL_DIALOG_KINDS.filter((kind) => (
          requestedDialogs.includes(kind) && !retained.includes(kind)
        )),
      ];
      return next.length === current.length
        && next.every((kind, index) => kind === current[index])
        ? current
        : next;
    });
  }, [
    alertMessage,
    dataLoadError,
    exitConfirmOpen,
    pendingEventBoundaryRequest,
    pendingImport,
    sessionBoundaryRequested,
    themeDialogRequested,
  ]);

  const isGlobalDialogRequested = (kind: GlobalDialogKind): boolean => {
    switch (kind) {
      case 'dataLoadError': return dataLoadError !== null;
      case 'alert': return alertMessage !== null;
      case 'import': return pendingImport !== null;
      case 'exit': return exitConfirmOpen;
      case 'sessionBoundary': return sessionBoundaryRequested;
      case 'eventBoundary': return pendingEventBoundaryRequest !== null;
      case 'theme': return themeDialogRequested;
    }
  };
  // 通常は発生順で表示する。終了要求だけは、保留操作を実行せずに応答できるよう先に出す。
  const activeGlobalDialog = exitConfirmOpen
    ? 'exit'
    : globalDialogOrder.find(isGlobalDialogRequested) ?? null;

  useEffect(() => {
    unsavedWorkRef.current = hasUnsavedDataManagementWork;
    currentSessionTimestampRef.current = currentSessionTimestamp;
    closeCurrentEventForExitRef.current = closeCurrentEventForExit;
  }, [closeCurrentEventForExit, currentSessionTimestamp, hasUnsavedDataManagementWork]);

  useEffect(() => {
    if (APPLICATION_PAGES.includes(activePage)) {
      setDataManagementPage(activePage);
    }
  }, [activePage]);

  useEffect(() => {
    const eventChanged = previousEventNameRef.current !== currentEventName;
    const sessionClosed = previousSessionTimestampRef.current !== null
      && currentSessionTimestamp === null;
    previousEventNameRef.current = currentEventName;
    previousSessionTimestampRef.current = currentSessionTimestamp;
    if (!eventChanged && !sessionClosed) return;
    // 同じ作業セッションを伴うイベント改名では、表示中のワークフローを維持する。
    if (eventChanged && currentSessionTimestamp !== null && !sessionClosed) return;
    setDataManagementPage('dataManagement');
    setHasUnsavedDataManagementWork(false);
    if (currentEventName !== null && APPLICATION_PAGES.includes(activePage)) {
      setActivePage('dataManagement');
    }
  }, [activePage, currentEventName, currentSessionTimestamp, setActivePage]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      if (closeCheckRunningRef.current) return;
      if (dataOperationBusyRef.current) return;
      closeCheckRunningRef.current = true;
      setIsCloseChecking(true);
      try {
        if (!await flushPendingPageCommits()) return;
        if (!unsavedWorkRef.current && currentSessionTimestampRef.current === null) {
          try {
            await closeCurrentEventForExitRef.current();
            await getCurrentWindow().destroy();
          } catch {
            setAlertMessage(getMsg('AppContainer.exitSaveFailed'));
          }
          return;
        }
        setExitConfirmOpen(true);
      } finally {
        closeCheckRunningRef.current = false;
        setIsCloseChecking(false);
      }
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // レイアウト部品から呼ばれる操作を、型付き引数で画面状態へ接続する。
  const handleToggleMenu = () => setIsMenuOpen((current) => !current);
  const handleCloseMenu = () => setIsMenuOpen(false);
  const handleCloseAlert = () => setAlertMessage(null);
  const handleSidebarPageSelect = (page: PageType) => {
    void (async () => {
      if (!await flushPendingPageCommits()) return;
      if (page === 'dataManagement') {
        const targetPage = getDataManagementSidebarTarget(dataManagementPage);
        setDataManagementPage(targetPage);
        setActivePage(targetPage);
      } else {
        setActivePage(page);
      }
      handleCloseMenu();
    })();
  };
  const handleDataManagementNavigate = (page: PageType) => {
    void (async () => {
      if (!await flushPendingPageCommits()) return;
      if (
        page === 'dataManagement'
        && (currentSessionTimestamp !== null || unsavedWorkRef.current)
      ) {
        setSessionBoundaryRequested(true);
        return;
      }
      setDataManagementPage(page);
      setActivePage(page);
    })();
  };
  const handleConfirmSessionBoundary = async () => {
    if (sessionDiscardingRef.current) return;
    sessionDiscardingRef.current = true;
    setIsSessionDiscarding(true);
    try {
      if (!await flushPendingPageCommits()) return;
      if (currentSessionTimestamp !== null) await discardCurrentSession();
      setHasUnsavedDataManagementWork(false);
      setDataManagementPage('dataManagement');
      setActivePage('dataManagement');
      setSessionBoundaryRequested(false);
    } catch {
      setAlertMessage(getMsg('AppContainer.sessionCleanupFailed'));
      setSessionBoundaryRequested(false);
    } finally {
      sessionDiscardingRef.current = false;
      setIsSessionDiscarding(false);
    }
  };
  const handleCancelSessionBoundary = () => {
    if (!sessionDiscardingRef.current) setSessionBoundaryRequested(false);
  };
  const handleConfirmExit = async () => {
    if (exitClosingRef.current) return;
    exitClosingRef.current = true;
    setIsExitClosing(true);
    try {
      if (!await flushPendingPageCommits()) {
        setExitConfirmOpen(false);
        exitClosingRef.current = false;
        setIsExitClosing(false);
        return;
      }
      await discardInProgressWorkAndClose();
      await getCurrentWindow().destroy();
    } catch {
      setAlertMessage(getMsg('AppContainer.exitCleanupFailed'));
      setExitConfirmOpen(false);
      exitClosingRef.current = false;
      setIsExitClosing(false);
    }
  };
  const handleCancelExit = () => {
    if (!exitClosingRef.current) setExitConfirmOpen(false);
  };
  const handleRequestEventBoundaryChange = (
    kind: EventBoundaryKind,
    action: () => Promise<boolean>,
  ): Promise<boolean> => {
    const requiresConfirmation = unsavedWorkRef.current
      || (kind === 'switch' && currentSessionTimestamp !== null);
    if (!requiresConfirmation) {
      return action();
    }
    if (pendingEventBoundaryRequest !== null) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      setPendingEventBoundaryRequest({ action, resolve });
    });
  };
  const handleConfirmEventBoundaryChange = () => {
    if (
      pendingEventBoundaryRequest === null
      || exitConfirmOpen
    ) return;
    const request = pendingEventBoundaryRequest;
    setPendingEventBoundaryRequest(null);
    void request.action().then(request.resolve, () => request.resolve(false));
  };
  const handleCancelEventBoundaryChange = () => {
    pendingEventBoundaryRequest?.resolve(false);
    setPendingEventBoundaryRequest(null);
  };

  // サイドバーの表示項目と、イベント状態を反映した実表示ページ。
  const sidebarButtons: SidebarItem[] = [
    { text: getMsg('AppContainer.dataManagement'), page: 'dataManagement', icon: <Users size={18} /> },
    { text: getMsg('AppContainer.internalManagement'), page: 'internalManagement', icon: <Settings size={18} /> },
    { text: getMsg('AppContainer.eventManagement'), page: 'eventManagement', icon: <CalendarDays size={18} /> },
    { text: getMsg('AppContainer.guide'), page: 'guide', icon: <HelpCircle size={18} /> },
  ];
  const visiblePage = getVisiblePage(activePage, currentEventName);
  useLayoutEffect(() => {
    const scrollContainer = mainContentScrollRef.current;
    if (scrollContainer === null) return;
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }, [visiblePage]);
  const isDataManagementVisible = APPLICATION_PAGES.includes(visiblePage);
  const renderNonDataManagementPage = () => {
    switch (visiblePage) {
      // 内部管理配下のページは、InternalManagementPage 内のタブとして切り替える。
      case 'internalManagement':
      case 'cast':
      case 'ngManagement':
      case 'tweet':
      case 'attendance':
        return <InternalManagementPage onBusyChange={setIsInternalManagementBusy} />;
      case 'eventManagement':
        return (
          <EventManagementPage
            onRequestEventBoundaryChange={handleRequestEventBoundaryChange}
            onBusyChange={setIsEventManagementBusy}
          />
        );
      case 'guide':
        return <GuidePage />;
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <ClickEffect />
      <div className={styles.appContainer} data-theme={themeId} style={themeCssVariables as React.CSSProperties}>
        <div className={styles.mobileHeader} data-context="mobile-header">
          <HeaderLogo />
          <button ref={menuToggleRef} type="button" className={styles.menuToggle} aria-label={getMsg(isMenuOpen ? 'AppContainer.closeMenu' : 'AppContainer.openMenu')} aria-expanded={isMenuOpen} aria-controls="app-sidebar" onClick={handleToggleMenu}>{isMenuOpen ? <X size={24} /> : <Menu size={24} />}</button>
        </div>
        <aside ref={sidebarRef} id="app-sidebar" className={`${styles.sidebar} ${isMenuOpen ? styles.open : ''}`} inert={(isMobileSidebar && !isMenuOpen) || isDataBlocked ? true : undefined}>
          <div className={styles.sidebarInner}>
            <div className={styles.sidebarTitle}><HeaderLogo /></div>
            <nav className={styles.sidebarNavigation} aria-label={getMsg('AppContainer.navigationLabel')}>
              {sidebarButtons.map((item) => {
                const disabled = isDataBlocked
                  || isSidebarPageDisabled(item.page, currentEventName);
                return <SidebarButton key={item.page} item={item} isActive={!disabled && isPageActive(visiblePage, item.page)} disabled={disabled} onSelect={handleSidebarPageSelect} />;
              })}
            </nav>
            <div className={`${styles.sidebarBlock} ${styles.sidebarBlockPush}`} />
            <div className={`${styles.sidebarBlock} ${styles.sidebarThemeSlider}`}>
              <ThemeSelector
                themeId={themeId}
                setThemeId={setThemeId}
                customization={themeCustomization}
                setCustomization={setThemeCustomization}
                dialogOpen={themeDialogRequested && activeGlobalDialog === 'theme'}
                onDialogOpenChange={setThemeDialogRequested}
              />
            </div>
          </div>
        </aside>
        {isMobileSidebar && isMenuOpen && <button type="button" className={styles.overlay} aria-label={getMsg('AppContainer.closeMenu')} onClick={handleCloseMenu} />}
        {activeGlobalDialog === 'dataLoadError' && dataLoadError !== null && (
          <NoticeDialog
            title={getMsg('AppContainer.dataManagement')}
            message={getMsg(dataLoadError === 'session'
              ? 'AppContainer.sessionLoadFailed'
              : 'AppContainer.sharedDataLoadFailed')}
            closeLabel={getMsg('AppContainer.retryDataLoad')}
            onClose={retryDataLoad}
          />
        )}
        {activeGlobalDialog === 'alert' && alertMessage !== null && (
          <NoticeDialog
            title={getMsg('AppContainer.dataManagement')}
            message={alertMessage}
            closeLabel={getMsg('common.close')}
            onClose={handleCloseAlert}
          />
        )}
        {activeGlobalDialog === 'import' && pendingImport !== null && (
          <ConfirmDialog
            title={getMsg('AppContainer.importOverwriteTitle')}
            message={getMsg('AppContainer.importOverwriteMessage')}
            confirmLabel={getMsg('AppContainer.importOverwriteConfirm')}
            cancelLabel={getMsg('common.cancel')}
            onConfirm={handleConfirmImportOverwrite}
            onCancel={handleCancelImportOverwrite}
          />
        )}
        {activeGlobalDialog === 'exit' && exitConfirmOpen && (
          <ConfirmDialog
            title={getMsg('AppContainer.exitWarningTitle')}
            message={getMsg('AppContainer.exitWarningMessage')}
            confirmLabel={getMsg(isExitClosing ? 'AppContainer.exitClosing' : 'AppContainer.exitWarningConfirm')}
            cancelLabel={getMsg('AppContainer.exitWarningCancel')}
            confirmDisabled={isExitClosing}
            intent="danger"
            onConfirm={() => { void handleConfirmExit(); }}
            onCancel={handleCancelExit}
          />
        )}
        {activeGlobalDialog === 'sessionBoundary' && sessionBoundaryRequested && (
          <ConfirmDialog
            title={getMsg('AppContainer.sessionCleanupTitle')}
            message={getMsg('AppContainer.sessionCleanupMessage')}
            confirmLabel={getMsg(isSessionDiscarding
              ? 'AppContainer.sessionCleanupRunning'
              : 'AppContainer.sessionCleanupConfirm')}
            cancelLabel={getMsg('common.cancel')}
            confirmDisabled={isSessionDiscarding}
            intent="danger"
            onConfirm={() => { void handleConfirmSessionBoundary(); }}
            onCancel={handleCancelSessionBoundary}
          />
        )}
        {activeGlobalDialog === 'eventBoundary' && pendingEventBoundaryRequest !== null && (
          <ConfirmDialog
            title={getMsg('AppContainer.eventChangeUnsavedTitle')}
            message={getMsg('AppContainer.eventChangeUnsavedMessage')}
            confirmLabel={getMsg('AppContainer.eventChangeUnsavedConfirm')}
            cancelLabel={getMsg('common.cancel')}
            confirmDisabled={exitConfirmOpen}
            intent="danger"
            onConfirm={handleConfirmEventBoundaryChange}
            onCancel={handleCancelEventBoundaryChange}
          />
        )}
        <main className={styles.mainContent} inert={isMobileSidebar && isMenuOpen ? true : undefined}>
          {isDataLoading && <LoadingOverlay message={getMsg('AppContainer.dataLoading')} />}
          <div ref={mainContentScrollRef} className={styles.mainContentScroll} inert={isDataBlocked ? true : undefined}>
            {currentEventName !== null && (
              <div hidden={!isDataManagementVisible}>
                <DataManagementPage
                  key={currentEventName}
                  page={dataManagementPage}
                  onNavigate={handleDataManagementNavigate}
                  onImportUsers={handleImportUsers}
                  onImportNewUsers={handleImportNewUsers}
                  onUnsavedChange={setHasUnsavedDataManagementWork}
                  onBusyChange={setIsDataManagementBusy}
                />
              </div>
            )}
            {!isDataManagementVisible && renderNonDataManagementPage()}
          </div>
        </main>
        <div id="modal-root" />
      </div>
    </ErrorBoundary>
  );
};
