// 応募者データの一覧表示・絞り込み・削除・再取込を管理するページ。

import React, { useCallback, useMemo, useState } from 'react';
import { AppDialog } from '@/components/AppDialog';
import { ConfirmDialog, NoticeDialog } from '@/components/ConfirmModal';
import { ImportPage } from '@/features/import/ImportPage';
import { useAppContext } from '@/stores/AppContext';
import type { PageType } from '@/layout/appNavigation';
import type { UserBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';
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
}

function getExtraMap(rawExtra: UserBean['raw_extra']): Map<string, string> {
  return new Map(rawExtra.map((entry) => [entry.key, entry.value]));
}

function formatCastList(casts: string[]): string {
  return casts.filter(Boolean).join('、') || getMsg('common.emptyMarker');
}

function getCastGridStyle(columnCount: number): React.CSSProperties {
  return { gridTemplateColumns: `repeat(${columnCount}, minmax(128px, 128px))` };
}

interface DetailModalProps {
  user: UserBean;
  isCaution: boolean;
  ngCastNames: string[];
  extraMap: Map<string, string>;
  onClose: () => void;
}

const ApplicantDetailModal: React.FC<DetailModalProps> = ({ user, isCaution, ngCastNames, extraMap, onClose }) => {
  // 詳細ダイアログの警告状態と希望形式を応募者データから導出する。
  const hasNgCasts = ngCastNames.length > 0;
  const isFlatPreference = user.preference_mode === 'flat';
  const titleBadgeLabel = hasNgCasts
    ? getMsg('ApplicantDataPage.hasNgCast')
    : isCaution
      ? getMsg('ApplicantDataPage.cautionUser')
      : null;
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const title = (
    <>
      {user.name || getMsg('common.unnamed')}
      {titleBadgeLabel && <span className={`${styles.cautionReason} ${styles.applicantDetailTitleBadge}`}>{titleBadgeLabel}</span>}
    </>
  );

  return (
    <AppDialog
      open
      onOpenChange={handleOpenChange}
      title={title}
      showClose
      className={styles.applicantDetailModal}
      titleClassName={styles.applicantDetailTitle}
    >
      <dl className={styles.applicantRow__detailGrid}>
        <dt>{getMsg('ApplicantDataPage.xIdLabel')}</dt>
        <dd>{user.x_id || getMsg('ApplicantDataPage.xIdMissing')}</dd>

        {user.vrc_url && (
          <>
            <dt>{getMsg('ApplicantDataPage.vrcUrlLabel')}</dt>
            <dd><a href={user.vrc_url} target="_blank" rel="noreferrer">{user.vrc_url}</a></dd>
          </>
        )}

        {isFlatPreference ? (
          /* 希望キャストを一覧形式で表示 */
          <>
            <dt>{getMsg('ApplicantDataPage.preferredCasts')}</dt>
            <dd>{formatCastList(user.casts)}</dd>
          </>
        ) : (
          /* 希望キャストを順位別に表示 */
          user.casts.map((cast, i) =>
            cast ? (
              <React.Fragment key={i}>
                <dt>{getMsg('ApplicantDataPage.preferenceRank', { rank: i + 1 })}</dt>
                <dd>{cast}</dd>
              </React.Fragment>
            ) : null,
          )
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
    </AppDialog>
  );
};

interface RowProps {
  user: UserBean;
  isCaution: boolean;
  hasIdentityIssue: boolean;
  ngCastNames: string[];
  isFlatList: boolean;
  flatCastColumnIndexes: number[];
  flatCastGridStyle: React.CSSProperties;
  onSelect: (user: UserBean) => void;
  onRemove: (user: UserBean) => void;
}

const ApplicantRow = React.memo<RowProps>(({ user, isCaution, hasIdentityIssue, ngCastNames, isFlatList, flatCastColumnIndexes, flatCastGridStyle, onSelect, onRemove }) => {
  // 行の警告表示と行内操作を、この応募者へ束縛する。
  const hasAttention = isCaution || hasIdentityIssue || ngCastNames.length > 0;
  const rowClassName = `${styles.applicantRow}${
    hasAttention ? ` ${styles.applicantRowAttention}` : ''
  }`;
  const applicantLabel = user.name || user.x_id || getMsg('common.unnamed');
  const handleSelect = () => onSelect(user);
  const handleDelete = () => onRemove(user);

  return (
    <tr className={rowClassName}>
      <td className={styles.applicantListNameCell}><button type="button" className={styles.applicantDetailButton} aria-label={getMsg('ApplicantDataPage.openDetailsAriaLabel', { label: applicantLabel })} onClick={handleSelect}>{user.name || getMsg('common.unnamed')}</button></td>
      <td className={styles.applicantListIdCell}>
        {user.x_id || getMsg('ApplicantDataPage.xIdMissing')}
        {hasIdentityIssue && (
          <span className={styles.applicantIdentityIssueBadge}>{getMsg('ApplicantDataPage.needsAction')}</span>
        )}
      </td>
      {isFlatList ? (
        /* 希望キャストを一覧形式の1列で表示 */
        <td className={styles.applicantListFlatCastCell}>
          <div className={styles.applicantListCastGrid} style={flatCastGridStyle}>
            {flatCastColumnIndexes.map((index) => {
              const cast = user.casts[index] ?? '';
              const castClassName = `${styles.applicantListCastGridItem}${
                cast ? '' : ` ${styles.applicantListCastGridItemEmpty}`
              }`;
              return (
                <span key={index} className={castClassName}>{cast}</span>
              );
            })}
          </div>
        </td>
      ) : (
        /* 希望キャストを順位別の3列で表示 */
        <>
          <td className={styles.applicantListCastCell}>{user.casts[0] || getMsg('common.emptyMarker')}</td>
          <td className={styles.applicantListCastCell}>{user.casts[1] || getMsg('common.emptyMarker')}</td>
          <td className={styles.applicantListCastCell}>{user.casts[2] || getMsg('common.emptyMarker')}</td>
        </>
      )}
      <td className={styles.applicantListNgCell}><NgCastCell ngCastNames={ngCastNames} /></td>
      <td><button type="button" className={styles.applicantDeleteButton} onClick={handleDelete} aria-label={getMsg('ApplicantDataPage.deleteApplicantAriaLabel', { label: applicantLabel })}>×</button></td>
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

export const ApplicantDataPage: React.FC<ApplicantDataPageProps> = ({ onImportUsers }) => {
  // 応募者一覧の表示・削除と、後続工程の失効処理に必要な共有状態を取得する。
  const {
    applicants,
    casts,
    matchingSettings,
  } = useAppContext();

  // 一覧の絞り込み、選択対象、各ダイアログの表示状態を保持する。
  const [filterMode, setFilterMode] = useState<ApplicantFilterMode>('all');
  const [selectedUser, setSelectedUser] = useState<UserBean | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);

  const {
    alertMessage,
    removeTarget,
    showClearConfirm,
    handleRemoveClick,
    handleOpenClearConfirm,
    handleConfirmRemove,
    handleConfirmClearAll,
    handleDismissAlert,
    handleCancelRemove,
    handleCancelClearAll,
  } = useApplicantMutations({ selectedUser, setSelectedUser, setShowImportForm });

  // 応募者一覧の警告・絞り込み・希望列構造を純粋モデルから取得する。
  const {
    rowDataMap,
    cautionCount,
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

  // 行コンポーネントへ渡す選択操作の参照を安定させる。
  const handleSelect = useCallback((user: UserBean) => setSelectedUser(user), []);

  if (applicants.length === 0) {
    return (
      <div className={shared.pageWrapper}>
        <div className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
          <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('ApplicantDataPage.pageTitle')}</h1>
          <p className={shared.pageHeaderSubtitle}>{getMsg('ApplicantDataPage.emptyDescription')}</p>
        </div>
        <section className={shared.sectionBlock} aria-label={getMsg('ApplicantDataPage.importSectionAriaLabel')}><ImportPage onImportUsers={onImportUsers} /></section>
      </div>
    );
  }

  const selectedRowData = selectedUser
    ? (rowDataMap.get(selectedUser) ?? EMPTY_APPLICANT_ROW_DATA)
    : null;

  // 現在の表示状態に応じたclassとUI操作をまとめる。
  const pageClassName = `${shared.pageWrapper} ${shared.pageWrapperFlex}${
    showImportForm ? '' : ` ${styles.applicantListPageStatic}`
  }`;
  const getFilterTabClassName = (mode: ApplicantFilterMode) => (
    `${styles.applicantFilterTab}${
      filterMode === mode ? ` ${styles.applicantFilterTabActive}` : ''
    }`
  );
  const handleShowCautionFilter = () => setFilterMode('caution');
  const handleShowAllFilter = () => setFilterMode('all');
  const handleToggleImportForm = () => setShowImportForm((open) => !open);
  const handleCloseDetail = () => setSelectedUser(null);
  const importFormButtonLabel = showImportForm ? getMsg('ApplicantDataPage.closeImport') : getMsg('ApplicantDataPage.reimport');

  // 選択中の応募者だけ、詳細ダイアログ用の追加項目を展開する。
  const selectedExtraMap = selectedUser ? getExtraMap(selectedUser.raw_extra) : null;

  return (
    <div className={pageClassName}>
      <div className={styles.applicantListHeader}>
        <div className={styles.applicantListHeader__stats}>
          <span className={styles.applicantListHeader__count}>{getMsg('ApplicantDataPage.applicantCount', { count: applicants.length })}</span>
          {cautionCount > 0 && (
            <button type="button" className={styles.applicantCautionBadge} aria-pressed={filterMode === 'caution'} onClick={handleShowCautionFilter}>{getMsg('ApplicantDataPage.cautionCount', { count: cautionCount })}</button>
          )}
        </div>

        <div className={styles.applicantFilterTabs} role="group" aria-label={getMsg('ApplicantDataPage.filterAriaLabel')}>
          <button type="button" className={getFilterTabClassName('all')} aria-pressed={filterMode === 'all'} onClick={handleShowAllFilter}>{getMsg('ApplicantDataPage.allFilter', { count: applicants.length })}</button>
          {cautionCount > 0 && (
            <button type="button" className={getFilterTabClassName('caution')} aria-pressed={filterMode === 'caution'} onClick={handleShowCautionFilter}>{getMsg('ApplicantDataPage.cautionFilter', { count: cautionCount })}</button>
          )}
        </div>

        <div className={styles.applicantListHeader__actions}>
          <button type="button" className={`${shared.btnSecondary} ${styles.applicantListHeader__actionButton}`} aria-expanded={showImportForm} aria-controls="applicant-reimport-form" onClick={handleToggleImportForm}>{importFormButtonLabel}</button>
          <button type="button" className={`${shared.btnDanger} ${styles.applicantListHeader__actionButton}`} onClick={handleOpenClearConfirm}>{getMsg('ApplicantDataPage.deleteAllButton')}</button>
        </div>
      </div>

      {showImportForm && (
        <section id="applicant-reimport-form" className={`${shared.sectionBlock} ${styles.applicantReimportSection}`} aria-label={getMsg('ApplicantDataPage.reimportSectionAriaLabel')}>
          <ImportPage onImportUsers={onImportUsers} />
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
                  isFlatList={isFlatList}
                  flatCastColumnIndexes={flatCastColumnIndexes}
                  flatCastGridStyle={flatCastGridStyle}
                  onSelect={handleSelect}
                  onRemove={handleRemoveClick}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedUser && selectedRowData && selectedExtraMap && (
        <ApplicantDetailModal
          user={selectedUser}
          isCaution={selectedRowData.isCaution}
          ngCastNames={selectedRowData.ngCastNames}
          extraMap={selectedExtraMap}
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
      {removeTarget !== null && (
        <ConfirmDialog
          title={getMsg('ApplicantDataPage.deleteDialogTitle')}
          message={getMsg('ApplicantDataPage.deleteDialogMessage', {
            label: removeTarget.name || removeTarget.x_id,
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
