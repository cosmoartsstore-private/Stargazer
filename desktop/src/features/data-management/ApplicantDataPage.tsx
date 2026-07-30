// 応募者データの一覧表示・絞り込み・削除・再取込を管理するページ。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppDialog } from '@/components/AppDialog';
import { AppSelect, type AppSelectOption } from '@/components/AppSelect';
import { ConfirmDialog, NoticeDialog } from '@/components/ConfirmModal';
import dialogStyles from '@/components/ConfirmModal.module.css';
import { ImportPage, type ImportPageInitialData } from '@/features/import/ImportPage';
import {
  listEventSavedLotteryRuns,
  type EventSavedLotteryRunSummary,
} from '@/db/repositories/lotteryRepository';
import { useAppContext } from '@/stores/AppContext';
import type { PageType } from '@/layout/appNavigation';
import type { CastBean, UserBean } from '@/common/types/entities';
import { buildXProfileUrl, formatXAccountIdForDisplay } from '@/common/xIdUtils';
import { getMsg } from '@/messages/getMsg';
import { openExternalUrl } from '@/tauri';
import {
  buildApplicantListViewModel,
  EMPTY_APPLICANT_ROW_DATA,
  type ApplicantFilterMode,
} from './applicantListModel';
import { useApplicantMutations } from './hooks/useApplicantMutations';
import styles from './ApplicantDataPage.module.css';
import shared from '@/styles/shared.module.css';

interface ApplicantDataPageProps {
  onImportUsers: (users: UserBean[], nextPage?: PageType) => void;
  enableSavedLotteryHistory?: boolean;
  initialImportData?: ImportPageInitialData;
}

const UNRESOLVED_PREFERENCE_VALUE = '__unresolved__';
const REMOVE_PREFERENCE_VALUE = '__remove__';

function getExtraMap(rawExtra: UserBean['raw_extra']): Map<string, string> {
  return new Map(rawExtra.map((entry) => [entry.key, entry.value]));
}

function formatCastList(casts: string[]): string {
  return casts.filter(Boolean).join('、') || getMsg('common.emptyMarker');
}

function getCastGridStyle(columnCount: number): React.CSSProperties {
  return { gridTemplateColumns: `repeat(${columnCount}, minmax(128px, 128px))` };
}

function formatSessionTimestamp(timestamp: string): string {
  if (!/^\d{14}$/.test(timestamp)) return timestamp;
  return `${timestamp.slice(0, 4)}/${timestamp.slice(4, 6)}/${timestamp.slice(6, 8)} ${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}`;
}

function getPreferenceLabel(user: UserBean, index: number): string {
  return user.preference_mode === 'flat'
    ? getMsg('ApplicantDataPage.preferencePosition', { position: index + 1 })
    : getMsg('ApplicantDataPage.preferenceRank', { rank: index + 1 });
}

interface XProfileLinkProps {
  accountId: string;
  onOpenError: () => void;
}

/** 有効なX IDだけを、外部ブラウザで開けるプロフィールリンクとして表示する。 */
const XProfileLink: React.FC<XProfileLinkProps> = ({ accountId, onOpenError }) => {
  const label = formatXAccountIdForDisplay(accountId);
  const profileUrl = buildXProfileUrl(accountId);
  if (!profileUrl) return <>{label || getMsg('ApplicantDataPage.xIdMissing')}</>;

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void openExternalUrl(profileUrl).catch(onOpenError);
  };

  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noreferrer"
      className={styles.applicantXProfileLink}
      aria-label={getMsg('ApplicantDataPage.openXProfileAriaLabel', { id: label })}
      onClick={handleClick}
    >
      {label}
    </a>
  );
};

interface DetailModalProps {
  user: UserBean;
  isCaution: boolean;
  ngCastNames: string[];
  unavailablePreferenceIndexes: number[];
  casts: CastBean[];
  extraMap: Map<string, string>;
  isSaving: boolean;
  readOnly: boolean;
  onSave: (updatedUser: UserBean) => Promise<boolean>;
  onOpenXProfileError: () => void;
  onClose: () => void;
}

const ApplicantDetailModal: React.FC<DetailModalProps> = ({
  user,
  isCaution,
  ngCastNames,
  unavailablePreferenceIndexes,
  casts,
  extraMap,
  isSaving,
  readOnly,
  onSave,
  onOpenXProfileError,
  onClose,
}) => {
  // 詳細ダイアログの警告状態と希望形式を応募者データから導出する。
  const hasNgCasts = ngCastNames.length > 0;
  const hasUnavailablePreferences = unavailablePreferenceIndexes.length > 0;
  const isFlatPreference = user.preference_mode === 'flat';
  const unavailablePreferenceIndexSet = useMemo(
    () => new Set(unavailablePreferenceIndexes),
    [unavailablePreferenceIndexes],
  );
  const [preferenceSelections, setPreferenceSelections] = useState<Record<number, string>>(
    () => Object.fromEntries(
      unavailablePreferenceIndexes.map((index) => [index, UNRESOLVED_PREFERENCE_VALUE]),
    ),
  );
  const castById = useMemo(
    () => new Map(casts.map((cast) => [cast.id, cast])),
    [casts],
  );
  const castOptions: AppSelectOption[] = useMemo(() => [
    { value: UNRESOLVED_PREFERENCE_VALUE, label: getMsg('ApplicantDataPage.selectReplacementCast') },
    { value: REMOVE_PREFERENCE_VALUE, label: getMsg('ApplicantDataPage.removePreference') },
    ...casts.map((cast) => ({ value: String(cast.id), label: cast.name })),
  ], [casts]);
  const selectedCastIds = Array.from(
    { length: Math.max(user.casts.length, user.cast_ids?.length ?? 0) },
    (_, index) => {
      if (!unavailablePreferenceIndexSet.has(index)) return user.cast_ids?.[index] ?? null;
      const selection = preferenceSelections[index];
      if (selection === undefined || selection === UNRESOLVED_PREFERENCE_VALUE || selection === REMOVE_PREFERENCE_VALUE) {
        return null;
      }
      return Number(selection);
    },
  );
  const hasDuplicateSelection = unavailablePreferenceIndexes.some((index) => {
    const castId = selectedCastIds[index];
    return castId !== null && selectedCastIds.some(
      (otherCastId, otherIndex) => otherIndex !== index && otherCastId === castId,
    );
  });
  const hasUnresolvedSelection = unavailablePreferenceIndexes.some(
    (index) => preferenceSelections[index] === undefined
      || preferenceSelections[index] === UNRESOLVED_PREFERENCE_VALUE,
  );
  const canSave = !readOnly && hasUnavailablePreferences && !hasUnresolvedSelection && !hasDuplicateSelection && !isSaving;
  const titleBadgeLabel = hasUnavailablePreferences
    ? getMsg('ApplicantDataPage.castCorrectionRequired')
    : hasNgCasts
      ? getMsg('ApplicantDataPage.hasNgCast')
      : isCaution
        ? getMsg('ApplicantDataPage.cautionUser')
        : null;
  const handleOpenChange = (open: boolean) => {
    if (!open && !isSaving) onClose();
  };
  const handlePreferenceChange = (index: number, value: string) => {
    setPreferenceSelections((current) => ({ ...current, [index]: value }));
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    const nextCasts = Array.from(
      { length: selectedCastIds.length },
      (_, index) => user.casts[index] ?? '',
    );
    const nextCastIds = [...selectedCastIds];
    for (const index of unavailablePreferenceIndexes) {
      const castId = nextCastIds[index];
      nextCasts[index] = castId === null ? '' : (castById.get(castId)?.name ?? '');
    }
    const activeFlatPreferences = nextCastIds.flatMap((castId, index) => (
      castId === null || nextCasts[index] === ''
        ? []
        : [{ castId, castName: nextCasts[index] }]
    ));
    const updatedUser = isFlatPreference
      ? {
          ...user,
          casts: activeFlatPreferences.map(({ castName }) => castName),
          cast_ids: activeFlatPreferences.map(({ castId }) => castId),
        }
      : { ...user, casts: nextCasts, cast_ids: nextCastIds };
    if (await onSave(updatedUser)) onClose();
  };
  const title = (
    <>
      {user.name || getMsg('common.unnamed')}
      {titleBadgeLabel && (
        <span className={`${styles.applicantDetailTitleBadge} ${
          hasUnavailablePreferences ? styles.applicantCastIssueText : styles.cautionReason
        }`}>{titleBadgeLabel}</span>
      )}
    </>
  );

  const renderPreferenceValue = (index: number) => {
    const castName = user.casts[index] || getMsg('common.emptyMarker');
    if (!unavailablePreferenceIndexSet.has(index) || readOnly) return castName;
    const labelId = `applicant-preference-label-${user.id ?? 'unknown'}-${index}`;
    return (
      <div className={styles.applicantPreferenceEditor}>
        <span id={labelId} className={styles.applicantPreferenceOriginal}>
          {getMsg('ApplicantDataPage.currentInvalidPreference', { name: castName })}
        </span>
        <AppSelect
          value={preferenceSelections[index] ?? UNRESOLVED_PREFERENCE_VALUE}
          onValueChange={(value) => handlePreferenceChange(index, value)}
          options={castOptions}
          disabled={isSaving}
          className={styles.applicantPreferenceSelect}
          ariaLabelledBy={labelId}
        />
      </div>
    );
  };
  const preferenceIndexes = Array.from(
    { length: Math.max(user.casts.length, user.cast_ids?.length ?? 0) },
    (_, index) => index,
  ).filter((index) => Boolean(user.casts[index]) || unavailablePreferenceIndexSet.has(index));

  return (
    <AppDialog
      open
      onOpenChange={handleOpenChange}
      title={title}
      showClose
      className={styles.applicantDetailModal}
      titleClassName={styles.applicantDetailTitle}
      closeOnInteractOutside={!isSaving}
    >
      <form className={styles.applicantDetailForm} onSubmit={handleSubmit}>
        <div className={`${styles.applicantDetailModalBody} ${shared.customScrollbar}`}>
          {hasUnavailablePreferences && !readOnly && (
            <p className={styles.applicantPreferenceHelp} role="alert">
              {getMsg('ApplicantDataPage.preferenceCorrectionHelp')}
            </p>
          )}
          <dl className={styles.applicantRow__detailGrid}>
            <dt>{getMsg('ApplicantDataPage.xIdLabel')}</dt>
            <dd><XProfileLink accountId={user.x_id} onOpenError={onOpenXProfileError} /></dd>

            {user.vrc_url && (
              <>
                <dt>{getMsg('ApplicantDataPage.vrcUrlLabel')}</dt>
                <dd><a href={user.vrc_url} target="_blank" rel="noreferrer">{user.vrc_url}</a></dd>
              </>
            )}

            {isFlatPreference && !hasUnavailablePreferences ? (
              /* 正常な一覧形式の希望キャストを1項目で表示する。 */
              <>
                <dt>{getMsg('ApplicantDataPage.preferredCasts')}</dt>
                <dd>{formatCastList(user.casts)}</dd>
              </>
            ) : (
              /* 修正対象を含む希望は、対象位置ごとに選び直せるよう表示する。 */
              preferenceIndexes.map((index) => (
                <React.Fragment key={index}>
                  <dt>{getPreferenceLabel(user, index)}</dt>
                  <dd>{renderPreferenceValue(index)}</dd>
                </React.Fragment>
              ))
            )}

            {[...extraMap.entries()].map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}

            {hasNgCasts && (
              <>
                <dt>{getMsg('ApplicantDataPage.ngCasts')}</dt>
                <dd className={styles.cautionReason}>{getMsg('ApplicantDataPage.ngReason', { names: ngCastNames.join('、') })}</dd>
              </>
            )}
          </dl>

          {hasDuplicateSelection && (
            <p className={styles.applicantPreferenceError} role="alert">
              {getMsg('ApplicantDataPage.duplicatePreference')}
            </p>
          )}
        </div>
        {hasUnavailablePreferences && !readOnly && (
          <footer className={`${dialogStyles.modalButtons} ${styles.applicantPreferenceActions}`}>
            <button type="button" className={dialogStyles.modalBtnCancel} onClick={onClose} disabled={isSaving}>{getMsg('common.cancel')}</button>
            <button type="submit" className={`${shared.btnPrimary} ${dialogStyles.modalBtnAction}`} disabled={!canSave}>{isSaving ? getMsg('ApplicantDataPage.savingPreferences') : getMsg('ApplicantDataPage.savePreferences')}</button>
          </footer>
        )}
      </form>
    </AppDialog>
  );
};

interface RowProps {
  user: UserBean;
  isCaution: boolean;
  hasIdentityIssue: boolean;
  ngCastNames: string[];
  unavailablePreferenceIndexes: number[];
  isFlatList: boolean;
  flatCastColumnIndexes: number[];
  flatCastGridStyle: React.CSSProperties;
  readOnly: boolean;
  onSelect: (user: UserBean) => void;
  onRemove: (user: UserBean) => void;
  onOpenXProfileError: () => void;
}

const ApplicantRow = React.memo<RowProps>(({ user, isCaution, hasIdentityIssue, ngCastNames, unavailablePreferenceIndexes, isFlatList, flatCastColumnIndexes, flatCastGridStyle, readOnly, onSelect, onRemove, onOpenXProfileError }) => {
  // 行の警告表示と行内操作を、この応募者へ束縛する。
  const hasAttention = isCaution || ngCastNames.length > 0;
  const unavailablePreferenceIndexSet = new Set(unavailablePreferenceIndexes);
  const rowClassName = `${styles.applicantRow}${
    hasAttention ? ` ${styles.applicantRowAttention}` : ''
  }${hasIdentityIssue ? ` ${styles.applicantRowIdentityIssue}` : ''
  }`;
  const displayXId = formatXAccountIdForDisplay(user.x_id);
  const applicantLabel = user.name || displayXId || getMsg('common.unnamed');
  const handleSelect = () => onSelect(user);
  const handleDelete = () => onRemove(user);
  const renderCastValue = (index: number, emptyMarker = true) => {
    const castName = user.casts[index] ?? '';
    if (!unavailablePreferenceIndexSet.has(index)) {
      return castName || (emptyMarker ? getMsg('common.emptyMarker') : '');
    }
    if (readOnly) {
      return <span className={styles.applicantCastIssueValue}>{castName || getMsg('common.emptyMarker')}</span>;
    }
    return <button type="button" className={styles.applicantCastIssueButton} onClick={handleSelect} aria-label={getMsg('ApplicantDataPage.correctPreferenceAriaLabel', { name: castName || getMsg('common.emptyMarker') })}>{castName || getMsg('common.emptyMarker')}</button>;
  };

  return (
    <tr className={rowClassName}>
      <td className={styles.applicantListNameCell}><button type="button" className={styles.applicantDetailButton} aria-label={getMsg('ApplicantDataPage.openDetailsAriaLabel', { label: applicantLabel })} onClick={handleSelect}>{user.name || getMsg('common.unnamed')}</button></td>
      <td className={styles.applicantListIdCell}>
        <XProfileLink accountId={user.x_id} onOpenError={onOpenXProfileError} />
      </td>
      {isFlatList ? (
        /* 希望キャストを一覧形式の1列で表示 */
        <td className={styles.applicantListFlatCastCell}>
          <div className={styles.applicantListCastGrid} style={flatCastGridStyle}>
            {flatCastColumnIndexes.map((index) => {
              const cast = user.casts[index] ?? '';
              const castClassName = `${styles.applicantListCastGridItem}${
                cast || unavailablePreferenceIndexSet.has(index) ? '' : ` ${styles.applicantListCastGridItemEmpty}`
              }${unavailablePreferenceIndexSet.has(index) ? ` ${styles.applicantListCastGridItemIssue}` : ''
              }`;
              return (
                <span key={index} className={castClassName}>{renderCastValue(index, false)}</span>
              );
            })}
          </div>
        </td>
      ) : (
        /* 希望キャストを順位別の3列で表示 */
        <>
          {[0, 1, 2].map((index) => (
            <td key={index} className={`${styles.applicantListCastCell}${
              unavailablePreferenceIndexSet.has(index) ? ` ${styles.applicantListCastCellIssue}` : ''
            }`}>{renderCastValue(index)}</td>
          ))}
        </>
      )}
      <td className={styles.applicantListNgCell}><NgCastCell ngCastNames={ngCastNames} /></td>
      <td><button type="button" className={styles.applicantDeleteButton} onClick={handleDelete} disabled={readOnly} aria-label={getMsg('ApplicantDataPage.deleteApplicantAriaLabel', { label: applicantLabel })}>×</button></td>
    </tr>
  );
});

interface NgCastCellProps {
  ngCastNames: string[];
}

const NgCastCell: React.FC<NgCastCellProps> = ({ ngCastNames }) => {
  if (ngCastNames.length === 0) {
    return <span className={styles.ngCastNone}>{getMsg('common.emptyMarker')}</span>;
  }
  if (ngCastNames.length === 1) {
    return <span className={styles.ngCastSingle}>{ngCastNames[0]}</span>;
  }
  return <span className={styles.ngCastSummary}>{getMsg('ApplicantDataPage.ngCastSummary', { count: ngCastNames.length })}</span>;
};

export const ApplicantDataPage: React.FC<ApplicantDataPageProps> = ({ onImportUsers, enableSavedLotteryHistory = true, initialImportData }) => {
  // 応募者一覧の表示・削除と、後続工程の失効処理に必要な共有状態を取得する。
  const {
    applicants,
    casts,
    matchingSettings,
    currentEventName,
    currentSessionTimestamp,
    isSavedLotterySessionReadOnly,
    setActivePage,
    activateSavedLotteryRun,
  } = useAppContext();
  const isSavedLotteryReadOnly = isSavedLotterySessionReadOnly;

  // 一覧の絞り込み、選択対象、各ダイアログの表示状態を保持する。
  const [filterMode, setFilterMode] = useState<ApplicantFilterMode>('all');
  const [selectedUser, setSelectedUser] = useState<UserBean | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);
  const [savedLotteryRuns, setSavedLotteryRuns] = useState<EventSavedLotteryRunSummary[]>([]);
  const [selectedSavedLotteryKey, setSelectedSavedLotteryKey] = useState('');
  const [isSavedLotteryListLoading, setIsSavedLotteryListLoading] = useState(false);
  const [isSavedLotteryOpening, setIsSavedLotteryOpening] = useState(false);
  const [savedLotteryAlertMessage, setSavedLotteryAlertMessage] = useState<string | null>(null);
  const [xProfileAlertMessage, setXProfileAlertMessage] = useState<string | null>(null);

  const {
    alertMessage,
    removeTarget,
    showClearConfirm,
    isPreferenceSaving,
    saveApplicantPreferences,
    handleRemoveClick,
    handleOpenClearConfirm,
    handleConfirmRemove,
    handleConfirmClearAll,
    handleDismissAlert,
    handleCancelRemove,
    handleCancelClearAll,
  } = useApplicantMutations({ selectedUser, setSelectedUser, setShowImportForm });

  // イベント内で明示保存された抽選結果を、所有セッションと組み合わせて読み込む。
  useEffect(() => {
    let isCurrent = true;
    if (!enableSavedLotteryHistory || currentEventName === null) {
      setSavedLotteryRuns([]);
      setSelectedSavedLotteryKey('');
      setIsSavedLotteryListLoading(false);
      setSavedLotteryAlertMessage(null);
      return () => { isCurrent = false; };
    }
    setSavedLotteryRuns([]);
    setSelectedSavedLotteryKey('');
    setIsSavedLotteryListLoading(true);
    void listEventSavedLotteryRuns(currentEventName)
      .then((runs) => {
        if (!isCurrent) return;
        setSavedLotteryRuns(runs);
        setSelectedSavedLotteryKey((current) => (
          runs.some((run) => `${run.sessionTimestamp}:${run.runId}` === current) ? current : ''
        ));
      })
      .catch(() => {
        if (isCurrent) setSavedLotteryAlertMessage(getMsg('ApplicantDataPage.savedLotteryListFailed'));
      })
      .finally(() => {
        if (isCurrent) setIsSavedLotteryListLoading(false);
    });
    return () => { isCurrent = false; };
  }, [currentEventName, enableSavedLotteryHistory]);

  useEffect(() => {
    setSelectedUser(null);
    setFilterMode('all');
  }, [currentSessionTimestamp]);

  // 応募者一覧の警告・絞り込み・希望列構造を純粋モデルから取得する。
  const {
    rowDataMap,
    cautionCount,
    castIssueCount,
    filteredUsers,
    isFlatList,
    flatCastColumnIndexes,
  } = useMemo(
    () => buildApplicantListViewModel(
      applicants,
      casts,
      filterMode,
      matchingSettings.caution.cautionUsers,
      matchingSettings.caution.candidateThreshold,
    ),
    [
      applicants,
      casts,
      filterMode,
      matchingSettings.caution.cautionUsers,
      matchingSettings.caution.candidateThreshold,
    ],
  );
  const flatCastGridStyle = getCastGridStyle(flatCastColumnIndexes.length);
  const savedLotteryOptions: AppSelectOption[] = useMemo(
    () => savedLotteryRuns.map((run) => ({
      value: `${run.sessionTimestamp}:${run.runId}`,
      label: getMsg('ApplicantDataPage.savedLotteryOption', {
        label: run.label,
        importedAt: formatSessionTimestamp(run.sessionTimestamp),
        current: run.sessionTimestamp === currentSessionTimestamp
          ? getMsg('ApplicantDataPage.currentLotterySessionSuffix')
          : '',
      }),
    })),
    [currentSessionTimestamp, savedLotteryRuns],
  );
  const selectedSavedLotteryRun = savedLotteryRuns.find(
    (run) => `${run.sessionTimestamp}:${run.runId}` === selectedSavedLotteryKey,
  ) ?? null;

  // 行コンポーネントへ渡す選択操作の参照を安定させる。
  const handleSelect = useCallback((user: UserBean) => setSelectedUser(user), []);
  const handleXProfileOpenError = useCallback(
    () => setXProfileAlertMessage(getMsg('ApplicantDataPage.openXProfileFailed')),
    [],
  );
  const handleOpenSavedLotteryRun = () => {
    if (selectedSavedLotteryRun === null || isSavedLotteryOpening) return;
    setIsSavedLotteryOpening(true);
    void activateSavedLotteryRun({
      sessionTimestamp: selectedSavedLotteryRun.sessionTimestamp,
      runId: selectedSavedLotteryRun.runId,
    })
      .then(() => setActivePage('lottery'))
      .catch(() => setSavedLotteryAlertMessage(getMsg('ApplicantDataPage.savedLotteryOpenFailed')))
      .finally(() => setIsSavedLotteryOpening(false));
  };
  const handleDismissSavedLotteryAlert = () => setSavedLotteryAlertMessage(null);
  const savedLotteryPicker = enableSavedLotteryHistory ? (
    <section className={styles.applicantSavedLotteryPicker} aria-labelledby="applicant-saved-lottery-picker-title">
      <div className={styles.applicantSavedLotteryPickerText}>
        <h2 id="applicant-saved-lottery-picker-title">{getMsg('ApplicantDataPage.savedLotteryPickerTitle')}</h2>
        <p id="applicant-saved-lottery-picker-help">{getMsg('ApplicantDataPage.savedLotteryPickerHelp')}</p>
      </div>
      <div className={styles.applicantSavedLotteryPickerControl}>
        <span id="applicant-saved-lottery-picker-label" className={styles.applicantSavedLotteryPickerLabel}>{getMsg('ApplicantDataPage.savedLotteryPickerLabel')}</span>
        <div className={styles.applicantSavedLotteryPickerActions}>
          <AppSelect
            id="applicant-saved-lottery-select"
            value={selectedSavedLotteryKey}
            onValueChange={setSelectedSavedLotteryKey}
            options={savedLotteryOptions}
            placeholder={isSavedLotteryListLoading
              ? getMsg('ApplicantDataPage.loadingSavedLotteryRuns')
              : savedLotteryRuns.length === 0
                ? getMsg('ApplicantDataPage.noSavedLotteryRuns')
                : getMsg('ApplicantDataPage.selectSavedLotteryRun')}
            disabled={isSavedLotteryListLoading || isSavedLotteryOpening || savedLotteryRuns.length === 0}
            className={styles.applicantSavedLotterySelect}
            ariaLabelledBy="applicant-saved-lottery-picker-label"
          />
          <button type="button" className={shared.btnSecondary} disabled={selectedSavedLotteryRun === null || isSavedLotteryOpening} onClick={handleOpenSavedLotteryRun}>{getMsg(isSavedLotteryOpening ? 'ApplicantDataPage.openingSavedLotteryRun' : 'ApplicantDataPage.openSavedLotteryRun')}</button>
        </div>
        {(isSavedLotteryListLoading || isSavedLotteryOpening) && (
          <span className={styles.applicantSavedLotteryPickerStatus} role="status">
            {getMsg(isSavedLotteryOpening ? 'ApplicantDataPage.openingSavedLotteryStatus' : 'ApplicantDataPage.loadingSavedLotteryRuns')}
          </span>
        )}
      </div>
    </section>
  ) : null;

  if (applicants.length === 0) {
    return (
      <div className={shared.pageWrapper}>
        <div className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
          <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('ApplicantDataPage.pageTitle')}</h1>
          <p className={shared.pageHeaderSubtitle}>{getMsg('ApplicantDataPage.emptyDescription')}</p>
        </div>
        {savedLotteryPicker}
        <section className={shared.sectionBlock} aria-label={getMsg('ApplicantDataPage.importSectionAriaLabel')}>
          <fieldset className={styles.applicantImportFieldset} disabled={isSavedLotteryOpening}>
            <ImportPage onImportUsers={onImportUsers} initialData={initialImportData} />
          </fieldset>
        </section>
        {enableSavedLotteryHistory && savedLotteryAlertMessage && (
          <NoticeDialog title={getMsg('ApplicantDataPage.savedLotteryPickerTitle')} message={savedLotteryAlertMessage} closeLabel={getMsg('common.close')} onClose={handleDismissSavedLotteryAlert} />
        )}
      </div>
    );
  }

  const selectedRowData = selectedUser
    ? (rowDataMap.get(selectedUser) ?? EMPTY_APPLICANT_ROW_DATA)
    : null;

  // 現在の表示状態に応じたclassとUI操作をまとめる。
  const pageClassName = `${shared.pageWrapper} ${shared.pageWrapperFlex} ${styles.applicantListPage}${
    showImportForm ? '' : ` ${styles.applicantListPageStatic}`
  }`;
  const getFilterTabClassName = (mode: ApplicantFilterMode) => (
    `${styles.applicantFilterTab}${
      filterMode === mode ? ` ${styles.applicantFilterTabActive}` : ''
    }`
  );
  const handleShowCautionFilter = () => setFilterMode('caution');
  const handleShowCastIssueFilter = () => setFilterMode('castIssue');
  const handleShowAllFilter = () => setFilterMode('all');
  const handleToggleImportForm = () => setShowImportForm((open) => !open);
  const handleCloseDetail = () => setSelectedUser(null);
  const importFormButtonLabel = showImportForm
    ? getMsg('ApplicantDataPage.closeImport')
    : getMsg(isSavedLotteryReadOnly ? 'ApplicantDataPage.importNewData' : 'ApplicantDataPage.reimport');

  // 選択中の応募者だけ、詳細ダイアログ用の追加項目を展開する。
  const selectedExtraMap = selectedUser ? getExtraMap(selectedUser.raw_extra) : null;

  return (
    <div className={pageClassName}>
      {savedLotteryPicker}
      <div className={styles.applicantListHeader}>
        <div className={styles.applicantListHeader__stats}>
          <span className={styles.applicantListHeader__count}>{getMsg('ApplicantDataPage.applicantCount', { count: applicants.length })}</span>
          {cautionCount > 0 && (
            <button type="button" className={styles.applicantCautionBadge} aria-pressed={filterMode === 'caution'} onClick={handleShowCautionFilter}>{getMsg('ApplicantDataPage.cautionCount', { count: cautionCount })}</button>
          )}
          {castIssueCount > 0 && (
            <button type="button" className={styles.applicantCastIssueFilterBadge} aria-pressed={filterMode === 'castIssue'} onClick={handleShowCastIssueFilter}>{getMsg('ApplicantDataPage.castIssueCount', { count: castIssueCount })}</button>
          )}
        </div>

        <div className={styles.applicantFilterTabs} role="group" aria-label={getMsg('ApplicantDataPage.filterAriaLabel')}>
          <button type="button" className={getFilterTabClassName('all')} aria-pressed={filterMode === 'all'} onClick={handleShowAllFilter}>{getMsg('ApplicantDataPage.allFilter', { count: applicants.length })}</button>
          {cautionCount > 0 && (
            <button type="button" className={getFilterTabClassName('caution')} aria-pressed={filterMode === 'caution'} onClick={handleShowCautionFilter}>{getMsg('ApplicantDataPage.cautionFilter', { count: cautionCount })}</button>
          )}
          {castIssueCount > 0 && (
            <button type="button" className={getFilterTabClassName('castIssue')} aria-pressed={filterMode === 'castIssue'} onClick={handleShowCastIssueFilter}>{getMsg('ApplicantDataPage.castIssueFilter', { count: castIssueCount })}</button>
          )}
        </div>

        <div className={styles.applicantListHeader__actions}>
          <button type="button" className={`${shared.btnSecondary} ${styles.applicantListHeader__actionButton}`} aria-expanded={showImportForm} aria-controls="applicant-reimport-form" onClick={handleToggleImportForm} disabled={isSavedLotteryOpening}>{importFormButtonLabel}</button>
          <button type="button" className={`${shared.btnDanger} ${styles.applicantListHeader__actionButton}`} onClick={handleOpenClearConfirm} disabled={isSavedLotteryOpening || isSavedLotteryReadOnly}>{getMsg('ApplicantDataPage.deleteAllButton')}</button>
        </div>
      </div>

      {showImportForm && (
        <section id="applicant-reimport-form" className={`${shared.sectionBlock} ${styles.applicantReimportSection}`} aria-label={getMsg('ApplicantDataPage.reimportSectionAriaLabel')}>
          <fieldset className={styles.applicantImportFieldset} disabled={isSavedLotteryOpening}>
            <ImportPage onImportUsers={onImportUsers} />
          </fieldset>
        </section>
      )}

      <div className={`${shared.tableContainer} ${shared.customScrollbar} ${styles.applicantListTableContainer}`}>
        <table className={styles.applicantListTable}>
          <thead>
            <tr>
              <th className={styles.applicantListNameCell}>{getMsg('ApplicantDataPage.userNameHeader')}</th>
              <th className={styles.applicantListIdCell}>{getMsg('ApplicantDataPage.xIdLabel')}</th>
              {isFlatList ? (
                /* 一覧形式の希望キャスト見出しを表示 */
                <th className={styles.applicantListFlatCastCell}>{getMsg('ApplicantDataPage.preferredCasts')}</th>
              ) : (
                /* 順位別の希望キャスト見出しを表示 */
                <>
                  <th className={styles.applicantListCastCell}>{getMsg('ApplicantDataPage.preferredCastColumn', { rank: 1 })}</th>
                  <th className={styles.applicantListCastCell}>{getMsg('ApplicantDataPage.preferredCastColumn', { rank: 2 })}</th>
                  <th className={styles.applicantListCastCell}>{getMsg('ApplicantDataPage.preferredCastColumn', { rank: 3 })}</th>
                </>
              )}
              <th className={styles.applicantListNgCell}>{getMsg('ApplicantDataPage.ngCasts')}</th>
              <th aria-label={getMsg('ApplicantDataPage.actionsAriaLabel')}></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && (
              <tr><td colSpan={isFlatList ? 5 : 7} className={styles.applicantEmptyCell}>{getMsg('ApplicantDataPage.noMatchingData')}</td></tr>
            )}
            {filteredUsers.map((user, index) => {
              const rd = rowDataMap.get(user) ?? EMPTY_APPLICANT_ROW_DATA;
              return (
                <ApplicantRow
                  key={user.id ?? `${user.x_id}-${index}`}
                  user={user}
                  isCaution={rd.isCaution}
                  hasIdentityIssue={rd.hasIdentityIssue}
                  ngCastNames={rd.ngCastNames}
                  unavailablePreferenceIndexes={rd.unavailablePreferenceIndexes}
                  isFlatList={isFlatList}
                  flatCastColumnIndexes={flatCastColumnIndexes}
                  flatCastGridStyle={flatCastGridStyle}
                  readOnly={isSavedLotteryReadOnly}
                  onSelect={handleSelect}
                  onRemove={handleRemoveClick}
                  onOpenXProfileError={handleXProfileOpenError}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedUser && selectedRowData && selectedExtraMap && (
        <ApplicantDetailModal
          key={selectedUser.id ?? selectedUser.x_id}
          user={selectedUser}
          isCaution={selectedRowData.isCaution}
          ngCastNames={selectedRowData.ngCastNames}
          unavailablePreferenceIndexes={selectedRowData.unavailablePreferenceIndexes}
          casts={casts}
          extraMap={selectedExtraMap}
          isSaving={isPreferenceSaving}
          readOnly={isSavedLotteryReadOnly}
          onSave={saveApplicantPreferences}
          onOpenXProfileError={handleXProfileOpenError}
          onClose={handleCloseDetail}
        />
      )}

      {alertMessage && (
        <NoticeDialog
          title={getMsg('ApplicantDataPage.pageTitle')}
          message={alertMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleDismissAlert}
        />
      )}
      {enableSavedLotteryHistory && savedLotteryAlertMessage && (
        <NoticeDialog
          title={getMsg('ApplicantDataPage.savedLotteryPickerTitle')}
          message={savedLotteryAlertMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleDismissSavedLotteryAlert}
        />
      )}
      {xProfileAlertMessage && (
        <NoticeDialog
          title={getMsg('ApplicantDataPage.xIdLabel')}
          message={xProfileAlertMessage}
          closeLabel={getMsg('common.close')}
          onClose={() => setXProfileAlertMessage(null)}
        />
      )}
      {removeTarget !== null && (
        <ConfirmDialog
          title={getMsg('ApplicantDataPage.deleteDialogTitle')}
          message={getMsg('ApplicantDataPage.deleteDialogMessage', {
            label: removeTarget.name || formatXAccountIdForDisplay(removeTarget.x_id),
          })}
          confirmLabel={getMsg('common.delete')}
          cancelLabel={getMsg('common.cancel')}
          intent="danger"
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
        />
      )}
      {showClearConfirm && (
        <ConfirmDialog
          title={getMsg('ApplicantDataPage.deleteAllDialogTitle')}
          message={getMsg('ApplicantDataPage.deleteAllDialogMessage', { count: applicants.length })}
          confirmLabel={getMsg('ApplicantDataPage.deleteAll')}
          cancelLabel={getMsg('common.cancel')}
          intent="danger"
          onConfirm={handleConfirmClearAll}
          onCancel={handleCancelClearAll}
        />
      )}
    </div>
  );
};
