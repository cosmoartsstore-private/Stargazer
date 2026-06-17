import React from 'react';
import styles from './NgCastResultCell.module.css';

export const NgCastResultCell: React.FC<{ ngCastNames: string[] }> = ({ ngCastNames }) => {
  if (ngCastNames.length === 0) {
    return <span className={styles.ngNone}>—</span>;
  }
  const label = ngCastNames.length === 1
    ? ngCastNames[0]
    : `${ngCastNames.length}名のキャストがNG`;
  return (
    <span className={styles.ngBadge} title={ngCastNames.join('、')}>
      {label}
    </span>
  );
};
