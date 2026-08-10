import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Archive, FileInput, History, ListChecks } from 'lucide-react';
import { NoticeDialog } from '@/components/ConfirmModal';
import { MatchingResultsView } from '@/features/matching/components/MatchingResultsView';
import {
  getEventSavedMatchingResult,
  listEventSavedMatchingResults,
  restoreMatchingResultSnapshot,
  type EventSavedMatchingResultDetail,
  type EventSavedMatchingResultSummary,
} from '@/db/repositories/matchingRepository';
import {
  listEventSavedLotteryResults,
  type EventSavedLotteryResultSummary,
} from '@/db/repositories/lotteryRepository';
import { useAppContext } from '@/stores/AppContext';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from './DataManagementPage.module.css';

interface DataManagementLandingProps {
  onStartNewImport: () => void;
  onOpenSavedLottery: () => void;
  onOpenMatchingHistory: () => void;
}

const START_CARDS = [
  {
    id: 'new',
    icon: FileInput,
    titleKey: 'DataManagementStart.newImportTitle',
    descriptionKey: 'DataManagementStart.newImportDescription',
  },
  {
    id: 'lottery',
    icon: Archive,
    titleKey: 'DataManagementStart.savedLotteryTitle',
    descriptionKey: 'DataManagementStart.savedLotteryDescription',
  },
  {
    id: 'history',
    icon: History,
    titleKey: 'DataManagementStart.matchingHistoryTitle',
    descriptionKey: 'DataManagementStart.matchingHistoryDescription',
  },
] as const;

/** 新規取込と保存結果を、同じ階層の操作カードとして表示する。 */
export const DataManagementLanding: React.FC<DataManagementLandingProps> = ({
  onStartNewImport,
  onOpenSavedLottery,
  onOpenMatchingHistory,
}) => {
  const actions = {
    new: onStartNewImport,
    lottery: onOpenSavedLottery,
    history: onOpenMatchingHistory,
  };
  return (
    <div className={styles.startPage}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('DataManagementStart.pageTitle')}</h1>
        <p className={shared.pageHeaderSubtitle}>{getMsg('DataManagementStart.pageDescription')}</p>
      </header>
      <div className={styles.startCardGrid}>
        {START_CARDS.map(({ id, icon: Icon, titleKey, descriptionKey }) => (
          <button key={id} type="button" className={styles.startCard} onClick={actions[id]}>
            <Icon size={24} aria-hidden="true" />
            <span className={styles.startCardTitle}>{getMsg(titleKey)}</span>
            <span className={styles.startCardDescription}>{getMsg(descriptionKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

interface SavedLotteryStartPageProps {
  onOpened: () => void;
  onOpeningChange?: (opening: boolean) => void;
  onBackToStart: () => void;
}

export const SavedLotteryStartPage: React.FC<SavedLotteryStartPageProps> = ({
  onOpened,
  onOpeningChange,
  onBackToStart,
}) => {
  const { currentEventName, activateSavedLotteryResult } = useAppContext();
  const [results, setResults] = useState<EventSavedLotteryResultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingSavedResultId, setOpeningSavedResultId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openingRef = useRef(false);
  const openingRequestIdRef = useRef(0);

  useEffect(() => () => {
    openingRequestIdRef.current += 1;
    openingRef.current = false;
    onOpeningChange?.(false);
  }, [onOpeningChange]);

  useEffect(() => {
    let current = true;
    setError(null);
    setLoading(true);
    if (!currentEventName) {
      setResults([]);
      setLoading(false);
      return () => { current = false; };
    }
    listEventSavedLotteryResults(currentEventName)
      .then((items) => { if (current) setResults(items); })
      .catch(() => { if (current) setError(getMsg('DataManagementStart.savedLotteryLoadFailed')); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [currentEventName]);

  const handleOpen = async (result: EventSavedLotteryResultSummary) => {
    if (openingRef.current) return;
    const requestId = ++openingRequestIdRef.current;
    openingRef.current = true;
    setError(null);
    setOpeningSavedResultId(result.savedResultId);
    onOpeningChange?.(true);
    try {
      await activateSavedLotteryResult(result);
      if (openingRequestIdRef.current === requestId) onOpened();
    } catch {
      if (openingRequestIdRef.current === requestId) {
        setError(getMsg('DataManagementStart.savedLotteryOpenFailed'));
      }
    } finally {
      if (openingRequestIdRef.current === requestId) {
        openingRef.current = false;
        setOpeningSavedResultId(null);
        onOpeningChange?.(false);
      }
    }
  };

  return (
    <div>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <div className={styles.historyDetailHeading}>
          <div>
            <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('DataManagementStart.savedLotteryPageTitle')}</h1>
            <p className={shared.pageHeaderSubtitle}>{getMsg('DataManagementStart.savedLotteryPageDescription')}</p>
          </div>
          <button type="button" className={shared.btnSecondary} disabled={openingSavedResultId !== null} onClick={onBackToStart}>{getMsg('DataManagementStart.backToStart')}</button>
        </div>
      </header>
      <section className={shared.sectionBlock}>
        {loading ? (
          <p className={styles.historyStatus} role="status">{getMsg('common.loading')}</p>
        ) : results.length === 0 ? (
          <p className={styles.historyStatus}>{getMsg('DataManagementStart.noSavedLottery')}</p>
        ) : (
          <ul className={styles.historyList}>
            {results.map((result) => {
              return (
                <li key={result.savedResultId} className={styles.historyItem}>
                  <div className={styles.historyItemText}>
                    <strong>{result.label}</strong>
                    <span>{getMsg('DataManagementStart.savedLotteryMeta', { count: result.winnerCount, date: result.createdAt })}</span>
                  </div>
                  <button type="button" className={shared.btnPrimary} disabled={openingSavedResultId !== null} onClick={() => { void handleOpen(result); }}>
                    {getMsg(openingSavedResultId === result.savedResultId ? 'common.loading' : 'DataManagementStart.startMatching')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {error && <NoticeDialog title={getMsg('DataManagementStart.savedLotteryPageTitle')} message={error} closeLabel={getMsg('common.close')} onClose={() => setError(null)} />}
    </div>
  );
};

interface MatchingHistoryPageProps {
  onBackToStart: () => void;
}

export const MatchingHistoryPage: React.FC<MatchingHistoryPageProps> = ({ onBackToStart }) => {
  const { currentEventName } = useAppContext();
  const [results, setResults] = useState<EventSavedMatchingResultSummary[]>([]);
  const [detail, setDetail] = useState<EventSavedMatchingResultDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingResultId, setOpeningResultId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detailRequestIdRef = useRef(0);
  const detailTopRef = useRef<HTMLDivElement>(null);
  const lastOpenedResultIdRef = useRef<number | null>(null);
  const restoreListPositionRef = useRef(false);
  const resultButtonRefs = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    let current = true;
    detailRequestIdRef.current += 1;
    setDetail(null);
    setError(null);
    setLoading(true);
    if (!currentEventName) {
      setResults([]);
      setLoading(false);
      return () => { current = false; };
    }
    listEventSavedMatchingResults(currentEventName)
      .then((items) => { if (current) setResults(items); })
      .catch(() => { if (current) setError(getMsg('MatchingHistory.loadFailed')); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [currentEventName]);

  useEffect(() => {
    if (detail !== null || !restoreListPositionRef.current) return;
    const resultId = lastOpenedResultIdRef.current;
    restoreListPositionRef.current = false;
    if (resultId === null) return;
    const animationFrame = requestAnimationFrame(() => {
      const button = resultButtonRefs.current.get(resultId);
      button?.focus();
      button?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [detail, results]);

  useLayoutEffect(() => {
    if (detail === null) return;
    detailTopRef.current?.scrollIntoView({ block: 'start' });
  }, [detail]);

  const handleOpen = async (result: EventSavedMatchingResultSummary) => {
    if (!currentEventName) return;
    const requestId = ++detailRequestIdRef.current;
    const eventName = currentEventName;
    lastOpenedResultIdRef.current = result.savedResultId;
    setError(null);
    setOpeningResultId(result.savedResultId);
    try {
      const nextDetail = await getEventSavedMatchingResult(eventName, result);
      if (detailRequestIdRef.current === requestId) setDetail(nextDetail);
    } catch {
      if (detailRequestIdRef.current === requestId) {
        setError(getMsg('MatchingHistory.detailLoadFailed'));
      }
    } finally {
      if (detailRequestIdRef.current === requestId) setOpeningResultId(null);
    }
  };
  const handleBackToList = () => {
    restoreListPositionRef.current = true;
    setDetail(null);
  };

  if (detail) {
    let restored;
    try {
      restored = restoreMatchingResultSnapshot(detail.snapshot);
    } catch {
      return <NoticeDialog title={getMsg('MatchingHistory.pageTitle')} message={getMsg('MatchingHistory.invalidSnapshot')} closeLabel={getMsg('MatchingHistory.backToList')} onClose={handleBackToList} />;
    }
    return (
      <div ref={detailTopRef}>
        <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
          <div className={styles.historyDetailHeading}>
            <div>
              <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{detail.label}</h1>
              <p className={shared.pageHeaderSubtitle}>{getMsg('MatchingHistory.detailMeta', { count: detail.winnerCount, date: detail.createdAt })}</p>
            </div>
            <button type="button" className={shared.btnSecondary} onClick={handleBackToList}>{getMsg('MatchingHistory.backToList')}</button>
          </div>
        </header>
        <MatchingResultsView
          winners={restored.winners}
          casts={restored.casts}
          result={restored.result}
          tableSlots={restored.tableSlots}
          scoreSummary={restored.scoreSummary}
          showExportActions
        />
      </div>
    );
  }

  return (
    <div>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <div className={styles.historyDetailHeading}>
          <div>
            <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('MatchingHistory.pageTitle')}</h1>
            <p className={shared.pageHeaderSubtitle}>{getMsg('MatchingHistory.pageDescription')}</p>
          </div>
          <button type="button" className={shared.btnSecondary} disabled={openingResultId !== null} onClick={onBackToStart}>{getMsg('DataManagementStart.backToStart')}</button>
        </div>
      </header>
      <section className={shared.sectionBlock}>
        {loading ? (
          <p className={styles.historyStatus} role="status">{getMsg('common.loading')}</p>
        ) : results.length === 0 ? (
          <p className={styles.historyStatus}>{getMsg('MatchingHistory.empty')}</p>
        ) : (
          <ul className={styles.historyList}>
            {results.map((result) => (
              <li key={result.savedResultId} className={styles.historyItem}>
                <div className={styles.historyItemText}>
                  <strong>{result.label}</strong>
                  <span>{getMsg('MatchingHistory.listMeta', { count: result.winnerCount, date: result.createdAt })}</span>
                </div>
                <button
                  ref={(button) => {
                    if (button) resultButtonRefs.current.set(result.savedResultId, button);
                    else resultButtonRefs.current.delete(result.savedResultId);
                  }}
                  type="button"
                  className={shared.btnSecondary}
                  disabled={openingResultId !== null}
                  onClick={() => { void handleOpen(result); }}
                >
                  <ListChecks size={16} aria-hidden="true" />{getMsg(openingResultId === result.savedResultId ? 'common.loading' : 'MatchingHistory.open')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {error && <NoticeDialog title={getMsg('MatchingHistory.pageTitle')} message={error} closeLabel={getMsg('common.close')} onClose={() => setError(null)} />}
    </div>
  );
};
