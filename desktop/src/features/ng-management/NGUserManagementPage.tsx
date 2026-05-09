import React, { useMemo, useState } from 'react';
import { Search } from '@/common/icons';
import type { NGUserEntry } from '@/common/types/entities';
import { ConfirmModal } from '@/components/ConfirmModal';
import { parseXUsername } from '@/common/xIdUtils';
import { useAppContext } from '@/stores/AppContext';
import { upsertCautionUser, deleteCautionUserByAccountId, updateCastFields } from '@/db';
import styles from './NGUserManagementPage.module.css';
import shared from '@/styles/shared.module.css';

type NgTab = 'cast-ng' | 'caution';

function normalizeAccountId(raw: string): string | null {
  const parsed = parseXUsername(raw.trim());
  if (!parsed) return null;
  return parsed.startsWith('@') ? parsed : `@${parsed}`;
}

interface NgCandidate {
  accountId: string;
  usernames: string[];   // 同一IDで使われた全ユーザー名
  castCount: number;
  castNames: string[];
}

export const NGUserManagementPage: React.FC = () => {
  const { casts, setCasts, matchingSettings, setMatchingSettings } = useAppContext();

  const [ngTab, setNgTab]                   = useState<NgTab>('cast-ng');
  const [selectedCastName, setSelectedCastName] = useState(casts[0]?.name ?? '');
  const [castSearch, setCastSearch]         = useState('');
  const [ngName, setNgName]                 = useState('');
  const [ngAccountId, setNgAccountId]       = useState('');
  const [cautionName, setCautionName]       = useState('');
  const [cautionAccountId, setCautionAccountId] = useState('');
  const [alertMessage, setAlertMessage]     = useState<string | null>(null);
  const [pendingDeleteNg, setPendingDeleteNg] = useState<{ castName: string; entry: NGUserEntry } | null>(null);
  const [pendingDeleteCaution, setPendingDeleteCaution] = useState<string | null>(null);

  const cautionUsers = matchingSettings.caution.cautionUsers;
  const threshold    = matchingSettings.caution.autoRegisterThreshold;

  const handleThresholdChange = (val: number) => {
    if (val < 1) return;
    setMatchingSettings((prev) => ({
      ...prev,
      caution: { ...prev.caution, autoRegisterThreshold: val },
    }));
  };

  // 候補計算：全キャストのNG entries を accountId でまとめる
  const candidates: NgCandidate[] = useMemo(() => {
    const cautionIds = new Set(cautionUsers.map((u) => u.accountId));
    const byId = new Map<string, { usernames: Set<string>; castNames: Set<string> }>();

    for (const cast of casts) {
      for (const entry of cast.ng_entries ?? []) {
        if (!entry.accountId) continue;
        if (cautionIds.has(entry.accountId)) continue;

        if (!byId.has(entry.accountId)) {
          byId.set(entry.accountId, { usernames: new Set(), castNames: new Set() });
        }
        const data = byId.get(entry.accountId)!;
        if (entry.username) data.usernames.add(entry.username);
        data.castNames.add(cast.name);
      }
    }

    return Array.from(byId.entries())
      .filter(([, d]) => d.castNames.size >= threshold)
      .map(([accountId, d]) => ({
        accountId,
        usernames: Array.from(d.usernames),
        castCount: d.castNames.size,
        castNames: Array.from(d.castNames),
      }))
      .sort((a, b) => b.castCount - a.castCount);
  }, [casts, cautionUsers, threshold]);

  const castNgRows = useMemo(
    () => casts.map((cast) => ({ castName: cast.name, entries: cast.ng_entries ?? [] })),
    [casts],
  );

  const filteredRows = castSearch.trim()
    ? castNgRows.filter((r) => r.castName.toLowerCase().includes(castSearch.toLowerCase()))
    : castNgRows;

  const selectedCast  = casts.find((c) => c.name === selectedCastName) ?? null;
  const selectedNgRow = castNgRows.find((r) => r.castName === selectedCastName) ?? null;

  // ── Cast NG handlers ──

  const handleAddNg = async () => {
    if (!selectedCast) { setAlertMessage('キャストを選択してください。'); return; }
    const accountId = normalizeAccountId(ngAccountId);
    if (!accountId) { setAlertMessage('有効な X ID を入力してください。'); return; }

    const nextEntry: NGUserEntry = { username: ngName.trim() || undefined, accountId };
    if ((selectedCast.ng_entries ?? []).some((e) => e.username === nextEntry.username && e.accountId === nextEntry.accountId)) {
      setAlertMessage('この NG ユーザーは既に登録されています。');
      return;
    }
    const newEntries = [...(selectedCast.ng_entries ?? []), nextEntry];
    setCasts((prev) => prev.map((c) => c.name === selectedCast.name ? { ...c, ng_entries: newEntries } : c));
    await updateCastFields(selectedCast.name, { ng_entries: newEntries });
    setNgName('');
    setNgAccountId('');
  };

  const handleDeleteNg = async () => {
    if (!pendingDeleteNg) return;
    const target = casts.find((c) => c.name === pendingDeleteNg.castName);
    const nextEntries = (target?.ng_entries ?? []).filter(
      (e) => e.username !== pendingDeleteNg.entry.username || e.accountId !== pendingDeleteNg.entry.accountId,
    );
    setCasts((prev) => prev.map((c) => {
      if (c.name !== pendingDeleteNg.castName) return c;
      return { ...c, ng_entries: nextEntries.length > 0 ? nextEntries : undefined };
    }));
    await updateCastFields(pendingDeleteNg.castName, { ng_entries: nextEntries.length > 0 ? nextEntries : undefined });
    setPendingDeleteNg(null);
  };

  // ── Caution handlers ──

  const handleAddCaution = async () => {
    const accountId = normalizeAccountId(cautionAccountId);
    if (!accountId) { setAlertMessage('有効な X ID を入力してください。'); return; }
    if (cautionUsers.some((u) => u.accountId === accountId)) {
      setAlertMessage('このアカウントは既に要注意人物に登録されています。');
      return;
    }
    const newEntry = {
      username: cautionName.trim() || accountId,
      accountId,
      registrationType: 'manual' as const,
      registeredAt: new Date().toISOString(),
    };
    await upsertCautionUser(newEntry).catch((e) => console.error('要注意ユーザーのDB保存に失敗:', e));
    setMatchingSettings((prev) => ({
      ...prev,
      caution: { ...prev.caution, cautionUsers: [...prev.caution.cautionUsers, newEntry] },
    }));
    setCautionName('');
    setCautionAccountId('');
  };

  const handleAddCandidateToCaution = async (candidate: NgCandidate) => {
    if (cautionUsers.some((u) => u.accountId === candidate.accountId)) return;
    const username = candidate.usernames.length > 0
      ? candidate.usernames.join(' / ')
      : candidate.accountId;
    const newEntry = {
      username,
      accountId: candidate.accountId,
      registrationType: 'auto' as const,
      ngCastCount: candidate.castCount,
      registeredAt: new Date().toISOString(),
    };
    await upsertCautionUser(newEntry).catch((e) => console.error('要注意ユーザーのDB保存に失敗:', e));
    setMatchingSettings((prev) => ({
      ...prev,
      caution: { ...prev.caution, cautionUsers: [...prev.caution.cautionUsers, newEntry] },
    }));
  };

  const handleDeleteCaution = async () => {
    if (!pendingDeleteCaution) return;
    await deleteCautionUserByAccountId(pendingDeleteCaution).catch((e) => console.error('要注意ユーザーのDB削除に失敗:', e));
    setMatchingSettings((prev) => ({
      ...prev,
      caution: { ...prev.caution, cautionUsers: prev.caution.cautionUsers.filter((u) => u.accountId !== pendingDeleteCaution) },
    }));
    setPendingDeleteCaution(null);
  };

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner} ${styles.ngPage}`}>
      <div className={shared.pageTabs}>
        <button
          type="button"
          className={`${shared.pageTab}${ngTab === 'cast-ng' ? ` ${shared.pageTabActive}` : ''}`}
          onClick={() => setNgTab('cast-ng')}
        >
          キャストNG
        </button>
        <button
          type="button"
          className={`${shared.pageTab}${ngTab === 'caution' ? ` ${shared.pageTabActive}` : ''}`}
          onClick={() => setNgTab('caution')}
        >
          要注意人物
        </button>
      </div>

      <div className={shared.pageTabContent}>

        {/* ── キャストNG タブ ── */}
        {ngTab === 'cast-ng' && (
          <div className={shared.castDetailLayout}>
            <div className={shared.castListPanel}>
              <div className={shared.castListPanel__search}>
                <Search size={14} className={shared.castListPanel__searchIcon} />
                <input
                  className={shared.castListPanel__searchInput}
                  placeholder="検索..."
                  value={castSearch}
                  onChange={(e) => setCastSearch(e.target.value)}
                />
              </div>
              <div className={`${shared.castListPanel__items} ${shared.customScrollbar}`}>
                {filteredRows.length === 0 ? (
                  <div className={shared.castListPanel__empty}>キャストなし</div>
                ) : (
                  filteredRows.map((row) => (
                    <button
                      key={row.castName}
                      type="button"
                      className={`${shared.castListItem}${selectedCastName === row.castName ? ` ${shared.castListItemSelected}` : ''}`}
                      onClick={() => setSelectedCastName(row.castName)}
                    >
                      <div className={shared.castListItem__info}>
                        <div className={shared.castListItem__name}>{row.castName}</div>
                      </div>
                      {row.entries.length > 0 && (
                        <span className={styles.ngCastList__count}>{row.entries.length}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {selectedNgRow ? (
              <div className={`${shared.castCharPanel} ${shared.customScrollbar}`}>
                <div className={styles.ngDetailHeader}>
                  <span className={shared.castDetailLabel}>{selectedNgRow.castName} の NG ユーザー</span>
                </div>
                <div className={styles.ngPage__addRow} style={{ marginBottom: 16 }}>
                  <input
                    className={`${shared.formInput} ${styles.ngPage__addInputName}`}
                    placeholder="ユーザー名"
                    value={ngName}
                    onChange={(e) => setNgName(e.target.value)}
                  />
                  <input
                    className={`${shared.formInput} ${styles.ngPage__addInputId}`}
                    placeholder="X ID"
                    value={ngAccountId}
                    onChange={(e) => setNgAccountId(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAddNg(); }}
                  />
                  <button type="button" className={`${shared.btnPrimary} ${shared.btnFixedH}`} onClick={() => { void handleAddNg(); }}>
                    追加
                  </button>
                </div>
                <div className={shared.castCharDivider} />
                {selectedNgRow.entries.length === 0 ? (
                  <div className={styles.ngDetailEmpty}>登録なし</div>
                ) : (
                  <div className={styles.ngDetailList}>
                    {selectedNgRow.entries.map((entry) => (
                      <div
                        key={`${selectedNgRow.castName}-${entry.username}-${entry.accountId}`}
                        className={styles.ngDetailItem}
                      >
                        <div className={styles.ngCastGrid__text}>
                          <span className={styles.ngCastGrid__textName}>{entry.username ?? '名前なし'}</span>
                          <span className={styles.ngCastGrid__textId}>{entry.accountId ?? 'IDなし'}</span>
                        </div>
                        <button
                          type="button"
                          className={styles.ngCastGrid__remove}
                          title="削除"
                          onClick={() => setPendingDeleteNg({ castName: selectedNgRow.castName, entry })}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={shared.castDetailEmpty}>
                <span>左のリストからキャストを選択してください</span>
              </div>
            )}
          </div>
        )}

        {/* ── 要注意人物 タブ ── */}
        {ngTab === 'caution' && (
          <div className={styles.ngPage} style={{ maxWidth: 720 }}>

            {/* 候補セクション */}
            <div className={styles.ngPage__section}>
              <div className={styles.ngPage__sectionHeader}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h2 className={styles.ngPage__sectionTitle}>候補</h2>
                    <p className={styles.ngPage__sectionDesc}>複数のキャストからNGを受けたユーザーを自動的に抽出します。</p>
                  </div>
                  <div className={styles.cautionThresholdCtrl}>
                    <span className={styles.cautionThresholdLabel}>NGキャスト数</span>
                    <input
                      type="number"
                      min={1}
                      className={`${shared.formInput} ${styles.cautionThresholdInput}`}
                      value={threshold}
                      onChange={(e) => handleThresholdChange(Number(e.target.value))}
                    />
                    <span className={styles.cautionThresholdLabel}>人以上で候補表示</span>
                  </div>
                </div>
              </div>

              {candidates.length === 0 ? (
                <div className={styles.ngDetailEmpty}>
                  {`${threshold}人以上のキャストからNGを受けたユーザーはいません。`}
                </div>
              ) : (
                <div className={styles.cautionCandidateList}>
                  {candidates.map((c) => (
                    <div key={c.accountId} className={styles.cautionCandidateCard}>
                      <div className={styles.cautionCandidateId}>{c.accountId}</div>
                      <div className={styles.cautionCandidateNames}>
                        {c.usernames.length > 0
                          ? c.usernames.map((name) => (
                            <span key={name} className={styles.cautionCandidateNameChip}>{name}</span>
                          ))
                          : <span className={styles.cautionCandidateNoname}>名前なし</span>
                        }
                      </div>
                      <div className={styles.cautionCandidateCasts}>
                        <span className={styles.cautionCandidateCountBadge}>{c.castCount}人がNG</span>
                        <span className={styles.cautionCandidateCastNames}>{c.castNames.join('・')}</span>
                      </div>
                      <button
                        type="button"
                        className={`${shared.btnPrimary} ${styles.cautionCandidateAddBtn}`}
                        onClick={() => { void handleAddCandidateToCaution(c); }}
                      >
                        要注意に追加
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 登録済みセクション */}
            <div className={styles.ngPage__section}>
              <div className={styles.ngPage__sectionHeader}>
                <h2 className={styles.ngPage__sectionTitle}>登録済み要注意人物</h2>
                <p className={styles.ngPage__sectionDesc}>手動登録した要注意人物はここで追加・削除します。</p>
              </div>
              <div className={styles.ngPage__addRow} style={{ marginBottom: 16 }}>
                <input
                  className={`${shared.formInput} ${styles.ngPage__addInputName}`}
                  placeholder="ユーザー名"
                  value={cautionName}
                  onChange={(e) => setCautionName(e.target.value)}
                />
                <input
                  className={`${shared.formInput} ${styles.ngPage__addInputId}`}
                  placeholder="X ID"
                  value={cautionAccountId}
                  onChange={(e) => setCautionAccountId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAddCaution(); }}
                />
                <button type="button" className={`${shared.btnPrimary} ${shared.btnFixedH}`} onClick={() => { void handleAddCaution(); }}>
                  追加
                </button>
              </div>

              {cautionUsers.length === 0 ? (
                <div className={styles.ngDetailEmpty}>登録なし</div>
              ) : (
                <div className={styles.ngDetailList}>
                  {cautionUsers.map((user) => (
                    <div key={user.accountId} className={styles.ngDetailItem}>
                      <div className={styles.ngCastGrid__text}>
                        <span className={styles.ngCastGrid__textName}>{user.username}</span>
                        <span className={styles.ngCastGrid__textId}>{user.accountId}</span>
                      </div>
                      {user.registrationType === 'auto' && user.ngCastCount != null && (
                        <span className={`${styles.ngPage__badge} ${styles.ngPage__badgeAuto}`}>{user.ngCastCount}人NG</span>
                      )}
                      {user.registrationType === 'manual' && (
                        <span className={`${styles.ngPage__badge} ${styles.ngPage__badgeManual}`}>手動</span>
                      )}
                      <button
                        type="button"
                        className={styles.ngCastGrid__remove}
                        title="削除"
                        onClick={() => setPendingDeleteCaution(user.accountId)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {alertMessage && (
        <ConfirmModal type="alert" message={alertMessage} confirmLabel="OK" onConfirm={() => setAlertMessage(null)} />
      )}
      {pendingDeleteNg && (
        <ConfirmModal
          type="confirm"
          title="NGユーザーの削除"
          message="この NG 登録を削除します。よろしいですか。"
          confirmLabel="削除"
          cancelLabel="キャンセル"
          onConfirm={() => { void handleDeleteNg(); }}
          onCancel={() => setPendingDeleteNg(null)}
        />
      )}
      {pendingDeleteCaution && (
        <ConfirmModal
          type="confirm"
          title="要注意人物の削除"
          message="この要注意人物を削除します。よろしいですか。"
          confirmLabel="削除"
          cancelLabel="キャンセル"
          onConfirm={() => { void handleDeleteCaution(); }}
          onCancel={() => setPendingDeleteCaution(null)}
        />
      )}
    </div>
  );
};
