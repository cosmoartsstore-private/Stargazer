import React from 'react';
import { useAppContext } from '@/stores/AppContext';
import { MATCHING_TYPE_SUMMARY_LABELS } from '@/features/matching/types/matching-type-codes';
import shared from '@/styles/shared.module.css';
import styles from './MatchingConditionPanel.module.css';

interface MatchingConditionPanelProps {
  disabled?: boolean;
}

const SEARCH_MODE_OPTIONS = [
  { value: 'efficiency', label: '効率モード', description: '条件到達で即採用' },
  { value: 'quality', label: '品質モード', description: '時間内で最良を採用' },
] as const;

export const MatchingConditionPanel: React.FC<MatchingConditionPanelProps> = ({
  disabled = false,
}) => {
  const {
    setActivePage,
    casts,
    currentWinners,
    matchingTypeCode,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    allowM003EmptySeats,
    m003SameDaySlotCount,
    matchingSettings,
    setMatchingSettings,
  } = useAppContext();

  const isGroupMode = matchingTypeCode === 'M003';
  const activeCastCount = casts.filter((cast) => cast.is_present).length;
  const totalSeatCount = isGroupMode
    ? totalTables * usersPerTable + (allowM003EmptySeats ? m003SameDaySlotCount : 0)
    : totalTables;
  const conditionItems = [
    { label: '方式', value: MATCHING_TYPE_SUMMARY_LABELS[matchingTypeCode] },
    { label: '当選者数', value: `${currentWinners.length} 名` },
    { label: '出席キャスト', value: `${activeCastCount} 名` },
    { label: 'ラウンド数', value: `${rotationCount}` },
    { label: isGroupMode ? '合計席数' : '総テーブル数', value: isGroupMode ? `${totalSeatCount} 席` : `${totalTables}` },
    ...(isGroupMode ? [
      { label: '総テーブル数', value: `${totalTables}` },
      { label: '1テーブルあたりのゲスト数', value: `${usersPerTable}` },
      { label: '1ローテあたりのキャスト数', value: `${castsPerRotation}` },
      { label: '当日枠', value: allowM003EmptySeats ? `${m003SameDaySlotCount} 席を含める` : '含めない' },
    ] : []),
  ];

  return (
    <div className={styles.executionPanel}>
      <div className={styles.conditionHeader}>
        <div>
          <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>実行条件</h2>
          <p className={`${shared.pageHeaderSubtitle} ${styles.conditionLead}`}>
            抽選設定で確定した条件を読み取り専用で表示します。
          </p>
        </div>
        <button type="button" className={shared.btnSecondary} onClick={() => setActivePage('lottery')}>
          抽選設定へ戻る
        </button>
      </div>

      <div className={styles.conditionSummaryGrid}>
        {conditionItems.map((item) => (
          <div key={item.label} className={styles.conditionSummaryItem}>
            <span className={styles.conditionSummaryLabel}>{item.label}</span>
            <strong className={styles.conditionSummaryValue}>{item.value}</strong>
          </div>
        ))}
      </div>

      <label className={`${shared.formGroup} ${styles.searchModeGroup}`}>
        <span className={shared.formLabel}>探索モード</span>
        <div className={styles.optionGrid}>
          {SEARCH_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.optionButton}${matchingSettings.searchMode === option.value ? ` ${styles.optionButtonSelected}` : ''}`}
              disabled={disabled}
              onClick={() =>
                setMatchingSettings((prev) => ({
                  ...prev,
                  searchMode: option.value,
                }))
              }
            >
              {option.label}
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </label>

      <p className={styles.conditionSummaryNote}>
        マッチング方式、席数、ラウンド数を変更する場合は抽選設定に戻ります。キャストごとのNG対象はX IDで判定し、マッチング時に自動除外します。
      </p>
    </div>
  );
};
