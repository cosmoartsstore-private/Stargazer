import React, { useCallback, useMemo, useState } from 'react';
import { AppDialog } from '@/components/AppDialog';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ImportPage } from '@/features/import/ImportPage';
import {
  computeAutoCautionUsers,
  getCautionNGCastNames,
  isCautionUser,
} from '@/features/matching/logics/caution-user';
import { FIXED_NG_JUDGMENT_TYPE } from '@/features/matching/types/matching-system-types';
import { useAppContext } from '@/stores/AppContext';
import type { PageType } from '@/stores/AppContext';
import { persistApplicants } from '@/db';
import type { UserBean } from '@/common/types/entities';
import styles from './ApplicantDataPage.module.css';
import shared from '@/styles/shared.module.css';

type FilterMode = 'all' | 'caution';

interface ApplicantDataPageProps {
  onImportUserRows: (
    rows: string[][],
    mapping: import('@/common/importFormat').ColumnMapping,
    options?: import('@/common/sheetParsers').MapRowOptions,
    nextPage?: PageType
  ) => void;
}

function getExtraMap(rawExtra: unknown[]): Map<string, string> {
  return new Map(
    rawExtra.flatMap((entry) => {
      if (typeof entry === 'object' && entry !== null && 'key' in entry && 'value' in entry) {
        return [[
          String((entry as { key: string }).key),
          String((entry as { value: string }).value),
        ] as const];
      }
      return [];
    }),
  );
}

// ── 詳細モーダル ────────────────────────────────────────────────────────────────

interface DetailModalProps {
  user: UserBean;
  isCaution: boolean;
  ngCastNames: string[];
  extraMap: Map<string, string>;
  onClose: () => void;
}

const ApplicantDetailModal: React.FC<DetailModalProps> = ({ user, isCaution, ngCastNames, extraMap, onClose }) => {
  const hasNgCasts = ngCastNames.length > 0;
  const title = (
    <>
      {user.name || '名前なし'}
      {(hasNgCasts || isCaution) && (
        <span className={`${styles.cautionReason} ${styles.applicantDetailTitleBadge}`}>
          {hasNgCasts ? 'NGキャストあり' : '要注意人物'}
        </span>
      )}
    </>
  );

  return (
    <AppDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={title}
      showClose
      titleClassName={styles.applicantDetailTitle}
      contentStyle={{ maxWidth: 480, width: '90vw' }}
    >
      <dl className={styles.applicantRow__detailGrid}>
        <dt>X ID</dt>
        <dd>{user.x_id || '未設定'}</dd>

        {user.vrc_url && (
          <>
            <dt>VRC URL</dt>
            <dd><a href={user.vrc_url} target="_blank" rel="noreferrer">{user.vrc_url}</a></dd>
          </>
        )}

        {user.casts.map((cast, i) =>
          cast ? (
            <React.Fragment key={i}>
              <dt>希望 {i + 1}</dt>
              <dd>{cast}</dd>
            </React.Fragment>
          ) : null,
        )}

        {[...extraMap.entries()].map(([key, value]) => (
          <React.Fragment key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </React.Fragment>
        ))}

        {hasNgCasts && (
          <>
            <dt>NGキャスト</dt>
            <dd className={styles.cautionReason}>{ngCastNames.join('、')} がNGにしています</dd>
          </>
        )}
      </dl>
    </AppDialog>
  );
};

// ── 行コンポーネント ────────────────────────────────────────────────────────────

interface RowProps {
  user: UserBean;
  isCaution: boolean;
  ngCastNames: string[];
  onSelect: (user: UserBean) => void;
  onRemove: (xId: string) => void;
}

const ApplicantRow = React.memo<RowProps>(({ user, isCaution, ngCastNames, onSelect, onRemove }) => (
  <tr
    className={`${styles.applicantRow}${isCaution || ngCastNames.length > 0 ? ` ${styles.applicantRowCaution}` : ''}`}
    onClick={() => onSelect(user)}
    style={{ cursor: 'pointer' }}
  >
    <td>{user.name || '未設定'}</td>
    <td>{user.x_id || '未設定'}</td>
    <td>{user.casts[0] || '—'}</td>
    <td>{user.casts[1] || '—'}</td>
    <td>{user.casts[2] || '—'}</td>
    <td>
      <NgCastCell ngCastNames={ngCastNames} />
    </td>
    <td>
      <button
        type="button"
        className={styles.applicantDeleteButton}
        onClick={(e) => { e.stopPropagation(); onRemove(user.x_id); }}
        aria-label="応募データを削除"
        title="削除"
      >
        ×
      </button>
    </td>
  </tr>
));

interface NgCastCellProps {
  ngCastNames: string[];
}

const NgCastCell: React.FC<NgCastCellProps> = ({ ngCastNames }) => {
  if (ngCastNames.length === 0) {
    return <span className={styles.ngCastNone}>—</span>;
  }
  if (ngCastNames.length === 1) {
    return <span className={styles.ngCastSingle}>{ngCastNames[0]}</span>;
  }
  return <span className={styles.ngCastSummary}>{ngCastNames.length}名のキャストがNG</span>;
};

// ── ページ本体 ─────────────────────────────────────────────────────────────────

export const ApplicantDataPage: React.FC<ApplicantDataPageProps> = ({ onImportUserRows }) => {
  const { applicants: applyUsers, casts, setApplicants, matchingSettings, currentSessionTimestamp } = useAppContext();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedUser, setSelectedUser] = useState<UserBean | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);

  const cautionUsers = useMemo(() => {
    const auto = computeAutoCautionUsers(
      casts, applyUsers,
      FIXED_NG_JUDGMENT_TYPE,
      matchingSettings.caution.autoRegisterThreshold,
    );
    const manual = matchingSettings.caution.cautionUsers.filter((u) => u.registrationType === 'manual');
    return [...manual, ...auto.filter((u) => !manual.some((m) => m.accountId === u.accountId))];
  }, [applyUsers, casts, matchingSettings]);

  const cautionCount = useMemo(
    () => applyUsers.filter((u) => isCautionUser(u, cautionUsers)).length,
    [applyUsers, cautionUsers],
  );

  const filteredUsers = useMemo(
    () => filterMode === 'caution'
      ? applyUsers.filter((u) => isCautionUser(u, cautionUsers))
      : applyUsers,
    [applyUsers, cautionUsers, filterMode],
  );

  const rowDataMap = useMemo(() => {
    const map = new Map<string, { isCaution: boolean; ngCastNames: string[]; extraMap: Map<string, string> }>();
    for (const user of filteredUsers) {
      const caution = isCautionUser(user, cautionUsers);
      const ngCastNames = getCautionNGCastNames(user, casts, FIXED_NG_JUDGMENT_TYPE);
      map.set(user.x_id, {
        isCaution: caution,
        ngCastNames,
        extraMap: getExtraMap(user.raw_extra),
      });
    }
    return map;
  }, [filteredUsers, cautionUsers, casts]);

  const handleSelect = useCallback((user: UserBean) => setSelectedUser(user), []);
  const handleRemoveClick = useCallback((xId: string) => setRemoveTarget(xId), []);

  const handleRemove = () => {
    if (!removeTarget) return;
    const next = applyUsers.filter((u) => u.x_id !== removeTarget);
    setApplicants(next);
    if (currentSessionTimestamp !== null) {
      persistApplicants(next).catch((e) =>
        console.error('応募データのDB保存に失敗しました:', e),
      );
    }
    setRemoveTarget(null);
  };

  const handleClearAll = () => {
    setApplicants([]);
    if (currentSessionTimestamp !== null) {
      persistApplicants([]).catch((e) =>
        console.error('応募データのDB削除に失敗しました:', e),
      );
    }
    setShowClearConfirm(false);
    setSelectedUser(null);
    setShowImportForm(true);
  };

  if (applyUsers.length === 0) {
    return (
      <div className={shared.pageWrapper}>
        <div className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
          <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>データ取込</h1>
          <p className={shared.pageHeaderSubtitle}>
            応募者TSVを取り込むと、ここに一覧が表示されます。
          </p>
        </div>
        <section className={shared.sectionBlock} aria-label="応募者TSV取り込み">
          <ImportPage onImportUserRows={onImportUserRows} />
        </section>
      </div>
    );
  }

  const selectedRowData = selectedUser
    ? (rowDataMap.get(selectedUser.x_id) ?? { isCaution: false, ngCastNames: [], extraMap: new Map() })
    : null;

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperFlex}${showImportForm ? '' : ` ${styles.applicantListPageStatic}`}`}>
      <div className={styles.applicantListHeader}>
        <div className={styles.applicantListHeader__stats}>
          <span className={styles.applicantListHeader__count}>{applyUsers.length} 件</span>
          {cautionCount > 0 && (
            <button type="button" className={styles.applicantCautionBadge} onClick={() => setFilterMode('caution')}>
              ⚠ 要注意 {cautionCount} 件
            </button>
          )}
        </div>

        <div className={styles.applicantFilterTabs}>
          <button
            type="button"
            className={`${styles.applicantFilterTab}${filterMode === 'all' ? ` ${styles.applicantFilterTabActive}` : ''}`}
            onClick={() => setFilterMode('all')}
          >
            全件 ({applyUsers.length})
          </button>
          {cautionCount > 0 && (
            <button
              type="button"
              className={`${styles.applicantFilterTab}${filterMode === 'caution' ? ` ${styles.applicantFilterTabActive}` : ''}`}
              onClick={() => setFilterMode('caution')}
            >
              要注意 ({cautionCount})
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={shared.btnSecondary}
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => setShowImportForm((open) => !open)}
          >
            {showImportForm ? '取り込みを閉じる' : 'TSV再取り込み'}
          </button>
          <button
            type="button"
            className={shared.btnDanger}
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => setShowClearConfirm(true)}
          >
            元ログ削除
          </button>
        </div>
      </div>

      {showImportForm && (
        <section className={shared.sectionBlock} style={{ marginBottom: 16 }} aria-label="応募者TSV再取り込み">
          <ImportPage onImportUserRows={onImportUserRows} />
        </section>
      )}

      <div className={`${shared.tableContainer} ${shared.customScrollbar} ${styles.applicantListTableContainer}`}>
        <table>
          <thead>
            <tr>
              <th>ユーザー名</th>
              <th>X ID</th>
              <th>希望 1</th>
              <th>希望 2</th>
              <th>希望 3</th>
              <th>NGキャスト</th>
              <th aria-label="操作"></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>該当するデータがありません</td>
              </tr>
            )}
            {filteredUsers.map((user) => {
              const rd = rowDataMap.get(user.x_id) ?? { isCaution: false, ngCastNames: [] };
              return (
                <ApplicantRow
                  key={user.x_id}
                  user={user}
                  isCaution={rd.isCaution}
                  ngCastNames={rd.ngCastNames}
                  onSelect={handleSelect}
                  onRemove={handleRemoveClick}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedUser && selectedRowData && (
        <ApplicantDetailModal
          user={selectedUser}
          isCaution={selectedRowData.isCaution}
          ngCastNames={selectedRowData.ngCastNames}
          extraMap={selectedRowData.extraMap}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {removeTarget && (
        <ConfirmModal
          type="confirm"
          title="応募データの削除"
          message="この応募データを削除します。よろしいですか。"
          confirmLabel="削除"
          cancelLabel="キャンセル"
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
      {showClearConfirm && (
        <ConfirmModal
          type="confirm"
          title="元ログ削除"
          message={`応募データ ${applyUsers.length} 件をすべて削除します。\nこの操作は取り消せません。`}
          confirmLabel="すべて削除"
          cancelLabel="キャンセル"
          onConfirm={handleClearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
};
