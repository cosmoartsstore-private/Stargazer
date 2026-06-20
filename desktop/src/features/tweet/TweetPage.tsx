import React, { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '@/stores/AppContext';
import { getSetting, setSetting, getEventMeta } from '@/db';
import styles from './TweetPage.module.css';
import shared from '@/styles/shared.module.css';
import {
  buildTweetPreview,
  DEFAULT_TWEET_TEMPLATE,
  resolveTweetTemplate,
  TWEET_TEMPLATE_KEY,
} from './tweetTemplate';

const PLACEHOLDERS = [
  { key: '{casts}',       label: 'キャスト一覧（改行区切り）' },
  { key: '{event_name}',  label: 'イベント名' },
];

export const TweetPage: React.FC = () => {
  const { casts: allCasts, currentEventName } = useAppContext();
  const [template, setTemplate] = useState(DEFAULT_TWEET_TEMPLATE);
  const [copied, setCopied] = useState(false);

  const casts = allCasts.filter((c) => c.is_present).map((c) => c.name);
  const preview = buildTweetPreview(template, casts, currentEventName ?? '');

  const loadTemplate = useCallback(async () => {
    try {
      const saved = await getSetting(TWEET_TEMPLATE_KEY);
      setTemplate(resolveTweetTemplate(saved));
    } catch {
      // 読み込み失敗時は現在のテンプレート表示を維持する。
    }
  }, []);

  const loadEventMeta = useCallback(async () => {
    if (currentEventName === null) return;
    try {
      await getEventMeta();
    } catch {
      // イベント情報の取得に失敗しても投稿編集は続行する。
    }
  }, [currentEventName]);

  useEffect(() => {
    void loadTemplate();
    void loadEventMeta();
  }, [loadTemplate, loadEventMeta, currentEventName]);

  const handleTemplateChange = async (value: string) => {
    setTemplate(value);
    await setSetting(TWEET_TEMPLATE_KEY, value).catch(() => {});
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const insertPlaceholder = (key: string) => {
    setTemplate((prev) => {
      const next = prev + key;
      void setSetting(TWEET_TEMPLATE_KEY, next).catch(() => {});
      return next;
    });
  };

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
      <div className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>投稿テンプレ</h1>
        <p className={shared.pageHeaderSubtitle}>
          ツイート・投稿文をテンプレートから生成します。<strong>出席中のキャスト</strong>が自動挿入されます。
        </p>
      </div>

      <div className={styles.tweetLayout}>
        {/* 左: 編集 */}
        <div className={styles.tweetLayout__editor}>
          <div className={styles.tweetEditorHeader}>
            <span className={shared.importSectionLabel}>テンプレート編集</span>
            <button
              type="button"
              className={shared.btnSecondary}
              style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => { void handleTemplateChange(DEFAULT_TWEET_TEMPLATE); }}
            >
              リセット
            </button>
          </div>

          <textarea
            className={`${styles.tweetTemplateTextarea} ${shared.customScrollbar}`}
            value={template}
            onChange={(e) => { void handleTemplateChange(e.target.value); }}
            rows={10}
            spellCheck={false}
          />

          <div className={styles.tweetPlaceholderList}>
            <span className={shared.importSectionLabel} style={{ marginBottom: 4 }}>プレースホルダー</span>
            {PLACEHOLDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={styles.tweetPlaceholderChip}
                onClick={() => insertPlaceholder(p.key)}
                title={p.label}
              >
                {p.key}
              </button>
            ))}
          </div>

          {casts.length === 0 && (
            <p className={shared.importErrorMsg} style={{ marginTop: 8 }}>
              ⚠ 出席中のキャストが0人です。キャスト管理で出席状態を確認してください。
            </p>
          )}
        </div>

        {/* 右: プレビュー */}
        <div className={styles.tweetLayout__preview}>
          <span className={shared.importSectionLabel}>プレビュー</span>
          <div className={`${styles.tweetPreviewBox} ${shared.customScrollbar}`}>
            {preview.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </div>
          <div
            className={styles.tweetCharCount}
            style={{ color: preview.length > 280 ? 'var(--accent-danger)' : 'var(--text-muted)' }}
          >
            {preview.length} 文字{preview.length > 280 ? '（Twitter上限超過）' : ''}
          </div>

          <div className={styles.tweetActions}>
            <button
              type="button"
              className={`${styles.tweetCopyButton}${copied ? ` ${styles.tweetCopyButtonCopied}` : ''}`}
              onClick={() => { void handleCopy(); }}
            >
              {copied ? '✓ コピー完了' : 'クリップボードにコピー'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
