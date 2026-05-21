import React, { useState, useEffect } from 'react';
import { Menu, X, Users, Settings, CalendarDays, HelpCircle, Terminal, Upload } from '@/common/icons';
import { DataManagementPage } from '@/features/data-management/DataManagementPage';
import { InternalManagementPage } from '@/features/internal-management/InternalManagementPage';
import { EventManagementPage } from '@/features/event-management/EventManagementPage';
import { SessionPickerPage } from '@/features/session-picker/SessionPickerPage';
import { GuidePage } from '@/features/guide/GuidePage';
import { DebugPage } from '@/features/debug/DebugPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { HeaderLogo } from '@/components/HeaderLogo';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useAppContext, type PageType } from '@/stores/AppContext';
import { NAV } from '@/common/copy';
import {
  getAllCasts,
  loadApplicants,
  getAllCautionUsers,
} from '@/db';
import styles from './AppContainer.module.css';
import { ThemeSelector } from '@/components/ThemeSelector';

export const AppContainer: React.FC = () => {
  const {
    activePage,
    setActivePage,
    setCasts,
    setApplicants,
    themeId,
    setThemeId,
    isDbReady,
    currentEventName,
    currentSessionTimestamp,
    setMatchingSettings,
    dataReloadCounter,
  } = useAppContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // ──────────────────────────────────────────────────────────────────────────
  // Data load effect.
  //  - Casts (and caution users) live in the event-shared DB → reload whenever
  //    the event changes.
  //  - Applicants live in the session DB → only reload when the session
  //    changes; if no session is open, applicants are empty.
  // dataReloadCounter is a manual escape hatch for callers (e.g. session
  // picker after import) to force a refresh without changing the keys.
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
      // Without an open session there is no applicants table to read; leave
      // the in-memory list empty so feature pages cleanly degrade.
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
    { text: 'セッション切替', page: 'sessionPicker', icon: <Upload size={18} /> },
    { text: 'イベント切り替え', page: 'eventManagement', icon: <CalendarDays size={18} /> },
    { text: NAV.GUIDE, page: 'guide', icon: <HelpCircle size={18} /> },
  ];

  // ──────────────────────────────────────────────────────────────────────────
  // Routing matrix:
  //   currentEventName === null
  //     → must open / create an event first. EventManagementPage is the only
  //       reachable page (guide is also allowed as a read-only escape hatch).
  //   currentEventName !== null && currentSessionTimestamp === null
  //     → an event is open but no applicant CSV has been imported yet.
  //       SessionPickerPage is forced for any page that depends on applicants
  //       (lottery / matching / data-management). Event-scoped pages
  //       (eventManagement, internalManagement and its sub-tabs, guide) are
  //       still reachable so the user can edit casts / NG / attendance
  //       between imports.
  //   both set
  //     → normal page dispatch.
  // ──────────────────────────────────────────────────────────────────────────
  const renderPage = () => {
    if (currentEventName === null && activePage !== 'guide') {
      return <EventManagementPage />;
    }
    if (
      currentEventName !== null &&
      currentSessionTimestamp === null &&
      activePage !== 'guide' &&
      activePage !== 'eventManagement' &&
      activePage !== 'internalManagement' &&
      !INTERNAL_PAGES.includes(activePage)
    ) {
      return <SessionPickerPage />;
    }
    switch (activePage) {
      case 'dataManagement':
      case 'lottery':
      case 'matching':
      case 'import':
        return <DataManagementPage />;
      case 'internalManagement':
      case 'cast':
      case 'ngManagement':
      case 'tweet':
      case 'attendance':
        return <InternalManagementPage />;
      case 'eventManagement':
        return <EventManagementPage />;
      case 'sessionPicker':
        return <SessionPickerPage />;
      case 'guide':
        return <GuidePage />;
      default:
        return <DataManagementPage />;
    }
  };

  return (
    <ErrorBoundary>
      <div className={styles.appContainer} data-theme={themeId}>
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
            {sidebarButtons.map((button, index) => (
              <button
                key={index}
                className={`${styles.sidebarButton} ${isPageActive(activePage, button.page) ? styles.active : ''}`}
                onClick={() => {
                  setActivePage(button.page);
                  setShowDebug(false);
                  setIsMenuOpen(false);
                }}
                title={button.text}
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
            ))}
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
              <span className={styles.sidebarBlockLabel}>{NAV.SETTINGS}</span>
              <ThemeSelector themeId={themeId} setThemeId={setThemeId!} />
            </div>
          </div>
        </aside>
        {isMenuOpen && <div className={styles.overlay} onClick={() => setIsMenuOpen(false)} />}
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
