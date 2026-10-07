// 応募者の任意表示列を、現在のヘッダー構成と端末保存値へ同期する。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApplicantDisplayColumns, buildApplicantDisplayColumnSchema, getStoredApplicantDisplayColumnIds, normalizeApplicantDisplayColumnIds, persistApplicantDisplayColumnIds, type ApplicantDisplayColumn } from '@/common/applicantDisplayColumns';
import type { UserBean } from '@/common/types/entities';

interface SelectionState {
  schemaKey: string;
  columnIds: string[];
}

export interface ApplicantDisplayColumnContextState {
  applicantDisplayColumns: ApplicantDisplayColumn[];
  selectedApplicantDisplayColumnIds: string[];
  selectedApplicantDisplayColumns: ApplicantDisplayColumn[];
  setSelectedApplicantDisplayColumnIds: (columnIds: readonly string[]) => boolean;
}

/** 応募一覧と抽選結果から共用する表示列選択を提供する。 */
export function useApplicantDisplayColumns(applicants: readonly UserBean[]): ApplicantDisplayColumnContextState {
  const applicantDisplayColumns = useMemo(() => buildApplicantDisplayColumns(applicants), [applicants]);
  const columnSchema = useMemo(() => buildApplicantDisplayColumnSchema(applicants), [applicants]);
  const schemaKey = applicants.length === 0 ? '' : JSON.stringify(columnSchema);
  const storedColumnIds = useMemo(
    () => (schemaKey
      ? getStoredApplicantDisplayColumnIds(columnSchema, applicantDisplayColumns)
      : []),
    [applicantDisplayColumns, columnSchema, schemaKey],
  );
  const [selectionState, setSelectionState] = useState<SelectionState>({ schemaKey, columnIds: storedColumnIds });
  const selectedApplicantDisplayColumnIds = useMemo(
    () => (selectionState.schemaKey === schemaKey
      ? normalizeApplicantDisplayColumnIds(selectionState.columnIds, applicantDisplayColumns)
      : storedColumnIds),
    [applicantDisplayColumns, schemaKey, selectionState, storedColumnIds],
  );

  useEffect(() => {
    setSelectionState({ schemaKey, columnIds: storedColumnIds });
  }, [schemaKey, storedColumnIds]);

  const selectedApplicantDisplayColumns = useMemo(() => applicantDisplayColumns.filter((column) => (selectedApplicantDisplayColumnIds.includes(column.id))), [applicantDisplayColumns, selectedApplicantDisplayColumnIds]);
  const setSelectedApplicantDisplayColumnIds = useCallback((columnIds: readonly string[]) => {
    if (!schemaKey) return false;
    const normalizedIds = normalizeApplicantDisplayColumnIds(columnIds, applicantDisplayColumns);
    setSelectionState({ schemaKey, columnIds: normalizedIds });
    return persistApplicantDisplayColumnIds(columnSchema, normalizedIds, applicantDisplayColumns);
  }, [applicantDisplayColumns, columnSchema, schemaKey]);

  return { applicantDisplayColumns, selectedApplicantDisplayColumnIds, selectedApplicantDisplayColumns, setSelectedApplicantDisplayColumnIds };
}
