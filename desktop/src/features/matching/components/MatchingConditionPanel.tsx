import React from 'react';
import { useAppContext } from '@/stores/AppContext';
import { MATCHING_TYPE_CODES_SELECTABLE, MATCHING_TYPE_LABELS } from '@/features/matching/types/matching-type-codes';
import shared from '@/styles/shared.module.css';

interface MatchingConditionPanelProps {
  disabled?: boolean;
}

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

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
          <select
            value={matchingTypeCode}
            disabled={disabled}
            onChange={(event) => setMatchingTypeCode(event.target.value as typeof matchingTypeCode)}
            className={shared.formInput}
          >
            {MATCHING_TYPE_CODES_SELECTABLE.map((code) => (
              <option key={code} value={code}>
                {MATCHING_TYPE_LABELS[code]}
              </option>
            ))}
          </select>
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

        {isMultipleMode && (
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
          </>
        )}

        <label className={shared.formGroup}>
          <span className={shared.formLabel}>NG判定</span>
          <select
            value={matchingSettings.ngJudgmentType}
            disabled={disabled}
            onChange={(event) =>
              setMatchingSettings((prev) => ({
                ...prev,
                ngJudgmentType: event.target.value as typeof prev.ngJudgmentType,
              }))
            }
            className={shared.formInput}
          >
            <option value="either">ユーザー名 + ID</option>
            <option value="username">ユーザー名</option>
            <option value="accountId">ID</option>
          </select>
        </label>

        <label className={shared.formGroup}>
          <span className={shared.formLabel}>探索モード</span>
          <select
            value={matchingSettings.searchMode}
            disabled={disabled}
            onChange={(event) =>
              setMatchingSettings((prev) => ({
                ...prev,
                searchMode: event.target.value as typeof prev.searchMode,
              }))
            }
            className={shared.formInput}
          >
            <option value="efficiency">効率モード（条件到達で即採用）</option>
            <option value="quality">品質モード（時間内で最良を採用）</option>
          </select>
        </label>

        <p className={shared.pageHeaderSubtitle} style={{ margin: 0 }}>
          キャストごとのNG対象はマッチング時に自動除外します。
        </p>
      </div>
    </section>
  );
};
