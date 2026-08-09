// 抽選条件の入力、確定当選者の要約、条件検証を表示する。

import React, { useId } from 'react';
import type { UserBean } from '@/common/types/entities';
import type { SameDaySlotUnit } from '@/common/types/sessionWorkflow';
import { CounterControl } from '@/components/CounterControl';
import {
  MATCHING_TYPE_LABELS,
  type MatchingTypeCode,
} from '@/features/matching/types/matching-type-codes';
import { getMsg } from '@/messages/getMsg';
import type { LotteryValidationResult } from '../services/lottery-validation';
import { LotteryValidationPanel } from './LotteryValidationPanel';
import styles from '../LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

const MATCHING_TYPE_DISPLAY_ORDER: readonly MatchingTypeCode[] = ['M002', 'M001', 'M003', 'M000'];

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
  reserveSameDaySlots: boolean;
  sameDaySlotCount: number;
  sameDaySlotUnit: SameDaySlotUnit;
  validation: LotteryValidationResult;
  readOnly?: boolean;
  runDisabled?: boolean;
  onLotteryCountChange: (value: number) => void;
  onOpenGuaranteedSelect: () => void;
  onMatchingTypeChange: (code: MatchingTypeCode) => void;
  onRotationCountChange: (value: number) => void;
  onTotalTablesChange: (value: number) => void;
  onUsersPerTableChange: (value: number) => void;
  onCastsPerRotationChange: (value: number) => void;
  onReserveSameDaySlotsToggle: () => void;
  onSameDaySlotCountChange: (value: number) => void;
  onSameDaySlotUnitChange: (value: SameDaySlotUnit) => void;
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
  reserveSameDaySlots,
  sameDaySlotCount,
  sameDaySlotUnit,
  validation,
  readOnly = false,
  runDisabled,
  onLotteryCountChange,
  onOpenGuaranteedSelect,
  onMatchingTypeChange,
  onRotationCountChange,
  onTotalTablesChange,
  onUsersPerTableChange,
  onCastsPerRotationChange,
  onReserveSameDaySlotsToggle,
  onSameDaySlotCountChange,
  onSameDaySlotUnitChange,
  onRunLottery,
}) => {
  const isLotteryOnlyMode = matchingTypeCode === 'M000';
  const isGroupMode = matchingTypeCode === 'M003';
  const matchingSettingsSlotClassName = [
    styles.m003SettingsSlot,
    isGroupMode ? '' : styles.m003SettingsSlotInactive,
  ].filter(Boolean).join(' ');
  const workflowSwitchClassName = [
    styles.workflowSwitch,
    reserveSameDaySlots ? styles.workflowSwitchOn : '',
  ].filter(Boolean).join(' ');
  const sameDaySlotControlClassName = [
    styles.sameDaySlotControl,
    reserveSameDaySlots ? '' : styles.sameDaySlotControlDisabled,
  ].filter(Boolean).join(' ');
  const matchingTypeLabelId = useId();
  const sameDaySlotToggleLabelId = useId();
  const sameDaySlotUnitLabelId = useId();
  const sameDaySlotCountLabel = getMsg(isGroupMode && sameDaySlotUnit === 'person'
    ? 'LotteryPage.sameDayPersonCount'
    : 'LotteryPage.sameDayTableCount');

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
              <p className={styles.workflowInlineCard__registrationCount}>{getMsg('LotteryPage.guaranteedWinnerRegisteredCount', { count: guaranteedWinners.length })}</p>
            </div>

            <div className={`${shared.formGroup} ${styles.workflowFormWide}`}>
              <span id={matchingTypeLabelId} className={shared.formLabel}>{getMsg('LotteryPage.matchingType')}</span>
              <div className={styles.matchingTypeOptions} role="group" aria-labelledby={matchingTypeLabelId}>
                {MATCHING_TYPE_DISPLAY_ORDER.map((code) => (
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

                  <div className={matchingSettingsSlotClassName}>
                    {/* M003 は、グループ制固有の条件を追加表示する。 */}
                    {isGroupMode && (
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
                    )}

                    <div className={styles.sameDaySlotPanel}>
                      <div className={styles.sameDaySlotSetting}>
                        <span id={sameDaySlotToggleLabelId} className={shared.formLabel}>{getMsg('LotteryPage.reserveSameDaySlots')}</span>
                        <button type="button" className={workflowSwitchClassName} role="switch" aria-checked={reserveSameDaySlots} aria-labelledby={sameDaySlotToggleLabelId} disabled={readOnly} onClick={onReserveSameDaySlotsToggle}><span className={styles.workflowSwitch__knob} aria-hidden /><span className={styles.workflowSwitchStatus}>{reserveSameDaySlots ? getMsg('LotteryPage.reserve') : getMsg('LotteryPage.doNotReserve')}</span></button>
                      </div>

                      <div className={sameDaySlotControlClassName}>
                        <span className={shared.formLabel}>{sameDaySlotCountLabel}</span>
                        <CounterControl label={sameDaySlotCountLabel} value={sameDaySlotCount} min={reserveSameDaySlots ? 1 : 0} disabled={readOnly || !reserveSameDaySlots} className={styles.sameDaySlotCounter} onChange={onSameDaySlotCountChange} />
                      </div>

                      {isGroupMode ? (
                        <div className={`${styles.sameDaySlotUnitSetting} ${reserveSameDaySlots ? '' : styles.sameDaySlotControlDisabled}`}>
                          <span id={sameDaySlotUnitLabelId} className={shared.formLabel}>{getMsg('LotteryPage.sameDaySlotUnit')}</span>
                          <div className={styles.sameDaySlotUnitOptions} role="group" aria-labelledby={sameDaySlotUnitLabelId}>
                            {(['person', 'table'] as const).map((unit) => (
                              <button key={unit} type="button" className={`${styles.sameDaySlotUnitOption} ${sameDaySlotUnit === unit ? styles.sameDaySlotUnitOptionSelected : ''}`} aria-pressed={sameDaySlotUnit === unit} disabled={readOnly || !reserveSameDaySlots} onClick={() => onSameDaySlotUnitChange(unit)}>{getMsg(unit === 'person' ? 'LotteryPage.sameDaySlotUnitPerson' : 'LotteryPage.sameDaySlotUnitTable')}</button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className={styles.sameDaySlotUnitNote}>{getMsg('LotteryPage.sameDaySlotTableNote')}</p>
                      )}
                    </div>
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
            runDisabled={runDisabled ?? readOnly}
          />
        </aside>
      </div>
    </section>
  );
};
