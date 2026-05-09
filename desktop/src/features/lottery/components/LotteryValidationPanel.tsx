import React from 'react';
import styles from '../LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

interface LotteryValidationPanelProps {
    validation: {
        errors: string[];
        warnings: string[];
    };
    onRunClick: () => void;
}

export const LotteryValidationPanel: React.FC<LotteryValidationPanelProps> = ({
    validation,
    onRunClick,
}) => {
    const hasErrors   = validation.errors.length > 0;
    const hasWarnings = validation.warnings.length > 0;

    const panelMod = hasErrors ? styles.lotteryValidationPanelDanger
                   : hasWarnings ? styles.lotteryValidationPanelWarning
                   : styles.lotteryValidationPanelNormal;

    return (
        <div className={styles.lotteryFormCard}>
            <div className={`${styles.lotteryValidationPanel} ${panelMod}`}>
                <div className={styles.lotteryValidationHeader}>
                    {hasErrors   && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeError}`}>ERROR</span>}
                    {hasWarnings && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeWarning}`}>WARNING</span>}
                    {!hasErrors && !hasWarnings && <span className={`${styles.lotteryValidationBadge} ${styles.lotteryValidationBadgeNormal}`}>OK</span>}
                </div>

                <div className={`${styles.lotteryValidationContent} ${shared.customScrollbar}`}>
                    {!hasErrors && !hasWarnings ? (
                        <div className={styles.lotteryValidationEmpty}>
                            <p className={styles.lotteryValidationEmptyText}>設定に問題はありません</p>
                            <p className={styles.lotteryValidationEmptySubtext}>抽選を行う準備が完了しています</p>
                        </div>
                    ) : (
                        <div className={styles.lotteryValidationList}>
                            {validation.errors.map((error, idx) => (
                                <div key={`err-${idx}`} className={`${styles.lotteryValidationItem} ${styles.lotteryValidationItemError}`}>
                                    <strong className={styles.lotteryValidationItemLabel}>エラー</strong>
                                    {error}
                                </div>
                            ))}
                            {validation.warnings.map((warning, idx) => (
                                <div key={`warn-${idx}`} className={`${styles.lotteryValidationItem} ${styles.lotteryValidationItemWarning}`}>
                                    <strong className={styles.lotteryValidationItemLabel}>注意</strong>
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
                    抽選開始
                </button>
            </div>
        </div>
    );
};
