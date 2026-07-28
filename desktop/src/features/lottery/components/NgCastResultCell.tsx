// 抽選結果で応募者とNG関係にあるキャスト情報を表示します。

import React from 'react';
import { getMsg } from '@/messages/getMsg';
import styles from './NgCastResultCell.module.css';

export const NgCastResultCell: React.FC<{ ngCastNames: string[] }> = ({ ngCastNames }) => {
  if (ngCastNames.length === 0) {
    return <span className={styles.ngNone}>—</span>;
  }

  // 表示件数に応じた短い文言と、読み上げ用の全キャスト名を用意する。
  const label = ngCastNames.length === 1
    ? ngCastNames[0]
    : getMsg('NgCastResultCell.multipleCastLabel', { count: ngCastNames.length });
  const accessibleLabel = getMsg('NgCastResultCell.castNamesAriaLabel', {
    names: ngCastNames.join(getMsg('NgCastResultCell.nameSeparator')),
  });

  return <span className={styles.ngBadge} role="note" aria-label={accessibleLabel}>{label}</span>;
};
