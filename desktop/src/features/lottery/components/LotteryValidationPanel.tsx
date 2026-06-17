import React from 'react';
import styles from '../LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

interface LotteryValidationPanelProps {
    validation: {
        errors: string[];
        warnings: string[];
        info: string[];
    };
    onRunClick: () => void;
    title?: string;
    description?: string;
    readySubtext?: string;
    runLabel?: string;
}

export const LotteryValidationPanel: React.FC<LotteryValidationPanelProps> = ({
    validation,
    onRunClick,
    title,
    description,
    readySubtext = '抽選を行う準備が完了しています',
    runLabel = '抽選開始',
}) => {
    const hasErrors   = validation.errors.length > 0;
    const hasWarnings = validation.warnings.length > 0;
    const hasInfo     = validation.info.length > 0;

    const panelMod = hasErrors ? styles.lotteryValidationPanelDanger
                   : hasWarnings ? styles.lotteryValidationPanelWarning
                   : styles.lotteryValidationPanelNormal;

    return (
        <div className={styles.lotteryFormCard}>
            {title && (
                <div className={styles.lotteryValidationTitleBlock}>
                    <strong>{title}</strong>
                    {description && <span>{description}</span>}
                </div>
            )}

            <div className={`${styles.lotteryValidationPanel} ${panelMod}`}>
                <div className={styles.lotteryValidationHeader}>
                    {hasErrors   && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeError}`}>ERROR</span>}
                    {hasWarnings && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeWarning}`}>WARN</span>}
                    {hasInfo     && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeInfo}`}>INFO</span>}
                    {!hasErrors && !hasWarnings && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeNormal}`}>OK</span>}
                </div>

                <div className={`${styles.lotteryValidationContent} ${shared.customScrollbar}`}>
                    {!hasErrors && !hasWarnings && !hasInfo ? (
                        <div className={styles.lotteryValidationEmpty}>
                            <p className={styles.lotteryValidationEmptyText}>設定に問題はありません</p>
                            <p className={styles.lotteryValidationEmptySubtext}>{readySubtext}</p>
                        </div>
                    ) : (
                        <div className={styles.lotteryValidationList}>
                            {validation.info.map((message, idx) => (
                                <div key={`info-${idx}`} className={`${styles.lotteryValidationItem} ${styles.lotteryValidationItemInfo}`}>
                                    <strong className={styles.lotteryValidationItemLabel}>INFO</strong>
                                    {message}
                                </div>
                            ))}
                            {validation.errors.map((error, idx) => (
                                <div key={`err-${idx}`} className={`${styles.lotteryValidationItem} ${styles.lotteryValidationItemError}`}>
                                    <strong className={styles.lotteryValidationItemLabel}>ERROR</strong>
                                    {error}
                                </div>
                            ))}
                            {validation.warnings.map((warning, idx) => (
                                <div key={`warn-${idx}`} className={`${styles.lotteryValidationItem} ${styles.lotteryValidationItemWarning}`}>
                                    <strong className={styles.lotteryValidationItemLabel}>WARN</strong>
                                    {warning}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.lotteryActionBar}>
                <button
                    type="button"
                    onClick={onRunClick}
                    className={`${shared.btnPrimary} ${shared.btnPrimaryFull}`}
                    disabled={hasErrors}
                >
                    {runLabel}
                </button>
            </div>
        </div>
    );
};
