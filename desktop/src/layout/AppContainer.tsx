import React, { useState, useEffect } from 'react';
import { Menu, X, Users, Settings, CalendarDays, HelpCircle, Terminal } from '@/common/icons';
import { DataManagementPage } from '@/features/data-management/DataManagementPage';
import { InternalManagementPage } from '@/features/internal-management/InternalManagementPage';
import { EventManagementPage } from '@/features/event-management/EventManagementPage';
import { GuidePage } from '@/features/guide/GuidePage';
import { DebugPage } from '@/features/debug/DebugPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfirmModal } from '@/components/ConfirmModal';
import { HeaderLogo } from '@/components/HeaderLogo';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useAppContext, type PageType } from '@/stores/AppContext';
import { mapRowToUserBeanWithMapping } from '@/common/sheetParsers';
import { NAV, IMPORT_OVERWRITE } from '@/common/copy';
import { STORAGE_KEYS } from '@/common/config';
import {
  getAllCasts,
  loadApplicants,
  persistApplicants,
  getAllCautionUsers,
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
    isDbReady,
    currentEventName,
    setMatchingSettings,
    dataReloadCounter,
  } = useAppContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [columnCheckError, setColumnCheckError] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  /** TSV取り込みで既存応募データがあるときに確認用に保持する取り込み予定データ */
  const [pendingImport, setPendingImport] = useState<{
    rows: string[][];
    mapping: import('@/common/importFormat').ColumnMapping;
    options?: import('@/common/sheetParsers').MapRowOptions;
  } | null>(null);

  /** DB初期化完了後にキャストと応募者データを読み込む */
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
        const applicants = await loadApplicants();
        setApplicants(applicants);
      } catch (e) {
        console.warn('応募データの読み込みをスキップしました:', e);
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
  }, [isDbReady, currentEventName, dataReloadCounter]);

  /** ファイル選択で取り込んだ応募データ行とカラムマッピングで保存して DB 画面へ。既存の応募データ or 当選結果がある場合は上書き確認モーダルを表示。 */
  const handleImportUserRows = (
    rows: string[][],
    mapping: import('@/common/importFormat').ColumnMapping,
    options?: import('@/common/sheetParsers').MapRowOptions
  ) => {
    const hasApplyUsers = applicants.length > 0;
    const hasWinners = currentWinners.length > 0;
    if (hasApplyUsers || hasWinners) {
      setPendingImport({ rows, mapping, options });
      return;
    }
    applyImport(rows, mapping, options);
  };

  /** 実際に応募データを保存し DB 画面へ遷移（リセット＋取り込みまたはそのまま取り込み） */
  const applyImport = (
    rows: string[][],
    mapping: import('@/common/importFormat').ColumnMapping,
    options?: import('@/common/sheetParsers').MapRowOptions
  ) => {
    const users = rows
      .map((row) =>
        mapRowToUserBeanWithMapping(row as unknown[], mapping, options)
      )
      .filter(
        (u) => u.name.trim() !== '' || u.x_id.trim() !== ''
      );
    setApplicants(users);
    setCurrentWinners([]);
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEYS.SESSION);
    if (currentEventName !== null) {
      persistApplicants(users).catch((e) =>
        console.error('応募データのDB保存に失敗しました:', e),
      );
    }
    setActivePage('import');
  };

  const handleConfirmImportOverwrite = () => {
    if (!pendingImport) return;
    applyImport(pendingImport.rows, pendingImport.mapping, pendingImport.options);
    setPendingImport(null);
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
        {columnCheckError !== null && (
          <ConfirmModal type="alert" message={columnCheckError} onConfirm={() => setColumnCheckError(null)} confirmLabel="OK" />
        )}
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
