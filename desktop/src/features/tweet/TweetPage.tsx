// 投稿テンプレートの編集・保存と投稿文プレビューの生成を提供するページ。

import React, { useState } from 'react';
import { NoticeDialog } from '@/components/ConfirmModal';
import { useAppContext } from '@/stores/AppContext';
import { getMsg } from '@/messages/getMsg';
import styles from './TweetPage.module.css';
import shared from '@/styles/shared.module.css';
import {
  buildTweetPreview,
  DEFAULT_TWEET_TEMPLATE,
} from './tweetTemplate';
import { useTweetTemplate } from './useTweetTemplate';

// 編集欄へ挿入できる投稿テンプレートの置換項目。
const PLACEHOLDERS = [
  { key: '{casts}', label: getMsg('TweetPage.castsPlaceholder'), ariaLabel: getMsg('TweetPage.insertCastsAriaLabel') },
  { key: '{event_name}', label: getMsg('TweetPage.eventNamePlaceholder'), ariaLabel: getMsg('TweetPage.insertEventNameAriaLabel') },
];

type Placeholder = (typeof PLACEHOLDERS)[number];

interface PlaceholderButtonProps {
  placeholder: Placeholder;
  onSelect: (placeholder: string) => void;
}

function PlaceholderButton({ placeholder, onSelect }: PlaceholderButtonProps) {
  const handleClick = () => onSelect(placeholder.key);

  return (
    <button type="button" className={styles.tweetPlaceholderChip} onClick={handleClick} aria-label={placeholder.ariaLabel}>
      <span className={styles.tweetPlaceholderKey}>{placeholder.key}</span>
      <span className={styles.tweetPlaceholderDescription}>{placeholder.label}</span>
    </button>
  );
}

export const TweetPage: React.FC = () => {
  // イベント表示、コピー通知、永続化済みテンプレートの画面状態。
  const { casts: allCasts, currentEventName } = useAppContext();
  const [copied, setCopied] = useState(false);
  const {
    template,
    alertMessage,
    setAlertMessage,
    updateTemplate,
    appendPlaceholder,
  } = useTweetTemplate(currentEventName);

  // 現在の出席キャストとイベント名から投稿プレビューを生成する。
  const casts = allCasts.filter((c) => c.is_present).map((c) => c.name);
  const preview = buildTweetPreview(template, casts, currentEventName ?? '');

  // 編集、クリップボード、確認ダイアログのUIイベント。
  const handleCopy = async () => {
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAlertConfirm = () => {
    setAlertMessage(null);
  };

  const handleResetTemplate = () => {
    updateTemplate(DEFAULT_TWEET_TEMPLATE);
  };

  const handleTemplateInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateTemplate(event.target.value);
  };

  const handleCopyClick = () => {
    void handleCopy();
  };

  // コピー結果と文字数に応じた表示状態。
  const copyButtonClassName = [
    styles.tweetCopyButton,
    copied ? styles.tweetCopyButtonCopied : '',
  ].filter(Boolean).join(' ');
  const characterCountClassName = [
    styles.tweetCharCount,
    preview.length > 280 ? styles.tweetCharCountOverLimit : '',
  ].filter(Boolean).join(' ');
  const characterCountMessage = preview.length > 280
    ? getMsg('TweetPage.characterCountOverLimit', { count: preview.length })
    : getMsg('TweetPage.characterCount', { count: preview.length });
  const copyButtonLabel = copied ? getMsg('TweetPage.copyComplete') : getMsg('TweetPage.copyToClipboard');

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner}`}>
      {alertMessage && (
        <NoticeDialog
          title={getMsg('TweetPage.pageTitle')}
          message={alertMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleAlertConfirm}
        />
      )}
      <div className={`${shared.pageHeader} ${shared.pageHeaderTight}`}>
        <h1 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleLg}`}>{getMsg('TweetPage.pageTitle')}</h1>
        <p className={shared.pageHeaderSubtitle}>
          {getMsg('TweetPage.descriptionPrefix')}
          <strong>{getMsg('TweetPage.attendingCasts')}</strong>
          {getMsg('TweetPage.descriptionSuffix')}
        </p>
      </div>

      <div className={styles.tweetLayout}>
        {/* 左: 編集 */}
        <div className={styles.tweetLayout__editor}>
          <div className={styles.tweetEditorHeader}>
            <label className={shared.importSectionLabel} htmlFor="tweet-template">{getMsg('TweetPage.editorHeading')}</label>
            <button type="button" className={`${shared.btnSecondary} ${styles.tweetResetButton}`} onClick={handleResetTemplate}>{getMsg('TweetPage.resetTemplate')}</button>
          </div>

          <textarea id="tweet-template" name="tweet-template" className={`${styles.tweetTemplateTextarea} ${shared.customScrollbar}`} value={template} onChange={handleTemplateInputChange} rows={10} spellCheck={false} />

          <div className={styles.tweetPlaceholderList}>
            <span className={`${shared.importSectionLabel} ${styles.tweetPlaceholderHeading}`}>{getMsg('TweetPage.placeholdersHeading')}</span>
            {PLACEHOLDERS.map((placeholder) => (
              <PlaceholderButton key={placeholder.key} placeholder={placeholder} onSelect={appendPlaceholder} />
            ))}
          </div>

          {casts.length === 0 && (
            <p className={`${shared.importErrorMsg} ${styles.tweetNoAttendingCasts}`}>{getMsg('TweetPage.noAttendingCasts')}</p>
          )}
        </div>

        {/* 右: プレビュー */}
        <div className={styles.tweetLayout__preview}>
          <span className={shared.importSectionLabel}>{getMsg('TweetPage.previewHeading')}</span>
          <div className={`${styles.tweetPreviewBox} ${shared.customScrollbar}`}>
            {preview.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </div>
          <div className={characterCountClassName}>{characterCountMessage}</div>

          <div className={styles.tweetActions}>
            <button type="button" className={copyButtonClassName} onClick={handleCopyClick}>{copyButtonLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
