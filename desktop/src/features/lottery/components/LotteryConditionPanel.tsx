// 抽選条件の入力、確定当選者の要約、条件検証を表示する。

import React, { useId } from 'react';
import type { UserBean } from '@/common/types/entities';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import { CounterControl } from '@/components/CounterControl';
import {
  MATCHING_TYPE_CODES,
  MATCHING_TYPE_LABELS,
  type MatchingTypeCode,
} from '@/features/matching/types/matching-type-codes';
import { getMsg } from '@/messages/getMsg';
import type { LotteryValidationResult } from '../services/lottery-validation';
import { LotteryValidationPanel } from './LotteryValidationPanel';
import styles from '../LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

const GUARANTEED_WINNER_PREVIEW_LIMIT = 1;

function getMatchingTypeOptionClassName(isSelected: boolean): string {
  return [
    styles.matchingTypeOption,
    isSelected ? styles.matchingTypeOptionSelected : '',
  ].filter(Boolean).join(' ');
}

interface MatchingTypeOptionButtonProps {
  code: MatchingTypeCode;
  selected: boolean;
  disabled: boolean;
  onSelect: (code: MatchingTypeCode) => void;
}

function MatchingTypeOptionButton({ code, selected, disabled, onSelect }: MatchingTypeOptionButtonProps) {
  const handleClick = () => onSelect(code);
  return <button type="button" className={getMatchingTypeOptionClassName(selected)} aria-pressed={selected} disabled={disabled} onClick={handleClick}>{MATCHING_TYPE_LABELS[code]}</button>;
}

interface LotteryConditionPanelProps {
  matchingTypeCode: MatchingTypeCode;
  lotteryCount: number;
  totalWinners: number;
  guaranteedWinners: readonly UserBean[];
  rotationCount: number;
  totalTables: number;
  usersPerTable: number;
  castsPerRotation: number;
  allowM003EmptySeats: boolean;
  m003SameDaySlotCount: number;
  validation: LotteryValidationResult;
  readOnly?: boolean;
  onLotteryCountChange: (value: number) => void;
  onOpenGuaranteedSelect: () => void;
  onMatchingTypeChange: (code: MatchingTypeCode) => void;
  onRotationCountChange: (value: number) => void;
  onTotalTablesChange: (value: number) => void;
  onUsersPerTableChange: (value: number) => void;
  onCastsPerRotationChange: (value: number) => void;
  onAllowM003EmptySeatsToggle: () => void;
  onSameDaySlotCountChange: (value: number) => void;
  onRunLottery: () => void;
}

export const LotteryConditionPanel: React.FC<LotteryConditionPanelProps> = ({
  matchingTypeCode,
  lotteryCount,
  totalWinners,
  guaranteedWinners,
  rotationCount,
  totalTables,
  usersPerTable,
  castsPerRotation,
  allowM003EmptySeats,
  m003SameDaySlotCount,
  validation,
  readOnly = false,
  onLotteryCountChange,
  onOpenGuaranteedSelect,
  onMatchingTypeChange,
  onRotationCountChange,
  onTotalTablesChange,
  onUsersPerTableChange,
  onCastsPerRotationChange,
  onAllowM003EmptySeatsToggle,
  onSameDaySlotCountChange,
  onRunLottery,
}) => {
  const isLotteryOnlyMode = matchingTypeCode === 'M000';
  const visibleGuaranteedWinners = guaranteedWinners.slice(0, GUARANTEED_WINNER_PREVIEW_LIMIT);
  const hiddenGuaranteedWinnerCount = Math.max(0, guaranteedWinners.length - visibleGuaranteedWinners.length);
  const m003SettingsSlotClassName = [
    styles.m003SettingsSlot,
    matchingTypeCode === 'M003' ? '' : styles.m003SettingsSlotInactive,
  ].filter(Boolean).join(' ');
  const workflowSwitchClassName = [
    styles.workflowSwitch,
    allowM003EmptySeats ? styles.workflowSwitchOn : '',
  ].filter(Boolean).join(' ');
  const sameDaySlotControlClassName = [
    styles.sameDaySlotControl,
    allowM003EmptySeats ? '' : styles.sameDaySlotControlDisabled,
  ].filter(Boolean).join(' ');
  const hiddenGuaranteedWinnersAriaLabel = getMsg(
    'LotteryPage.hiddenGuaranteedWinnersAriaLabel',
    { count: hiddenGuaranteedWinnerCount },
  );
  const matchingTypeLabelId = useId();
  const sameDaySlotToggleLabelId = useId();

  return (
    <section className={`${shared.sectionBlock} ${styles.workflowConditionBlock}`}>
      <div className={styles.workflowSectionHeader}>
        <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`}>{getMsg('LotteryPage.settingsHeading')}</h2>
        <p className={`${shared.pageHeaderSubtitle} ${shared.sectionSubtitleInline}`}>{getMsg('LotteryPage.settingsDescription')}</p>
      </div>

      <div className={styles.workflowConditionLayout}>
        <div className={styles.workflowConditionForm}>
          <div className={styles.workflowColumnHeader}>
            <strong>{getMsg('LotteryPage.conditionInputHeading')}</strong>
            <span>{getMsg('LotteryPage.conditionInputDescription')}</span>
          </div>
          <div className={styles.workflowFormGrid}>
            <div className={shared.formGroup}>
              <span className={shared.formLabel}>{getMsg('LotteryPage.lotteryCount')}</span>
              <CounterControl label={getMsg('LotteryPage.lotteryCount')} value={lotteryCount} min={1} disabled={readOnly} onChange={onLotteryCountChange} />
            </div>

            <div className={styles.workflowInlineCard}>
              <div className={styles.workflowInlineCard__header}>
                <strong>{getMsg('LotteryPage.guaranteedWinners')}</strong>
                <span className={styles.workflowInlineCard__meta}>{getMsg('LotteryPage.totalWinnerCount', { count: totalWinners })}</span>
                <button type="button" className={shared.btnSecondary} disabled={readOnly} onClick={onOpenGuaranteedSelect}>{getMsg('LotteryPage.selectGuaranteedWinners')}</button>
              </div>
              <div className={styles.workflowInlineCard__body}>
                <div className={styles.workflowInlineCard__winnerList} role="group" aria-label={getMsg('LotteryPage.guaranteedWinners')}>
                  {guaranteedWinners.length > 0
                    ? visibleGuaranteedWinners.map((winner) => {
                        const displayXId = formatXAccountIdForDisplay(winner.x_id);
                        const label = winner.name || displayXId;
                        const accessibleLabel = getMsg('LotteryPage.guaranteedWinnerAriaLabel', {
                          label,
                          xId: displayXId,
                        });
                        return (
                          <span key={winner.x_id} className={styles.workflowInlineCard__winnerChip} role="group" aria-label={accessibleLabel}>
                            <span className={styles.workflowInlineCard__winnerName}>{label}</span>
                            {winner.name && <span className={styles.workflowInlineCard__winnerId}>{displayXId}</span>}
                          </span>
                        );
                      })
                    : getMsg('LotteryPage.noGuaranteedWinners')}
                </div>
                {hiddenGuaranteedWinnerCount > 0 && (
                  <button type="button" className={`${styles.workflowInlineCard__winnerChip} ${styles.workflowInlineCard__winnerChipMore}`} aria-label={hiddenGuaranteedWinnersAriaLabel} disabled={readOnly} onClick={onOpenGuaranteedSelect}>+{hiddenGuaranteedWinnerCount}</button>
                )}
              </div>
            </div>

            <div className={`${shared.formGroup} ${styles.workflowFormWide}`}>
              <span id={matchingTypeLabelId} className={shared.formLabel}>{getMsg('LotteryPage.matchingType')}</span>
              <div className={styles.matchingTypeOptions} role="group" aria-labelledby={matchingTypeLabelId}>
                {MATCHING_TYPE_CODES.map((code) => (
                  <MatchingTypeOptionButton key={code} code={code} selected={matchingTypeCode === code} disabled={readOnly} onSelect={onMatchingTypeChange} />
                ))}
              </div>
            </div>

            <div className={styles.workflowVariableSettings}>
              {isLotteryOnlyMode ? (
                /* M000 は、抽選のみで完了する方式の説明を表示する。 */
                <div className={`${styles.m003SettingsSlot} ${styles.m003SettingsSlotInactive} ${styles.workflowLotteryOnlySlot}`}>
                  <div className={styles.m003SettingsPlaceholder}>{getMsg('LotteryPage.lotteryOnlyDescription')}</div>
                </div>
              ) : (
                /* M001〜M003 は、後続のマッチング条件を表示する。 */
                <>
                  <div className={shared.formGroup}>
                    <span className={shared.formLabel}>{getMsg('LotteryPage.rotationCount')}</span>
                    <CounterControl label={getMsg('LotteryPage.rotationCount')} value={rotationCount} min={1} disabled={readOnly} onChange={onRotationCountChange} />
                  </div>

                  <div className={shared.formGroup}>
                    <span className={shared.formLabel}>{getMsg('LotteryPage.totalTables')}</span>
                    <CounterControl label={getMsg('LotteryPage.totalTables')} value={totalTables} min={1} disabled={readOnly} onChange={onTotalTablesChange} />
                  </div>

                  <div className={m003SettingsSlotClassName}>
                    {matchingTypeCode === 'M003' ? (
                      /* M003 は、グループ制固有の条件を表示する。 */
                      <>
                        <div className={styles.m003SettingsGrid}>
                          <div className={shared.formGroup}>
                            <span className={shared.formLabel}>{getMsg('LotteryPage.guestsPerTable')}</span>
                            <CounterControl label={getMsg('LotteryPage.guestsPerTable')} value={usersPerTable} min={1} disabled={readOnly} onChange={onUsersPerTableChange} />
                          </div>

                          <div className={shared.formGroup}>
                            <span className={shared.formLabel}>{getMsg('LotteryPage.castsPerRotation')}</span>
                            <CounterControl label={getMsg('LotteryPage.castsPerRotation')} value={castsPerRotation} min={1} disabled={readOnly} onChange={onCastsPerRotationChange} />
                          </div>
                        </div>

                        <div className={styles.sameDaySlotPanel}>
                          <div className={styles.sameDaySlotSetting}>
                            <span id={sameDaySlotToggleLabelId} className={shared.formLabel}>{getMsg('LotteryPage.includeSameDaySlots')}</span>
                            <button type="button" className={workflowSwitchClassName} role="switch" aria-checked={allowM003EmptySeats} aria-labelledby={sameDaySlotToggleLabelId} disabled={readOnly} onClick={onAllowM003EmptySeatsToggle}><span className={styles.workflowSwitch__knob} aria-hidden /><span className={styles.workflowSwitchStatus}>{allowM003EmptySeats ? getMsg('LotteryPage.include') : getMsg('LotteryPage.doNotInclude')}</span></button>
                          </div>

                          <div className={sameDaySlotControlClassName}>
                            <span className={shared.formLabel}>{getMsg('LotteryPage.sameDaySlotCount')}</span>
                            <CounterControl label={getMsg('LotteryPage.sameDaySlotCount')} value={m003SameDaySlotCount} min={allowM003EmptySeats ? 1 : 0} disabled={readOnly || !allowM003EmptySeats} className={styles.sameDaySlotCounter} onChange={onSameDaySlotCountChange} />
                          </div>
                        </div>
                      </>
                    ) : (
                      /* M001・M002 は、グループ制向け設定の説明を表示する。 */
                      <div className={styles.m003SettingsPlaceholder}>{getMsg('LotteryPage.groupMatchingDescription')}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <aside className={styles.workflowConditionStatus}>
          <LotteryValidationPanel
            validation={validation}
            title={getMsg('LotteryPage.statusTitle')}
            description={getMsg('LotteryPage.statusDescription')}
            onRunClick={onRunLottery}
            runDisabled={readOnly}
          />
        </aside>
      </div>
    </section>
  );
};
