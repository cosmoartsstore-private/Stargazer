// マッチング実行条件の要約を表示する。

import React from 'react';
import { selectM003Capacity } from '@/features/matching/logics/matching-capacity';
import { useAppContext } from '@/stores/AppContext';
import { MATCHING_TYPE_SUMMARY_LABELS } from '@/features/matching/types/matching-type-codes';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from './MatchingConditionPanel.module.css';

interface MatchingConditionPanelProps {
  disabled?: boolean;
}

export const MatchingConditionPanel: React.FC<MatchingConditionPanelProps> = ({
  disabled = false,
}) => {
  // 条件要約に必要な共有状態を取得する。
  const {
    setActivePage,
    casts,
    currentWinners,
    sessionWorkflow,
  } = useAppContext();
  const {
    matchingTypeCode,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    reserveSameDaySlots,
    sameDaySlotCount,
    sameDaySlotUnit,
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
        reservedSameDaySlotCount: reserveSameDaySlots ? sameDaySlotCount : 0,
        sameDaySlotUnit,
      })
    : null;
  const lotterySeatCount = m003Capacity?.lotterySeatCount ?? totalTables;
  const reservedTableCount = reserveSameDaySlots ? sameDaySlotCount : 0;
  const lotteryTableCount = Math.max(0, totalTables - reservedTableCount);
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
        ? getMsg('MatchingConditionPanel.lotterySeatCount')
        : getMsg('MatchingConditionPanel.lotteryTableCount'),
      value: isGroupMode
        ? getMsg('MatchingConditionPanel.seatCount', { count: lotterySeatCount })
        : getMsg('MatchingConditionPanel.tableCount', { count: lotteryTableCount }),
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
        value: reserveSameDaySlots
          ? getMsg(sameDaySlotUnit === 'person'
            ? 'MatchingConditionPanel.reservedPersonCount'
            : 'MatchingConditionPanel.reservedTableCount', { count: sameDaySlotCount })
          : getMsg('MatchingConditionPanel.notReserved'),
      },
    ] : [{
      label: getMsg('MatchingConditionPanel.sameDaySlots'),
      value: reserveSameDaySlots
        ? getMsg('MatchingConditionPanel.reservedTableCount', { count: sameDaySlotCount })
        : getMsg('MatchingConditionPanel.notReserved'),
    }]),
  ];

  const handleReturnToLottery = () => {
    setActivePage('lottery');
  };

  return (
    <div className={styles.executionPanel}>
      <div className={styles.conditionHeader}>
        <div>
          <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>{getMsg('MatchingConditionPanel.heading')}</h2>
          <p className={`${shared.pageHeaderSubtitle} ${styles.conditionLead}`}>{getMsg('MatchingConditionPanel.description')}</p>
        </div>
        <button type="button" className={shared.btnSecondary} disabled={disabled} onClick={handleReturnToLottery}>{getMsg('MatchingConditionPanel.returnToLottery')}</button>
      </div>

      <div className={styles.conditionSummaryGrid}>
        {conditionItems.map((item) => (
          <div key={item.label} className={styles.conditionSummaryItem}>
            <span className={styles.conditionSummaryLabel}>{item.label}</span>
            <strong className={styles.conditionSummaryValue}>{item.value}</strong>
          </div>
        ))}
      </div>

      <p className={styles.conditionSummaryNote}>{getMsg('MatchingConditionPanel.note')}</p>
    </div>
  );
};
