import React, { useCallback, useEffect, useState, useRef } from 'react';
import { getSetting, setSetting } from '@/db';
import styles from './TagMasterPage.module.css';
import shared from '@/styles/shared.module.css';

const TAG_MASTER_KEY = 'tag_master_items';

export const TagMasterPage: React.FC = () => {
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const loadTags = useCallback(async () => {
    try {
      const saved = await getSetting(TAG_MASTER_KEY);
      if (saved) setTags(JSON.parse(saved) as string[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const saveTags = async (updated: string[]) => {
    setTags(updated);
    await setSetting(TAG_MASTER_KEY, JSON.stringify(updated)).catch(() => {});
  };

  const handleAdd = () => {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    void saveTags([...tags, trimmed]);
    setNewTag('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (index: number) => {
    void saveTags(tags.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...tags];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    void saveTags(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index >= tags.length - 1) return;
    const updated = [...tags];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    void saveTags(updated);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingValue(tags[index]);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editingValue.trim();
    if (!trimmed) {
      handleRemove(editingIndex);
    } else if (trimmed !== tags[editingIndex]) {
      const updated = [...tags];
      updated[editingIndex] = trimmed;
      void saveTags(updated);
    }
    setEditingIndex(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditingIndex(null);
    }
  };

  const previewText = tags.length > 0 ? tags.join(' ') : '（タグ未登録）';

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
      <div className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>タグマスタ</h1>
        <p className={shared.pageHeaderSubtitle}>
          投稿テンプレの <code>{'{tags}'}</code> プレースホルダーに挿入されるハッシュタグを管理します。
        </p>
      </div>

      <div className={styles.tagMasterLayout}>
        <div className={styles.tagMasterEditor}>
          <div className={styles.tagAddRow}>
            <input
              ref={inputRef}
              type="text"
              className={shared.formInput}
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="#ハッシュタグ を入力"
            />
            <button type="button" className={shared.btnPrimary} onClick={handleAdd} disabled={!newTag.trim()}>
              追加
            </button>
          </div>

          {tags.length === 0 ? (
            <p className={shared.textMutedItalic} style={{ marginTop: 12 }}>
              タグが登録されていません。上のフォームから追加してください。
            </p>
          ) : (
            <ul className={styles.tagList}>
              {tags.map((tag, index) => (
                <li key={`${tag}-${index}`} className={styles.tagItem}>
                  {editingIndex === index ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      className={`${shared.formInput} ${styles.tagEditInput}`}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={commitEdit}
                    />
                  ) : (
                    <span className={styles.tagLabel} onDoubleClick={() => startEditing(index)}>
                      {tag}
                    </span>
                  )}
                  <div className={styles.tagActions}>
                    <button type="button" className={styles.tagBtn} onClick={() => handleMoveUp(index)} disabled={index === 0} title="上へ">
                      ↑
                    </button>
                    <button type="button" className={styles.tagBtn} onClick={() => handleMoveDown(index)} disabled={index >= tags.length - 1} title="下へ">
                      ↓
                    </button>
                    <button type="button" className={`${styles.tagBtn} ${styles.tagBtnDanger}`} onClick={() => handleRemove(index)} title="削除">
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.tagMasterPreview}>
          <span className={shared.importSectionLabel}>プレビュー（スペース区切り）</span>
          <div className={styles.tagPreviewBox}>
            {previewText}
          </div>
          <p className={shared.formInlineNote} style={{ marginTop: 8 }}>
            投稿テンプレートで <code>{'{tags}'}</code> を使うとここの内容が挿入されます。ダブルクリックで編集可。
          </p>
        </div>
      </div>
    </div>
  );
};
