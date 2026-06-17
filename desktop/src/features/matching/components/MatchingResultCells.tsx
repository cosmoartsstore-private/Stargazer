import React from 'react';
import type { MatchedCast } from '@/features/matching/logics/matching-io';
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
  const preference = getMatchPreference(match);
  return (
    <span className={getMatchChipClassName(match)} title={match.ngReason ?? `${match.cast.name}: ${preference.label}`}>
      <span className={styles.matchChipName}>{match.cast.name}</span>
      <span className={styles.matchChipRank}>{preference.label}</span>
    </span>
  );
};

export const RotationMatchList: React.FC<{ matches: MatchedCast[] }> = ({ matches }) => {
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
    return <span className={styles.castResultEmpty}>なし</span>;
  }

  return (
    <div className={styles.applicantAssignmentList}>
      {assignments.map((assignment) => {
        const preference = getMatchPreference(assignment.match);
        return (
          <div
            key={`${assignment.user.x_id}-${assignment.match.cast.name}-${assignment.match.rotationIndex ?? 'none'}`}
            className={getApplicantAssignmentClassName(assignment.match)}
            title={assignment.match.ngReason ?? `${assignment.user.name}: ${preference.label}`}
          >
            <span className={styles.applicantAssignmentName}>{assignment.user.name}</span>
            <span className={styles.applicantAssignmentId}>{assignment.user.x_id}</span>
            <span className={styles.applicantAssignmentRank}>{preference.label}</span>
          </div>
        );
      })}
    </div>
  );
};
