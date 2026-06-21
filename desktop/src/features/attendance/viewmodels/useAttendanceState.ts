import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { CastAttendanceEvent, CastAttendanceSummary } from '@/db';
import type { CastBean } from '@/common/types/entities';
import {
  buildAttendanceDates,
  buildAttendanceRows,
  groupCastsByGroupName,
} from '../models/attendanceMatrix';
import type { AttendanceTab } from '../models/types';
import {
  hasAttendanceRecordOnDate,
  loadAttendanceHistoryData,
  recordAttendanceForDate,
  updateCastPresence,
} from '../services/attendanceService';

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface UseAttendanceStateParams {
  currentEventName: string | null;
  casts: CastBean[];
  setCasts: Dispatch<SetStateAction<CastBean[]>>;
}

export function useAttendanceState({ currentEventName, casts, setCasts }: UseAttendanceStateParams) {
  const [activeTab, setActiveTab] = useState<AttendanceTab>('setup');
  const [history, setHistory] = useState<CastAttendanceEvent[]>([]);
  const [summary, setSummary] = useState<CastAttendanceSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [recordDate, setRecordDate] = useState('');
  const [dateHasRecord, setDateHasRecord] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const presentCasts = useMemo(() => casts.filter((cast) => cast.is_present), [casts]);
  const presentCount = presentCasts.length;
  const groupedPresent = useMemo(() => groupCastsByGroupName(presentCasts), [presentCasts]);
  const attendanceDates = useMemo(() => buildAttendanceDates(history), [history]);
  const attendanceRows = useMemo(
    () => buildAttendanceRows(casts, history, summary),
    [casts, history, summary],
  );

  const loadData = useCallback(async () => {
    if (currentEventName === null) {
      setHistory([]);
      setSummary([]);
      return;
    }

    try {
      const data = await loadAttendanceHistoryData();
      setHistory(data.history);
      setSummary(data.summary);
    } catch {
      setHistory([]);
      setSummary([]);
    }
  }, [currentEventName]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!confirmSave || currentEventName === null || !DATE_VALUE_PATTERN.test(recordDate)) {
      setDateHasRecord(false);
      return;
    }

    let isActive = true;
    void hasAttendanceRecordOnDate(recordDate).then((hasRecord) => {
      if (isActive) setDateHasRecord(hasRecord);
    });

    return () => {
      isActive = false;
    };
  }, [confirmSave, currentEventName, recordDate]);

  const handleSave = useCallback(async () => {
    if (currentEventName === null || !DATE_VALUE_PATTERN.test(recordDate)) return;
    setSaving(true);

    try {
      await recordAttendanceForDate(presentCasts.map((cast) => cast.name), recordDate);
      await loadData();
      setAlertMessage('出席記録を保存しました。');
    } catch (error) {
      setAlertMessage(`保存に失敗しました: ${String(error)}`);
    } finally {
      setSaving(false);
      setConfirmSave(false);
    }
  }, [currentEventName, loadData, presentCasts, recordDate]);

  const handleOpenSaveModal = useCallback(() => {
    setRecordDate(new Date().toLocaleDateString('sv'));
    setConfirmSave(true);
  }, []);

  const handleTogglePresence = useCallback(
    async (castName: string, isPresent: boolean) => {
      if (currentEventName === null) return;
      setCasts((prev) => prev.map((cast) => (
        cast.name === castName ? { ...cast, is_present: isPresent } : cast
      )));
      await updateCastPresence(castName, isPresent);
    },
    [currentEventName, setCasts],
  );

  const handleSetAll = useCallback(
    async (isPresent: boolean) => {
      if (currentEventName === null) return;
      const castNames = casts.map((cast) => cast.name);
      setCasts((prev) => prev.map((cast) => ({ ...cast, is_present: isPresent })));
      await Promise.all(castNames.map((castName) => updateCastPresence(castName, isPresent)));
    },
    [casts, currentEventName, setCasts],
  );

  return {
    activeTab,
    setActiveTab,
    presentCasts,
    presentCount,
    groupedPresent,
    attendanceDates,
    attendanceRows,
    saving,
    confirmSave,
    setConfirmSave,
    recordDate,
    setRecordDate,
    dateHasRecord,
    alertMessage,
    setAlertMessage,
    handleSave,
    handleOpenSaveModal,
    handleTogglePresence,
    handleSetAll,
  };
}
