import React, { useCallback, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  computeAutoCautionUsers,
  getCautionNGCastNames,
  isCautionUser,
} from '@/features/matching/logics/caution-user';
import { useAppContext } from '@/stores/AppContext';
import { persistApplicants } from '@/db';
import type { UserBean } from '@/common/types/entities';
import styles from './ApplicantDataPage.module.css';
import shared from '@/styles/shared.module.css';

type FilterMode = 'all' | 'caution';

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
  const modalContainer =
    typeof document !== 'undefined' ? (document.getElementById('modal-root') ?? document.body) : undefined;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal container={modalContainer}>
        <Dialog.Overlay className={shared.modalOverlay} onClick={onClose} />
        <Dialog.Content
          className={shared.modalContent}
          style={{ maxWidth: 480, width: '90vw' }}
          aria-describedby={undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Dialog.Title className={shared.modalTitle} style={{ margin: 0 }}>
              {user.name || '名前なし'}
              {isCaution && <span className={styles.cautionReason} style={{ marginLeft: 8, fontSize: 12 }}>⚠ 要注意</span>}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--discord-text-muted)', fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                aria-label="閉じる"
              >
                ×
              </button>
            </Dialog.Close>
          </div>

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

            {isCaution && (
              <>
                <dt>要注意理由</dt>
                <dd className={styles.cautionReason}>{ngCastNames.join('、')} のNG対象です</dd>
              </>
            )}
          </dl>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
    className={`${styles.applicantRow}${isCaution ? ` ${styles.applicantRowCaution}` : ''}`}
    onClick={() => onSelect(user)}
    style={{ cursor: 'pointer' }}
  >
    <td>{user.name || '未設定'}</td>
    <td>{user.x_id || '未設定'}</td>
    <td>{user.casts[0] || '—'}</td>
    <td>{user.casts[1] || '—'}</td>
    <td>{user.casts[2] || '—'}</td>
    <td>
      {isCaution ? (
        <span className={styles.cautionReason}>⚠ {ngCastNames.join('・')} のNG</span>
      ) : '通常'}
    </td>
    <td>
      <button
        type="button"
        className={shared.btnSecondary}
        style={{ fontSize: 12, padding: '4px 10px' }}
        onClick={(e) => { e.stopPropagation(); onRemove(user.x_id); }}
      >
        削除
      </button>
    </td>
  </tr>
));

// ── ページ本体 ─────────────────────────────────────────────────────────────────

export const ApplicantDataPage: React.FC = () => {
  // CSV/TSV import has been removed from this page. Imports now exclusively
  // create a new session DB through SessionPickerPage so that every applicant
  // set lives in its own session and we never overwrite history.
  const { applicants: applyUsers, casts, setApplicants, matchingSettings, currentSessionTimestamp, setActivePage } = useAppContext();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedUser, setSelectedUser] = useState<UserBean | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const cautionUsers = useMemo(() => {
    const auto = computeAutoCautionUsers(
      casts, applyUsers,
      matchingSettings.ngJudgmentType,
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
      map.set(user.x_id, {
        isCaution: caution,
        ngCastNames: caution ? getCautionNGCastNames(user, casts, matchingSettings.ngJudgmentType) : [],
        extraMap: getExtraMap(user.raw_extra),
      });
    }
    return map;
  }, [filteredUsers, cautionUsers, casts, matchingSettings.ngJudgmentType]);

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
  };

  if (applyUsers.length === 0) {
    return (
      <div className={shared.pageWrapper}>
        <div className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
          <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>応募データ</h1>
          <p className={shared.pageHeaderSubtitle}>
            このセッションにはまだ応募者が登録されていません。
          </p>
        </div>
        <section className={shared.sectionBlock}>
          <p style={{ fontSize: 13, color: 'var(--discord-text-muted)', marginBottom: 12 }}>
            応募 CSV/TSV はセッション選択画面から取り込みます。
          </p>
          <button
            type="button"
            className={shared.btnPrimary}
            onClick={() => setActivePage('sessionPicker')}
          >
            新しいセッションを作る
          </button>
        </section>
      </div>
    );
  }

  const selectedRowData = selectedUser
    ? (rowDataMap.get(selectedUser.x_id) ?? { isCaution: false, ngCastNames: [], extraMap: new Map() })
    : null;

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperFlex}`}>
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
            onClick={() => setActivePage('sessionPicker')}
          >
            新しいセッションを作る
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

      <div className={`${shared.tableContainer} ${shared.customScrollbar}`} style={{ maxHeight: 'calc(100vh - 180px)' }}>
        <table>
          <thead>
            <tr>
              <th>ユーザー名</th>
              <th>X ID</th>
              <th>希望 1</th>
              <th>希望 2</th>
              <th>希望 3</th>
              <th>状態</th>
              <th>操作</th>
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
