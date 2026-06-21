import React, { useState, useEffect, useMemo } from 'react';
import { Menu, X, Users, Settings, CalendarDays, HelpCircle, Terminal } from '@/common/icons';
import { DataManagementPage } from '@/features/data-management/DataManagementPage';
import { InternalManagementPage } from '@/features/internal-management/InternalManagementPage';
import { EventManagementPage } from '@/features/event-management/EventManagementPage';
import { GuidePage } from '@/features/guide/GuidePage';
import { DebugPage } from '@/features/debug/DebugPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ClickEffect } from '@/components/ClickEffect';
import { ConfirmModal } from '@/components/ConfirmModal';
import { HeaderLogo } from '@/components/HeaderLogo';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useAppContext, type PageType } from '@/stores/AppContext';
import { removeStoredSession } from '@/stores/app-storage-store';
import { mapRowToUserBeanWithMapping } from '@/common/sheetParsers';
import { buildThemeCssVariables } from '@/common/themeCustomization';
import { IMPORT_OVERWRITE, NAV } from '@/common/copy';
import { getVisiblePage, isSidebarPageDisabled } from './appNavigation';
import {
  createSession,
  getAllCasts,
  loadApplicants,
  getAllCautionUsers,
  listSessions,
  openSession,
  persistApplicants,
  saveLastUsedSession,
} from '@/db';
import styles from './AppContainer.module.css';
import { ThemeSelector } from '@/components/ThemeSelector';

export const AppContainer: React.FC = () => {
  const {
    activePage,
    setActivePage,
    applicants,
    setCasts,
    setApplicants,
    currentWinners,
    setCurrentWinners,
    themeId,
    setThemeId,
    themeCustomization,
    setThemeCustomization,
    isDbReady,
    currentEventName,
    currentSessionTimestamp,
    setCurrentSessionTimestamp,
    setSessions,
    setMatchingSettings,
    resetMatching,
    dataReloadCounter,
  } = useAppContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const themeCssVariables = useMemo(
    () => buildThemeCssVariables(themeId, themeCustomization),
    [themeId, themeCustomization],
  );
  const [pendingImport, setPendingImport] = useState<{
    rows: string[][];
    mapping: import('@/common/importFormat').ColumnMapping;
    options?: import('@/common/sheetParsers').MapRowOptions;
    nextPage?: PageType;
  } | null>(null);

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

  // ──────────────────────────────────────────────────────────────────────────
  // データ再読込。
  //  - キャストと要注意人物はイベント共有DBに属するため、イベント切り替え時に読み直す。
  //  - 応募者は取込セッションDBに属するため、セッション切り替え時だけ読み直す。
  // dataReloadCounter は、キーを変えずに現在セッションを再読込するための明示的な更新トリガー。
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDbReady) return;
    if (currentEventName === null) {
      setCasts([]);
      setApplicants([]);
      setIsDataLoading(false);
      return;
    }
    setIsDataLoading(true);
    (async () => {
      try {
        const casts = await getAllCasts();
        setCasts(casts);
      } catch (e) {
        console.warn('キャストデータの読み込みをスキップしました:', e);
      }
      try {
        const cautionUsers = await getAllCautionUsers();
        setMatchingSettings((prev) => ({
          ...prev,
          caution: { ...prev.caution, cautionUsers },
        }));
      } catch (e) {
        console.warn('要注意ユーザーの読み込みをスキップしました:', e);
      }
      setIsDataLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, currentEventName]);

  useEffect(() => {
    if (!isDbReady) return;
    if (currentSessionTimestamp === null) {
      setApplicants([]);
      return;
    }
    (async () => {
      try {
        const applicants = await loadApplicants();
        setApplicants(applicants);
      } catch (e) {
        console.warn('応募データの読み込みをスキップしました:', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, currentSessionTimestamp, dataReloadCounter]);

  const ensureWritableSession = async (): Promise<string> => {
    if (currentEventName === null) {
      throw new Error('先にイベントを作成、または既存イベントを開いてください。');
    }
    if (currentSessionTimestamp !== null) {
      return currentSessionTimestamp;
    }

    const timestamp = await createSession(currentEventName);
    await openSession(timestamp);
    saveLastUsedSession(timestamp);
    setCurrentSessionTimestamp(timestamp);
    setSessions(await listSessions(currentEventName));
    return timestamp;
  };

  const applyImport = async (
    rows: string[][],
    mapping: import('@/common/importFormat').ColumnMapping,
    options?: import('@/common/sheetParsers').MapRowOptions,
    nextPage: PageType = 'dataManagement',
  ) => {
    setIsDataLoading(true);
    try {
      await ensureWritableSession();
      const users = rows
        .map((row) => mapRowToUserBeanWithMapping(row as unknown[], mapping, options))
        .filter((user) => user.name.trim() !== '' || user.x_id.trim() !== '');
      await persistApplicants(users);
      setApplicants(users);
      setCurrentWinners([]);
      resetMatching();
      removeStoredSession();
      setActivePage(nextPage);
    } catch (error) {
      setAlertMessage(error instanceof Error ? error.message : '応募データの取り込みに失敗しました。');
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleImportUserRows = (
    rows: string[][],
    mapping: import('@/common/importFormat').ColumnMapping,
    options?: import('@/common/sheetParsers').MapRowOptions,
    nextPage?: PageType,
  ) => {
    if (applicants.length > 0 || currentWinners.length > 0) {
      setPendingImport({ rows, mapping, options, nextPage });
      return;
    }
    void applyImport(rows, mapping, options, nextPage);
  };

  const handleConfirmImportOverwrite = () => {
    if (!pendingImport) return;
    const next = pendingImport;
    setPendingImport(null);
    void applyImport(next.rows, next.mapping, next.options, next.nextPage);
  };

  const INTERNAL_PAGES: PageType[] = ['internalManagement', 'cast', 'ngManagement', 'tweet', 'attendance'];
  const APPLICATION_PAGES: PageType[] = ['dataManagement', 'lottery', 'matching', 'import'];

  const isPageActive = (current: PageType, buttonPage: PageType): boolean => {
    if (buttonPage === 'internalManagement') return INTERNAL_PAGES.includes(current);
    if (buttonPage === 'dataManagement') return APPLICATION_PAGES.includes(current);
    return current === buttonPage;
  };

  const sidebarButtons: { text: string; page: PageType; icon?: React.ReactNode }[] = [
    { text: '応募管理', page: 'dataManagement', icon: <Users size={18} /> },
    { text: '内部管理', page: 'internalManagement', icon: <Settings size={18} /> },
    { text: 'イベント切り替え', page: 'eventManagement', icon: <CalendarDays size={18} /> },
    { text: NAV.GUIDE, page: 'guide', icon: <HelpCircle size={18} /> },
  ];
  const visiblePage = getVisiblePage(activePage, currentEventName);

  const renderPage = () => {
    if (currentEventName === null && activePage !== 'guide') {
      return <EventManagementPage />;
    }
    switch (activePage) {
      case 'dataManagement':
      case 'lottery':
      case 'matching':
      case 'import':
        return <DataManagementPage onImportUserRows={handleImportUserRows} />;
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
      default:
        return <DataManagementPage onImportUserRows={handleImportUserRows} />;
    }
  };

  return (
    <ErrorBoundary>
      <ClickEffect />
      <div className={styles.appContainer} data-theme={themeId} style={themeCssVariables as React.CSSProperties}>
        <div className={styles.mobileHeader} data-context="mobile-header">
          <HeaderLogo />
          <button className={styles.menuToggle} onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        <aside className={`${styles.sidebar} ${isMenuOpen ? styles.open : ''}`}>
          <div className={styles.sidebarInner}>
            <div className={styles.sidebarTitle}>
              <HeaderLogo />
            </div>
            {sidebarButtons.map((button, index) => {
              const disabled = isSidebarPageDisabled(button.page, currentEventName);
              const className = [
                styles.sidebarButton,
                !disabled && isPageActive(visiblePage, button.page) ? styles.active : '',
                disabled ? styles.sidebarButtonDisabled : '',
              ].filter(Boolean).join(' ');

              return (
                <button
                  key={index}
                  className={className}
                  onClick={() => {
                    if (disabled) return;
                    setActivePage(button.page);
                    setShowDebug(false);
                    setIsMenuOpen(false);
                  }}
                  disabled={disabled}
                  aria-disabled={disabled}
                  title={disabled ? `${button.text}はイベント選択後に利用できます` : button.text}
                >
                  {button.icon != null ? (
                    <>
                      {button.icon}
                      <span className={styles.sidebarButtonLabel}>{button.text}</span>
                    </>
                  ) : (
                    button.text
                  )}
                </button>
              );
            })}
            {import.meta.env.DEV && (
              <button
                className={`${styles.sidebarButton}${showDebug ? ` ${styles.active}` : ''}`}
                onClick={() => { setShowDebug(true); setIsMenuOpen(false); }}
                title="Debug"
              >
                <Terminal size={18} />
                <span className={styles.sidebarButtonLabel}>Debug</span>
              </button>
            )}
            <div className={`${styles.sidebarBlock} ${styles.sidebarBlockPush}`} />
            <div className={`${styles.sidebarBlock} ${styles.sidebarThemeSlider}`}>
              <ThemeSelector
                themeId={themeId}
                setThemeId={setThemeId!}
                customization={themeCustomization}
                setCustomization={setThemeCustomization}
              />
            </div>
          </div>
        </aside>
        {isMenuOpen && <div className={styles.overlay} onClick={() => setIsMenuOpen(false)} />}
        {alertMessage !== null && (
          <ConfirmModal type="alert" message={alertMessage} onConfirm={() => setAlertMessage(null)} confirmLabel="OK" />
        )}
        {pendingImport !== null && (
          <ConfirmModal
            type="confirm"
            title={IMPORT_OVERWRITE.MODAL_TITLE}
            message={IMPORT_OVERWRITE.MODAL_MESSAGE}
            confirmLabel={IMPORT_OVERWRITE.CONFIRM_LABEL}
            cancelLabel={IMPORT_OVERWRITE.CANCEL_LABEL}
            onConfirm={handleConfirmImportOverwrite}
            onCancel={() => setPendingImport(null)}
          />
        )}
        <main className={styles.mainContent}>
          {isDataLoading && <LoadingOverlay message="データを読み込んでいます…" />}
          <div className={styles.mainContentScroll}>
            {import.meta.env.DEV && showDebug ? <DebugPage /> : renderPage()}
          </div>
        </main>
        <div id="modal-root" />
      </div>
    </ErrorBoundary>
  );
};
