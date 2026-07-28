// 抽選条件の検証結果と抽選開始操作を表示します。

import React from 'react';
import { getMsg } from '@/messages/getMsg';
import type { LotteryValidationResult } from '../services/lottery-validation';
import styles from '../LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

interface LotteryValidationPanelProps {
  validation: LotteryValidationResult;
  onRunClick: () => void;
  title?: string;
  description?: string;
  readySubtext?: string;
  runLabel?: string;
  runDisabled?: boolean;
}

export const LotteryValidationPanel: React.FC<LotteryValidationPanelProps> = ({
  validation,
  onRunClick,
  title,
  description,
  readySubtext = getMsg('LotteryValidationPanel.defaultReadySubtext'),
  runLabel = getMsg('LotteryValidationPanel.defaultRunLabel'),
  runDisabled = false,
}) => {
  // 検証メッセージの有無から、表示するバッジと実行可否を決定する。
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;
  const hasInfo = validation.info.length > 0;

  return (
    <div className={styles.lotteryFormCard}>
      {title && (
        <div className={styles.workflowColumnHeader}>
          <strong>{title}</strong>
          {description && <span>{description}</span>}
        </div>
      )}

      <div className={styles.lotteryValidationPanel}>
        <div className={styles.lotteryValidationHeader} aria-live="polite">
          {hasErrors && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeError}`}>{getMsg('LotteryValidationPanel.errorBadge')}</span>}
          {hasWarnings && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeWarning}`}>{getMsg('LotteryValidationPanel.warningBadge')}</span>}
          {hasInfo && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeInfo}`}>{getMsg('LotteryValidationPanel.infoBadge')}</span>}
        </div>

        <div className={`${styles.lotteryValidationContent} ${shared.customScrollbar}`}>
          {!hasErrors && !hasWarnings && !hasInfo ? (
            /* 問題がない場合は、実行準備完了を表示する。 */
            <div className={styles.lotteryValidationEmpty}>
              <p className={styles.lotteryValidationEmptyText}>{getMsg('LotteryValidationPanel.noProblems')}</p>
              <p className={styles.lotteryValidationEmptySubtext}>{readySubtext}</p>
            </div>
          ) : (
            /* 問題がある場合は、検証メッセージを一覧表示する。 */
            <div className={styles.lotteryValidationList}>
              {validation.info.map((message, index) => (
                <div key={`info-${index}`} className={`${styles.lotteryValidationItem} ${styles.lotteryValidationItemInfo}`}>
                  <strong className={styles.lotteryValidationItemLabel}>{getMsg('LotteryValidationPanel.infoBadge')}</strong>
                  {message}
                </div>
              ))}
              {validation.errors.map((error, index) => (
                <div key={`error-${index}`} className={`${styles.lotteryValidationItem} ${styles.lotteryValidationItemError}`}>
                  <strong className={styles.lotteryValidationItemLabel}>{getMsg('LotteryValidationPanel.errorBadge')}</strong>
                  {error}
                </div>
              ))}
              {validation.warnings.map((warning, index) => (
                <div key={`warning-${index}`} className={`${styles.lotteryValidationItem} ${styles.lotteryValidationItemWarning}`}>
                  <strong className={styles.lotteryValidationItemLabel}>{getMsg('LotteryValidationPanel.warningBadge')}</strong>
                  {warning}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.lotteryActionBar}>
        <button type="button" onClick={onRunClick} className={`${shared.btnPrimary} ${shared.btnPrimaryFull}`} disabled={hasErrors || runDisabled}>{runLabel}</button>
      </div>
    </div>
  );
};
