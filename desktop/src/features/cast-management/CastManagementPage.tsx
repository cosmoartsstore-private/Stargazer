import React, { useRef, useState } from 'react';
import {
  Camera, ExternalLink, Pencil,
  Plus, Search, Trash2, User, UserPlus,
} from '@/common/icons';
import { ConfirmModal } from '@/components/ConfirmModal';
import type { CastBean } from '@/common/types/entities';
import { useAppContext } from '@/stores/AppContext';
import { insertCast, updateCastFields, renameCast as renameCastDb, deleteCast } from '@/db';
import { invoke, isTauri } from '@/tauri';
import styles from './CastManagementPage.module.css';
import shared from '@/styles/shared.module.css';

const CONTACT_QUICK_INPUTS = [
  { key: 'discord', label: 'Discord', marker: 'Discord', url: 'https://discord.com/channels/@me' },
] as const;

const CONTACT_SITE_LINKS = [
  { key: 'discord', label: 'Discord', marker: 'Discord', url: 'https://discord.com/channels/@me' },
  { key: 'x', label: 'X', marker: 'X', url: 'https://x.com/i/chat' },
  { key: 'vrchat', label: 'VRChat', marker: 'VRC', url: 'https://vrchat.com/home' },
] as const;

type ContactMarkerKind = 'discord' | 'vrchat' | 'x' | 'https' | 'text' | 'empty';

function isHttpsContactUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith('https://');
}

function getXProfileUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith('@')) return null;
  const username = trimmed.replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) return null;
  return `https://x.com/${username}`;
}

function getOpenableContactUrl(url: string): string | null {
  const trimmed = url.trim();
  if (isHttpsContactUrl(trimmed)) return trimmed;
  return getXProfileUrl(trimmed);
}

function getContactMarker(url: string): { label: string; kind: ContactMarkerKind } {
  const trimmed = url.trim();
  const lowerUrl = trimmed.toLowerCase();
  const matched = CONTACT_QUICK_INPUTS.find((item) => lowerUrl.startsWith(item.url.toLowerCase()));
  if (matched) return { label: matched.marker, kind: matched.key };
  if (!trimmed) return { label: 'URL', kind: 'empty' };
  if (lowerUrl.startsWith('https://vrchat.com/')) return { label: 'VRC', kind: 'vrchat' };
  if (lowerUrl.startsWith('https://x.com/') || lowerUrl.startsWith('https://twitter.com/') || getXProfileUrl(trimmed)) return { label: 'X', kind: 'x' };
  if (isHttpsContactUrl(trimmed)) return { label: 'HTTPS', kind: 'https' };
  return { label: 'TEXT', kind: 'text' };
}

export const CastManagementPage: React.FC = () => {
  const { casts, setCasts } = useAppContext();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [memoEditing, setMemoEditing] = useState(false);
  const [inputCastName, setInputCastName] = useState('');
  const [castSearchQuery, setCastSearchQuery] = useState('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedCast = casts.find((c) => c.name === selectedName) ?? null;

  const handleAddCast = async () => {
    const castName = inputCastName.trim();
    if (!castName) return;
    if (casts.some((c) => c.name === castName)) {
      setAlertMessage('そのキャスト名は既に登録されています。');
      return;
    }
    const newCast: CastBean = { name: castName, is_present: false };
    setCasts((prev) => [...prev, newCast]);
    await insertCast(newCast);
    setInputCastName('');
    setSelectedName(castName);
  };

  const handleDeleteCast = (castName: string) => {
    setConfirmMessage({
      message: `${castName} を削除します。よろしいですか。`,
      onConfirm: () => {
        setCasts((prev) => prev.filter((c) => c.name !== castName));
        if (selectedName === castName) setSelectedName(null);
        setConfirmMessage(null);
        void deleteCast(castName);
      },
    });
  };

  const handleRenameCast = async (oldName: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === oldName) return;
    if (casts.some((c) => c.name !== oldName && c.name === trimmed)) {
      setAlertMessage('そのキャスト名は既に使用されています。');
      return;
    }
    setCasts((prev) => prev.map((c) => (c.name === oldName ? { ...c, name: trimmed } : c)));
    setSelectedName(trimmed);
    await renameCastDb(oldName, trimmed);
  };

  const handleFieldChange = async (castName: string, patch: Partial<CastBean>) => {
    setCasts((prev) => prev.map((c) => (c.name === castName ? { ...c, ...patch } : c)));
    await updateCastFields(castName, patch);
  };

  const handlePhotoUpload = (castName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setCasts((prev) => prev.map((c) => (c.name === castName ? { ...c, photo_data_url: dataUrl } : c)));
      await updateCastFields(castName, { photo_data_url: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const getContactUrls = (cast: CastBean) =>
    cast.contact_urls && cast.contact_urls.length > 0 ? cast.contact_urls : [''];

  const handleContactUrlChange = async (castName: string, index: number, value: string) => {
    const cast = casts.find((c) => c.name === castName);
    if (!cast) return;
    const urls = [...getContactUrls(cast)];
    urls[index] = value;
    const normalized = urls.map((u) => u.trim()).filter(Boolean);
    const contact_urls = normalized.length > 0 ? normalized : undefined;
    setCasts((prev) => prev.map((c) => (c.name === castName ? { ...c, contact_urls } : c)));
    await updateCastFields(castName, { contact_urls });
  };

  const handleAddContactUrl = async (castName: string) => {
    const cast = casts.find((c) => c.name === castName);
    if (!cast) return;
    const contact_urls = [...(cast.contact_urls ?? []), ''];
    setCasts((prev) => prev.map((c) => (c.name === castName ? { ...c, contact_urls } : c)));
    await updateCastFields(castName, { contact_urls });
  };

  const handleAddQuickContactUrl = async (castName: string, value: string) => {
    const cast = casts.find((c) => c.name === castName);
    if (!cast) return;
    const contact_urls = [...(cast.contact_urls ?? []), value];
    setCasts((prev) => prev.map((c) => (c.name === castName ? { ...c, contact_urls } : c)));
    await updateCastFields(castName, { contact_urls });
  };

  const handleOpenContactUrl = async (url: string) => {
    const openUrl = getOpenableContactUrl(url);
    if (!openUrl) return;
    if (isTauri()) {
      try {
        await invoke<void>('open_external_url', { url: openUrl });
        return;
      } catch (error) {
        setAlertMessage(`外部サイトを開けませんでした: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    }
    window.open(openUrl, '_blank', 'noopener,noreferrer');
  };

  const getContactMarkerClassName = (kind: ContactMarkerKind) => {
    switch (kind) {
      case 'discord': return `${styles.castContactMarker} ${styles.castContactMarkerDiscord}`;
      case 'vrchat':  return `${styles.castContactMarker} ${styles.castContactMarkerVrchat}`;
      case 'x':       return `${styles.castContactMarker} ${styles.castContactMarkerX}`;
      case 'https':   return `${styles.castContactMarker} ${styles.castContactMarkerHttps}`;
      case 'text':    return `${styles.castContactMarker} ${styles.castContactMarkerText}`;
      default:        return styles.castContactMarker;
    }
  };

  const filteredCasts = castSearchQuery.trim()
    ? casts.filter((c) => c.name.toLowerCase().includes(castSearchQuery.trim().toLowerCase()))
    : casts;

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
      <header className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <div className={`${shared.pageHeaderRow} ${shared.pageHeaderRowFlexStart}`}>
          <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>キャスト名簿</h1>
          <div className={shared.statusCard}>
            <div className={shared.statusCard__label}>登録数</div>
            <div className={shared.statusCard__value}>
              <span className={shared.statusCard__valueAccent}>{casts.length}</span>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.castDetailLayout}>
        {/* ── Left: cast list ── */}
        <div className={styles.castListPanel}>
          <div className={styles.castListPanel__search}>
            <Search size={14} className={styles.castListPanel__searchIcon} />
            <input
              type="text"
              className={styles.castListPanel__searchInput}
              placeholder="検索..."
              value={castSearchQuery}
              onChange={(e) => setCastSearchQuery(e.target.value)}
            />
          </div>

          <div className={`${styles.castListPanel__items} ${shared.customScrollbar}`}>
            {filteredCasts.length === 0 ? (
              <div className={styles.castListPanel__empty}>キャストがいません</div>
            ) : (
              filteredCasts.map((cast) => (
                <button
                  key={cast.name}
                  type="button"
                  className={`${styles.castListItem}${selectedName === cast.name ? ` ${styles.castListItemSelected}` : ''}`}
                  onClick={() => { setSelectedName(cast.name); setMemoEditing(false); }}
                >
                  <div className={styles.castListItem__info}>
                    <div className={styles.castListItem__name}>{cast.name}</div>
                    {cast.group_name && (
                      <div className={styles.castListItem__group}>{cast.group_name}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className={styles.castListPanel__add}>
            <div className={styles.castListPanel__addRow}>
              <input
                type="text"
                className={styles.castListPanel__addInput}
                placeholder="キャストを追加"
                value={inputCastName}
                onChange={(e) => setInputCastName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAddCast(); }}
              />
              <button
                type="button"
                className={`${shared.btnSuccess} ${styles.castListPanel__addBtn}`}
                onClick={() => { void handleAddCast(); }}
                title="追加"
              >
                <UserPlus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: detail panel ── */}
        {selectedCast ? (
          <div key={selectedName} className={`${styles.castCharPanel} ${shared.customScrollbar}`}>
            <div className={styles.castCharProfileLayout}>

              {/* LEFT: 写真 */}
              <div className={styles.castCharPhotoCol}>
                <div
                  className={styles.castCharPhotoFrame}
                  onClick={() => photoInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') photoInputRef.current?.click(); }}
                >
                  {selectedCast.photo_data_url ? (
                    <img src={selectedCast.photo_data_url} alt={selectedCast.name} className={styles.castCharPhotoFrame__img} />
                  ) : (
                    <div className={styles.castCharPhotoFrame__placeholder}>
                      <User size={36} className={styles.castCharPhotoFrame__placeholderIcon} />
                      <span className={styles.castCharPhotoFrame__placeholderText}>写真を追加</span>
                    </div>
                  )}
                  <div className={styles.castCharPhotoFrame__overlay}>
                    <Camera size={16} />
                    <span>変更</span>
                  </div>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handlePhotoUpload(selectedCast.name, e)}
                />
              </div>

              {/* RIGHT: プロフィール情報 */}
              <div className={styles.castCharInfoCol}>

                <input
                  type="text"
                  className={styles.castCharNameInput}
                  defaultValue={selectedCast.name}
                  onBlur={(e) => { void handleRenameCast(selectedCast.name, e.target.value); }}
                />

                <input
                  type="text"
                  className={styles.castCharGroupBadge}
                  defaultValue={selectedCast.group_name ?? ''}
                  placeholder="所属グループを追加..."
                  onBlur={(e) => {
                    void handleFieldChange(selectedCast.name, {
                      group_name: e.target.value.trim() || undefined,
                    });
                  }}
                />

                <div className={styles.castCharDivider} />

                {/* プロフィール */}
                <div className={styles.castCharMemoSection}>
                  <div className={styles.castCharMemoHeader}>
                    <span className={styles.castDetailLabel}>プロフィール</span>
                    {!memoEditing && (
                      <button
                        type="button"
                        className={styles.castCharMemoEditBtn}
                        onClick={() => {
                          setMemoEditing(true);
                          setTimeout(() => memoTextareaRef.current?.focus(), 0);
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                  {memoEditing ? (
                    <textarea
                      ref={memoTextareaRef}
                      className={`${styles.castCharMemo__textarea} ${shared.customScrollbar}`}
                      defaultValue={selectedCast.memo ?? ''}
                      placeholder="自己紹介文・メモを入力..."
                      rows={5}
                      onBlur={(e) => {
                        void handleFieldChange(selectedCast.name, {
                          memo: e.target.value.trim() || undefined,
                        });
                        setMemoEditing(false);
                      }}
                    />
                  ) : (
                    <div
                      className={`${styles.castCharMemo__text}${!selectedCast.memo ? ` ${styles.castCharMemo__textEmpty}` : ''}`}
                      onClick={() => {
                        setMemoEditing(true);
                        setTimeout(() => memoTextareaRef.current?.focus(), 0);
                      }}
                    >
                      {selectedCast.memo ?? 'クリックしてプロフィールを入力...'}
                    </div>
                  )}
                </div>

                <div className={styles.castCharDivider} />

                {/* 連絡先 */}
                <div className={styles.castDetailSection}>
                  <label className={styles.castDetailLabel}>連絡先</label>
                  <div className={styles.castContactQuickPanel}>
                    <div className={styles.castContactQuickHeader}>
                      <span>クイック入力</span>
                      <small>Discord DM URLの先頭を追加します</small>
                    </div>
                    <div className={styles.castContactQuickInput}>
                      {CONTACT_QUICK_INPUTS.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={styles.castContactQuickBtn}
                          onClick={() => { void handleAddQuickContactUrl(selectedCast.name, item.url); }}
                        >
                          <span className={styles.castContactQuickIcon}><Plus size={12} /></span>
                          <span className={styles.castContactQuickText}>
                            <strong>{item.label}</strong>
                            <small>{item.url}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.castContactSiteLinks}>
                    <span className={styles.castContactSiteLabel}>外部サイト</span>
                    <div className={styles.castContactSiteActions}>
                      {CONTACT_SITE_LINKS.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={`${styles.castContactQuickBtn} ${styles.castContactSiteBtn}`}
                          onClick={() => { void handleOpenContactUrl(item.url); }}
                        >
                          <span className={styles.castContactQuickIcon}><ExternalLink size={12} /></span>
                          <span className={styles.castContactQuickText}>
                            <strong>{item.label}</strong>
                            <small>サイトを開く</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.castContactList}>
                    {getContactUrls(selectedCast).map((url, index) => {
                      const marker = getContactMarker(url);
                      const canOpen = getOpenableContactUrl(url) !== null;
                      return (
                        <div key={`${selectedCast.name}-${index}`} className={styles.castContactItem}>
                          <div className={styles.castContactInputWrap}>
                            <span className={getContactMarkerClassName(marker.kind)}>{marker.label}</span>
                            <input
                              type="text"
                              className={styles.castContactInput}
                              placeholder="https:// から始まるURL または @username"
                              value={url}
                              onChange={(e) => { void handleContactUrlChange(selectedCast.name, index, e.target.value); }}
                            />
                          </div>
                          <button
                            type="button"
                            className={`${styles.castContactBtn} ${styles.castContactBtnOpen}`}
                            disabled={!canOpen}
                            title={canOpen ? 'リンクを開く' : 'https:// から始まるURLまたは @username を開けます'}
                            onClick={() => { void handleOpenContactUrl(url); }}
                          >
                            <ExternalLink size={13} />
                          </button>
                          <button
                            type="button"
                            className={`${styles.castContactBtn} ${styles.castContactBtnDelete}`}
                            onClick={() => { void handleContactUrlChange(selectedCast.name, index, ''); }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className={styles.castContactAddBtn}
                      onClick={() => { void handleAddContactUrl(selectedCast.name); }}
                    >
                      <Plus size={13} /> 連絡先を追加
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.castCharDeleteBtn}
                  onClick={() => handleDeleteCast(selectedCast.name)}
                >
                  キャストを削除
                </button>

              </div>
            </div>
          </div>
        ) : (
          <div className={styles.castDetailEmpty}>
            <User size={36} className={styles.castDetailEmpty__icon} />
            <p>左のリストからキャストを選択してください</p>
          </div>
        )}
      </div>

      {alertMessage && (
        <ConfirmModal message={alertMessage} onConfirm={() => setAlertMessage(null)} confirmLabel="OK" type="alert" />
      )}
      {confirmMessage && (
        <ConfirmModal
          message={confirmMessage.message}
          onConfirm={confirmMessage.onConfirm}
          onCancel={() => setConfirmMessage(null)}
          confirmLabel="削除"
          cancelLabel="キャンセル"
          type="confirm"
        />
      )}
    </div>
  );
};
