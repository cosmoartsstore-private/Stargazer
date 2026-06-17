import React from 'react';
import { useAppContext } from '@/stores/AppContext';
import { MATCHING_TYPE_CODES_SELECTABLE, MATCHING_TYPE_LABELS } from '@/features/matching/types/matching-type-codes';
import shared from '@/styles/shared.module.css';
import styles from './MatchingConditionPanel.module.css';

interface MatchingConditionPanelProps {
  disabled?: boolean;
}

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

const NG_JUDGMENT_OPTIONS = [
  { value: 'either', label: 'ユーザー名 + ID' },
  { value: 'username', label: 'ユーザー名' },
  { value: 'accountId', label: 'ID' },
] as const;

const SEARCH_MODE_OPTIONS = [
  { value: 'efficiency', label: '効率モード', description: '条件到達で即採用' },
  { value: 'quality', label: '品質モード', description: '時間内で最良を採用' },
] as const;

export const MatchingConditionPanel: React.FC<MatchingConditionPanelProps> = ({
  disabled = false,
}) => {
  const {
    matchingTypeCode,
    setMatchingTypeCode,
    rotationCount,
    setRotationCount,
    totalTables,
    setTotalTables,
    usersPerTable,
    setUsersPerTable,
    castsPerRotation,
    setCastsPerRotation,
    allowM003EmptySeats,
    setAllowM003EmptySeats,
    m003SameDaySlotCount,
    setM003SameDaySlotCount,
    matchingSettings,
    setMatchingSettings,
  } = useAppContext();

  const isMultipleMode = matchingTypeCode === 'M003';

  return (
    <section className={shared.sectionBlock}>
      <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleSm}`} style={{ marginBottom: 16 }}>
        マッチング条件
      </h2>

      <div style={{ display: 'grid', gap: 16 }}>
        <label className={shared.formGroup}>
          <span className={shared.formLabel}>方式</span>
          <div className={styles.optionGrid}>
            {MATCHING_TYPE_CODES_SELECTABLE.map((code) => (
              <button
                key={code}
                type="button"
                className={`${styles.optionButton}${matchingTypeCode === code ? ` ${styles.optionButtonSelected}` : ''}`}
                disabled={disabled}
                onClick={() => setMatchingTypeCode(code)}
              >
                {MATCHING_TYPE_LABELS[code]}
              </button>
            ))}
          </div>
        </label>

        <label className={shared.formGroup}>
          <span className={shared.formLabel}>ラウンド数</span>
          <input
            type="number"
            min={1}
            className={shared.formInput}
            value={rotationCount}
            disabled={disabled}
            onChange={(event) => setRotationCount(clampPositive(Number(event.target.value), 1))}
          />
        </label>

        <label className={shared.formGroup}>
          <span className={shared.formLabel}>テーブル数</span>
          <input
            type="number"
            min={1}
            className={shared.formInput}
            value={totalTables}
            disabled={disabled}
            onChange={(event) => setTotalTables(clampPositive(Number(event.target.value), 1))}
          />
        </label>

        <div className={`${styles.m003SettingsSlot}${isMultipleMode ? '' : ` ${styles.m003SettingsSlotInactive}`}`}>
          {isMultipleMode ? (
            <>
              <label className={shared.formGroup}>
                <span className={shared.formLabel}>1テーブルあたりのユーザー数</span>
                <input
                  type="number"
                  min={1}
                  className={shared.formInput}
                  value={usersPerTable}
                  disabled={disabled}
                  onChange={(event) => setUsersPerTable(clampPositive(Number(event.target.value), 1))}
                />
              </label>

              <label className={shared.formGroup}>
                <span className={shared.formLabel}>1ラウンドあたりのキャスト数</span>
                <input
                  type="number"
                  min={1}
                  className={shared.formInput}
                  value={castsPerRotation}
                  disabled={disabled}
                  onChange={(event) => setCastsPerRotation(clampPositive(Number(event.target.value), 1))}
                />
              </label>

              <div className={shared.formGroup}>
                <span className={shared.formLabel}>当日枠を含める</span>
                <button
                  type="button"
                  className={`${styles.workflowSwitch}${allowM003EmptySeats ? ` ${styles.workflowSwitchOn}` : ''}`}
                  role="switch"
                  aria-checked={allowM003EmptySeats}
                  disabled={disabled}
                  onClick={() => {
                    const next = !allowM003EmptySeats;
                    setAllowM003EmptySeats(next);
                    if (next && m003SameDaySlotCount < 1) {
                      setM003SameDaySlotCount(1);
                    }
                  }}
                >
                  <span className={styles.workflowSwitchKnob} />
                  <span>{allowM003EmptySeats ? '含める' : '含めない'}</span>
                </button>
                <span className={styles.switchHelpText}>当日枠分の席数を合計席数に追加</span>
                <label className={`${styles.sameDaySlotField}${allowM003EmptySeats ? '' : ` ${styles.sameDaySlotFieldDisabled}`}`}>
                  <span>当日枠数</span>
                  <input
                    type="number"
                    min={1}
                    className={shared.formInput}
                    value={m003SameDaySlotCount}
                    disabled={disabled || !allowM003EmptySeats}
                    onChange={(event) => setM003SameDaySlotCount(clampPositive(Number(event.target.value), 1))}
                  />
                </label>
              </div>
            </>
          ) : (
            <div className={styles.m003SettingsPlaceholder}>
              M003 テーブル制を選択すると、テーブル単位の詳細条件を編集できます。
            </div>
          )}
        </div>

        <label className={shared.formGroup}>
          <span className={shared.formLabel}>NG判定</span>
          <div className={styles.optionGrid}>
            {NG_JUDGMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.optionButton}${matchingSettings.ngJudgmentType === option.value ? ` ${styles.optionButtonSelected}` : ''}`}
                disabled={disabled}
                onClick={() =>
                  setMatchingSettings((prev) => ({
                    ...prev,
                    ngJudgmentType: option.value,
                  }))
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </label>

        <label className={shared.formGroup}>
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

        <p className={shared.pageHeaderSubtitle} style={{ margin: 0 }}>
          キャストごとのNG対象はマッチング時に自動除外します。
        </p>
      </div>
    </section>
  );
};
