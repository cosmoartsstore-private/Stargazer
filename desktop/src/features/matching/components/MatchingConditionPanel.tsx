// マッチング実行条件の要約と探索モード設定を表示します。

import React, { useId } from 'react';
import { selectM003Capacity } from '@/features/matching/logics/matching-capacity';
import { useAppContext } from '@/stores/AppContext';
import { MATCHING_TYPE_SUMMARY_LABELS } from '@/features/matching/types/matching-type-codes';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from './MatchingConditionPanel.module.css';

interface MatchingConditionPanelProps {
  disabled?: boolean;
}

// マッチング探索で選択できる速度・品質方針。
const SEARCH_MODE_OPTIONS = [
  {
    value: 'efficiency',
    label: getMsg('MatchingConditionPanel.efficiencyMode'),
    description: getMsg('MatchingConditionPanel.efficiencyModeDescription'),
  },
  {
    value: 'quality',
    label: getMsg('MatchingConditionPanel.qualityMode'),
    description: getMsg('MatchingConditionPanel.qualityModeDescription'),
  },
] as const;

type SearchMode = (typeof SEARCH_MODE_OPTIONS)[number]['value'];

function getSearchModeOptionClassName(isSelected: boolean): string {
  return [
    styles.optionButton,
    isSelected ? styles.optionButtonSelected : '',
  ].filter(Boolean).join(' ');
}

interface SearchModeOptionButtonProps {
  option: (typeof SEARCH_MODE_OPTIONS)[number];
  selected: boolean;
  disabled: boolean;
  onSelect: (searchMode: SearchMode) => void;
}

function SearchModeOptionButton({ option, selected, disabled, onSelect }: SearchModeOptionButtonProps) {
  const handleClick = () => onSelect(option.value);

  return (
    <button type="button" className={getSearchModeOptionClassName(selected)} aria-pressed={selected} disabled={disabled} onClick={handleClick}>
      {option.label}
      <span>{option.description}</span>
    </button>
  );
}

export const MatchingConditionPanel: React.FC<MatchingConditionPanelProps> = ({
  disabled = false,
}) => {
  const searchModeLabelId = useId();
  // 条件要約と検索方針の変更に必要な共有状態を取得する。
  const {
    setActivePage,
    casts,
    currentWinners,
    sessionWorkflow,
    matchingSettings,
    setMatchingSettings,
  } = useAppContext();
  const {
    matchingTypeCode,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    allowM003EmptySeats,
    m003SameDaySlotCount,
  } = sessionWorkflow;

  // 現在の方式と参加データから、実行条件の要約行を組み立てる。
  const isGroupMode = matchingTypeCode === 'M003';
  const activeCastCount = casts.filter((cast) => cast.is_present).length;
  const m003Capacity = isGroupMode
    ? selectM003Capacity({
        totalTables,
        usersPerTable,
        totalWinners: currentWinners.length,
        activeCastCount,
        castsPerRotation,
        includedSameDaySlotCount: allowM003EmptySeats ? m003SameDaySlotCount : 0,
      })
    : null;
  const totalSeatCount = m003Capacity?.totalSeatCount ?? totalTables;
  const conditionItems = [
    {
      label: getMsg('MatchingConditionPanel.matchingType'),
      value: MATCHING_TYPE_SUMMARY_LABELS[matchingTypeCode],
    },
    {
      label: getMsg('MatchingConditionPanel.winnerCount'),
      value: getMsg('MatchingConditionPanel.peopleCount', { count: currentWinners.length }),
    },
    {
      label: getMsg('MatchingConditionPanel.attendingCasts'),
      value: getMsg('MatchingConditionPanel.peopleCount', { count: activeCastCount }),
    },
    {
      label: getMsg('MatchingConditionPanel.rotationCount'),
      value: String(rotationCount),
    },
    {
      label: isGroupMode
        ? getMsg('MatchingConditionPanel.totalSeatCount')
        : getMsg('MatchingConditionPanel.totalTableCount'),
      value: isGroupMode
        ? getMsg('MatchingConditionPanel.seatCount', { count: totalSeatCount })
        : String(totalTables),
    },
    // M003 では、共通条件にグループ制固有の席・キャスト条件を追加する。
    ...(isGroupMode ? [
      {
        label: getMsg('MatchingConditionPanel.totalTableCount'),
        value: String(totalTables),
      },
      {
        label: getMsg('MatchingConditionPanel.guestsPerTable'),
        value: String(usersPerTable),
      },
      {
        label: getMsg('MatchingConditionPanel.castsPerRotation'),
        value: String(castsPerRotation),
      },
      {
        label: getMsg('MatchingConditionPanel.sameDaySlots'),
        value: allowM003EmptySeats
          ? getMsg('MatchingConditionPanel.includedSeatCount', { count: m003SameDaySlotCount })
          : getMsg('MatchingConditionPanel.notIncluded'),
      },
    ] : []),
  ];

  const handleReturnToLottery = () => {
    setActivePage('lottery');
  };

  const handleSearchModeChange = (searchMode: SearchMode) => {
    setMatchingSettings((previous) => ({
      ...previous,
      searchMode,
    }));
  };

  return (
    <div className={styles.executionPanel}>
      <div className={styles.conditionHeader}>
        <div>
          <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>{getMsg('MatchingConditionPanel.heading')}</h2>
          <p className={`${shared.pageHeaderSubtitle} ${styles.conditionLead}`}>{getMsg('MatchingConditionPanel.description')}</p>
        </div>
        <button type="button" className={shared.btnSecondary} onClick={handleReturnToLottery}>{getMsg('MatchingConditionPanel.returnToLottery')}</button>
      </div>

      <div className={styles.conditionSummaryGrid}>
        {conditionItems.map((item) => (
          <div key={item.label} className={styles.conditionSummaryItem}>
            <span className={styles.conditionSummaryLabel}>{item.label}</span>
            <strong className={styles.conditionSummaryValue}>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className={`${shared.formGroup} ${styles.searchModeGroup}`}>
        <span id={searchModeLabelId} className={shared.formLabel}>{getMsg('MatchingConditionPanel.searchMode')}</span>
        <div className={styles.optionGrid} role="group" aria-labelledby={searchModeLabelId}>
          {SEARCH_MODE_OPTIONS.map((option) => (
            <SearchModeOptionButton key={option.value} option={option} selected={matchingSettings.searchMode === option.value} disabled={disabled} onSelect={handleSearchModeChange} />
          ))}
        </div>
      </div>

      <p className={styles.conditionSummaryNote}>{getMsg('MatchingConditionPanel.note')}</p>
    </div>
  );
};
