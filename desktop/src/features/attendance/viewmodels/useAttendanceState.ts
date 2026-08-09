import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  getCastAttendanceHistory,
  getCastAttendanceRecordDates,
  getAllCasts,
  hasCastAttendanceForDate,
  recordCastAttendance,
  setAllCastPresence,
  updateCastFields,
} from '@/db';
import {
  captureEventWriteActivity,
  getOpenEventContext,
  isEventWriteActivityUnchanged,
  isCurrentEventContext,
  runAsEventRecovery,
  waitForEventWritesToSettle,
  type EventCommandContext,
} from '@/db/repositories/commandContext';
import type { CastBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';
import {
  buildAttendanceMatrix,
  groupCastsByGroupName,
} from '../models/attendanceMatrix';
import type {
  AttendanceDateRecordStatus,
  AttendanceHistoryLoadStatus,
  AttendancePeriod,
  AttendanceTab,
  CastAttendanceRecord,
} from '../models/types';
import { formatRecordDateValue, parseRecordDate } from '../models/recordDate';

interface UseAttendanceStateParams {
  currentEventName: string | null;
  casts: CastBean[];
  setCasts: Dispatch<SetStateAction<CastBean[]>>;
}

function createAllAttendancePeriod(): AttendancePeriod {
  return { startDate: '', endDate: '' };
}

/** 出欠画面の入力・履歴読込・保存と、失敗時のイベント共有DB再同期を管理する。 */
export function useAttendanceState({ currentEventName, casts, setCasts }: UseAttendanceStateParams) {
  // タブ、ダイアログ、履歴、通知の画面状態。
  const [activeTab, setActiveTab] = useState<AttendanceTab>('setup');
  const [history, setHistory] = useState<CastAttendanceRecord[]>([]);
  const [recordDates, setRecordDates] = useState<string[]>([]);
  const [historyLoadStatus, setHistoryLoadStatus] = useState<AttendanceHistoryLoadStatus>('idle');
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [recordDate, setRecordDate] = useState('');
  const [dateRecordStatus, setDateRecordStatus] = useState<AttendanceDateRecordStatus>('idle');
  const [dateCheckRequest, setDateCheckRequest] = useState(0);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [attendancePeriod, setAttendancePeriod] = useState<AttendancePeriod>(createAllAttendancePeriod);
  const [attendancePeriodDialogOpen, setAttendancePeriodDialogOpen] = useState(false);

  // 履歴読込と出席状態更新の競合を判定する世代・トークン。
  const historyLoadGenerationRef = useRef(0);
  const presenceMutationTokenRef = useRef(0);
  const presenceMutationByCastIdRef = useRef(new Map<number, number>());

  // 名簿と履歴から各表示画面が使う集計値を導出する。
  const presentCasts = useMemo(() => casts.filter((cast) => cast.is_present), [casts]);
  const presentCount = presentCasts.length;
  const groupedPresent = useMemo(() => groupCastsByGroupName(presentCasts), [presentCasts]);
  const attendanceMatrix = useMemo(
    () => buildAttendanceMatrix(casts, history, attendancePeriod, recordDates),
    [attendancePeriod, casts, history, recordDates],
  );

  // 現在のイベント世代だけに出欠履歴の読込結果を反映する。
  const loadData = useCallback(async () => {
    const generation = historyLoadGenerationRef.current + 1;
    historyLoadGenerationRef.current = generation;
    if (currentEventName === null) {
      setHistory([]);
      setRecordDates([]);
      setHistoryLoadStatus('idle');
      return;
    }
    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      setHistory([]);
      setRecordDates([]);
      setHistoryLoadStatus('failed');
      return;
    }
    setHistoryLoadStatus('loading');

    try {
      await waitForEventWritesToSettle(context);
      if (
        historyLoadGenerationRef.current !== generation
        || !isCurrentEventContext(context)
      ) return;
      const [nextHistory, nextRecordDates] = await Promise.all([
        getCastAttendanceHistory(),
        getCastAttendanceRecordDates(),
      ]);
      if (
        historyLoadGenerationRef.current !== generation
        || !isCurrentEventContext(context)
      ) return;
      setHistory(nextHistory);
      setRecordDates(nextRecordDates);
      setHistoryLoadStatus('ready');
    } catch (error) {
      if (
        historyLoadGenerationRef.current !== generation
        || !isCurrentEventContext(context)
      ) return;
      setHistory([]);
      setRecordDates([]);
      setHistoryLoadStatus('failed');
      throw error;
    }
  }, [currentEventName]);

  // 更新失敗時は、他のイベント書込が停止した時点の名簿を復元する。
  const restorePersistedCasts = useCallback(async (
    context: EventCommandContext,
  ): Promise<boolean> => {
    return runAsEventRecovery(context, async () => {
      while (isCurrentEventContext(context)) {
        await waitForEventWritesToSettle(context);
        if (!isCurrentEventContext(context)) return false;
        const writeActivity = captureEventWriteActivity(context);
        if (!isEventWriteActivityUnchanged(context, writeActivity)) continue;
        const persistedCasts = await getAllCasts();
        if (!isCurrentEventContext(context)) return false;
        if (!isEventWriteActivityUnchanged(context, writeActivity)) continue;
        setCasts(persistedCasts);
        return true;
      }
      return false;
    });
  }, [setCasts]);

  useEffect(() => {
    setHistory([]);
    setRecordDates([]);
    setSaving(false);
    setConfirmSave(false);
    setHistoryLoadStatus('idle');
    setDateRecordStatus('idle');
    setAlertMessage(null);
    setAttendancePeriod(createAllAttendancePeriod());
    setAttendancePeriodDialogOpen(false);
    presenceMutationByCastIdRef.current.clear();
  }, [currentEventName]);

  useEffect(() => {
    void loadData().catch(() => {
      // 失敗状態は履歴画面に残るため、重複するモーダル通知は行わない。
    });
  }, [loadData]);

  useEffect(() => {
    if (!confirmSave || currentEventName === null || parseRecordDate(recordDate) === null) {
      setDateRecordStatus('idle');
      return;
    }

    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      setDateRecordStatus('failed');
      return;
    }
    setDateRecordStatus('checking');
    let isActive = true;
    void hasCastAttendanceForDate(recordDate).then((hasRecord) => {
      if (isActive && isCurrentEventContext(context)) {
        setDateRecordStatus(hasRecord ? 'exists' : 'absent');
      }
    }).catch(() => {
      if (isActive && isCurrentEventContext(context)) setDateRecordStatus('failed');
    });

    return () => {
      isActive = false;
    };
  }, [confirmSave, currentEventName, dateCheckRequest, recordDate]);

  // 現在の出席者を指定日へ記録し、保存後の履歴を再読込する。
  const handleSave = useCallback(async () => {
    if (
      saving
      || currentEventName === null
      || parseRecordDate(recordDate) === null
      || (dateRecordStatus !== 'absent' && dateRecordStatus !== 'exists')
    ) return;
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    setSaving(true);
    let saved = false;

    try {
      await recordCastAttendance(presentCasts.map((cast) => cast.id), recordDate);
      saved = true;
      if (!isCurrentEventContext(context)) return;
      await loadData();
      if (!isCurrentEventContext(context)) return;
      setAlertMessage(getMsg('useAttendanceState.saveSucceeded'));
    } catch {
      if (!isCurrentEventContext(context)) return;
      if (saved) {
        setAlertMessage(getMsg('useAttendanceState.historyReloadFailed'));
      } else {
        setAlertMessage(getMsg('useAttendanceState.saveFailed'));
      }
    } finally {
      if (isCurrentEventContext(context)) {
        setSaving(false);
        setConfirmSave(false);
      }
    }
  }, [currentEventName, dateRecordStatus, loadData, presentCasts, recordDate, saving]);

  const handleOpenSaveModal = useCallback(() => {
    setRecordDate(formatRecordDateValue(new Date()));
    setDateRecordStatus('checking');
    setDateCheckRequest((request) => request + 1);
    setConfirmSave(true);
  }, []);

  const handleRecordDateChange = useCallback((value: string) => {
    setRecordDate(value);
    setDateRecordStatus(parseRecordDate(value) !== null ? 'checking' : 'idle');
    if (parseRecordDate(value) !== null) {
      setDateCheckRequest((request) => request + 1);
    }
  }, []);

  const handleOpenAttendancePeriodDialog = useCallback(() => {
    setAttendancePeriodDialogOpen(true);
  }, []);

  const handleCloseAttendancePeriodDialog = useCallback(() => {
    setAttendancePeriodDialogOpen(false);
  }, []);

  const handleApplyAttendancePeriod = useCallback((period: AttendancePeriod) => {
    setAttendancePeriod(period);
    setAttendancePeriodDialogOpen(false);
  }, []);

  // 個別・一括の出席状態を楽観更新し、失敗時は永続化済み名簿へ戻す。
  const handleTogglePresence = useCallback(
    async (castId: number, isPresent: boolean) => {
      if (currentEventName === null) return;
      const context = getOpenEventContext(currentEventName);
      if (context === null) return;
      const token = presenceMutationTokenRef.current + 1;
      presenceMutationTokenRef.current = token;
      presenceMutationByCastIdRef.current.set(castId, token);
      setCasts((prev) => prev.map((cast) => (
        cast.id === castId ? { ...cast, is_present: isPresent } : cast
      )));
      try {
        await updateCastFields(castId, { is_present: isPresent });
        if (!isCurrentEventContext(context)) return;
      } catch {
        if (!isCurrentEventContext(context)) return;
        try {
          const restored = await restorePersistedCasts(context);
          if (
            restored
            && presenceMutationByCastIdRef.current.get(castId) === token
          ) {
            setAlertMessage(getMsg('useAttendanceState.presenceRollback'));
          }
        } catch {
          if (
            isCurrentEventContext(context)
            && presenceMutationByCastIdRef.current.get(castId) === token
          ) {
            setAlertMessage(getMsg('useAttendanceState.presenceSaveFailed'));
          }
        }
      }
    },
    [currentEventName, restorePersistedCasts, setCasts],
  );

  const handleSetAll = useCallback(
    async (isPresent: boolean) => {
      if (currentEventName === null) return;
      const context = getOpenEventContext(currentEventName);
      if (context === null) return;
      const affectedCastIds = casts.map((cast) => cast.id);
      const token = presenceMutationTokenRef.current + 1;
      presenceMutationTokenRef.current = token;
      for (const castId of affectedCastIds) {
        presenceMutationByCastIdRef.current.set(castId, token);
      }
      setCasts((prev) => prev.map((cast) => ({ ...cast, is_present: isPresent })));
      try {
        await setAllCastPresence(isPresent);
        if (!isCurrentEventContext(context)) return;
      } catch {
        if (!isCurrentEventContext(context)) return;
        try {
          const restored = await restorePersistedCasts(context);
          const hasLatestTarget = affectedCastIds.some(
            (castId) => presenceMutationByCastIdRef.current.get(castId) === token,
          );
          if (restored && hasLatestTarget) {
            setAlertMessage(getMsg('useAttendanceState.presenceRollback'));
          }
        } catch {
          const hasLatestTarget = affectedCastIds.some(
            (castId) => presenceMutationByCastIdRef.current.get(castId) === token,
          );
          if (isCurrentEventContext(context) && hasLatestTarget) {
            setAlertMessage(getMsg('useAttendanceState.presenceSaveFailed'));
          }
        }
      }
    },
    [casts, currentEventName, restorePersistedCasts, setCasts],
  );

  return {
    activeTab,
    setActiveTab,
    presentCasts,
    presentCount,
    groupedPresent,
    attendanceDates: attendanceMatrix.dates,
    attendanceRows: attendanceMatrix.rows,
    attendancePeriod,
    attendancePeriodDialogOpen,
    handleOpenAttendancePeriodDialog,
    handleCloseAttendancePeriodDialog,
    handleApplyAttendancePeriod,
    historyLoadStatus,
    saving,
    confirmSave,
    setConfirmSave,
    recordDate,
    handleRecordDateChange,
    dateRecordStatus,
    alertMessage,
    setAlertMessage,
    handleSave,
    handleOpenSaveModal,
    handleTogglePresence,
    handleSetAll,
  };
}
