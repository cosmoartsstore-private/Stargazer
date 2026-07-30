// マッチング結果をローテーション別・キャスト別に表示するセル群を提供します。

import React from 'react';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import type { MatchedCast } from '@/features/matching/logics/matching-io';
import { getMsg } from '@/messages/getMsg';
import {
  getMatchPreference,
  getRotationLabel,
  groupMatchesByRotation,
  type CastResultAssignment,
  type MatchPreferenceTone,
} from '@/features/matching/presenters/matching-result-view';
import styles from './MatchingResultCells.module.css';

function getMatchChipClassName(match: MatchedCast): string {
  const preference = getMatchPreference(match);
  const toneClassMap: Record<MatchPreferenceTone, string> = {
    First: styles.matchChipFirst,
    Second: styles.matchChipSecond,
    Third: styles.matchChipThird,
    Flat: styles.matchChipFlat,
    Outside: styles.matchChipOutside,
  };
  return [
    styles.matchChip,
    toneClassMap[preference.tone],
    match.isNGWarning ? styles.matchChipNg : '',
  ].filter(Boolean).join(' ');
}

function getApplicantAssignmentClassName(match: MatchedCast): string {
  const preference = getMatchPreference(match);
  const toneClassMap: Record<MatchPreferenceTone, string> = {
    First: styles.applicantAssignmentFirst,
    Second: styles.applicantAssignmentSecond,
    Third: styles.applicantAssignmentThird,
    Flat: styles.applicantAssignmentFlat,
    Outside: styles.applicantAssignmentOutside,
  };
  return [
    styles.applicantAssignment,
    toneClassMap[preference.tone],
    match.isNGWarning ? styles.applicantAssignmentNg : '',
  ].filter(Boolean).join(' ');
}

const MatchChip: React.FC<{ match: MatchedCast }> = ({ match }) => {
  // 順位とNG理由から、チップの配色と読み上げ内容を導出する。
  const preference = getMatchPreference(match);
  const matchChipClassName = getMatchChipClassName(match);
  const accessibleLabel = match.ngReason
    ? getMsg('MatchingResultCells.matchWithNgAriaLabel', {
      castName: match.cast.name,
      preference: preference.label,
      reason: match.ngReason,
    })
    : getMsg('MatchingResultCells.matchAriaLabel', {
      castName: match.cast.name,
      preference: preference.label,
    });

  return (
    <span className={matchChipClassName} role="group" aria-label={accessibleLabel}>
      <span className={styles.matchChipName}>{match.cast.name}</span>
      <span className={styles.matchChipRank}>{preference.label}</span>
      {match.ngReason && (
        <span className={styles.matchChipNgReason}>{getMsg('MatchingResultCells.ngReason', { reason: match.ngReason })}</span>
      )}
    </span>
  );
};

export const RotationMatchList: React.FC<{ matches: MatchedCast[] }> = ({ matches }) => {
  // 割り当てをローテーション別の表示グループへ変換する。
  const groups = groupMatchesByRotation(matches);

  return (
    <div className={styles.matchRotationStack}>
      {groups.map((group) => (
        <div key={group.rotationIndex ?? 'ungrouped'} className={styles.matchRotationGroup}>
          <span className={styles.matchRotationLabel}>{getRotationLabel(group.rotationIndex)}</span>
          <div className={styles.matchChipList}>
            {group.matches.map((match, index) => (
              <MatchChip key={`${group.rotationIndex ?? 'ungrouped'}-${match.cast.name}-${index}`} match={match} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export const CastAssignmentList: React.FC<{ assignments: CastResultAssignment[] }> = ({ assignments }) => {
  if (assignments.length === 0) {
    return <span className={styles.castResultEmpty}>{getMsg('common.none')}</span>;
  }

  return (
    <div className={styles.applicantAssignmentList}>
      {assignments.map((assignment) => {
        // 応募者ごとの順位とNG理由を、表示クラスと読み上げ文へ変換する。
        const preference = getMatchPreference(assignment.match);
        const accessibleLabel = assignment.match.ngReason
          ? getMsg('MatchingResultCells.assignmentWithNgAriaLabel', {
            applicantName: assignment.user.name,
            preference: preference.label,
            reason: assignment.match.ngReason,
          })
          : getMsg('MatchingResultCells.assignmentAriaLabel', {
            applicantName: assignment.user.name,
            preference: preference.label,
          });
        const assignmentClassName = getApplicantAssignmentClassName(assignment.match);
        return (
          <div
            key={`${assignment.user.x_id}-${assignment.match.cast.name}-${assignment.match.rotationIndex ?? 'none'}`}
            className={assignmentClassName}
            role="group"
            aria-label={accessibleLabel}
          >
            <span className={styles.applicantAssignmentName}>{assignment.user.name}</span>
            <span className={styles.applicantAssignmentId}>{formatXAccountIdForDisplay(assignment.user.x_id)}</span>
            <span className={styles.applicantAssignmentRank}>{preference.label}</span>
            {assignment.match.ngReason && (
              <span className={styles.applicantAssignmentNgReason}>{getMsg('MatchingResultCells.ngReason', { reason: assignment.match.ngReason })}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
