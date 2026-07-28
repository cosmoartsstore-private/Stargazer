import React from 'react';
import { RotationMatchList } from './MatchingResultCells';
import type { TableSlotGroup } from '../presenters/matching-result-view';
import { getMsg } from '@/messages/getMsg';
import styles from '../MatchingPage.module.css';
import shared from '@/styles/shared.module.css';

interface MatchingTableRowsProps {
  groups: TableSlotGroup[];
}

/** テーブル別マッチング結果を、席単位の表行として表示する。 */
export const MatchingTableRows: React.FC<MatchingTableRowsProps> = ({ groups }) => (
  <>
    {groups.flatMap(({ tableIndex, slots }) => slots.map((slot, index) => (
      <tr key={`${tableIndex}-${index}`}>
        <td className={`${shared.tableCell} ${styles.matchingResultTable__table}`}>{getMsg('MatchingPage.tableNumber', { number: tableIndex })}</td>
        <td className={`${shared.tableCell} ${styles.matchingResultTable__seat}`}>{index + 1}</td>
        <td className={`${shared.tableCell} ${styles.matchingResultTable__guest}`}>{slot.user?.name ?? getMsg('MatchingPage.emptySeat')}</td>
        <td className={`${shared.tableCell} ${styles.matchingResultTable__id}`}>{slot.user?.x_id ?? getMsg('MatchingPage.unassigned')}</td>
        <td className={`${shared.tableCell} ${styles.matchingResultTable__matches}`}>
          {slot.matches.length === 0 ? (
            /* 割り当てキャストがいない席 */
            <span className={styles.castResultEmpty}>{getMsg('MatchingPage.castUnassigned')}</span>
          ) : (
            /* 回ごとの割り当てキャスト一覧 */
            <RotationMatchList matches={slot.matches} />
          )}
        </td>
      </tr>
    )))}
  </>
);
