// 確定当選者の選択一覧を表示し、対象X IDを直接通知する。

import React from 'react';
import type { UserBean } from '@/common/types/entities';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import { AppDialog } from '@/components/AppDialog';
import dialogStyles from '@/components/ConfirmModal.module.css';
import { getMsg } from '@/messages/getMsg';
import styles from '../LotteryPage.module.css';
import shared from '@/styles/shared.module.css';

function getGuaranteedApplicantClassName(isSelected: boolean): string {
  return [
    styles.guaranteedSelectModalList__item,
    isSelected ? styles.guaranteedSelectModalList__itemSelected : '',
  ].filter(Boolean).join(' ');
}

interface GuaranteedApplicantButtonProps {
  user: UserBean;
  selected: boolean;
  onToggle: (xId: string) => Promise<void>;
}

function GuaranteedApplicantButton({ user, selected, onToggle }: GuaranteedApplicantButtonProps) {
  const handleClick = () => { void onToggle(user.x_id); };
  const displayXId = formatXAccountIdForDisplay(user.x_id);
  const displayName = user.name || displayXId;

  return (
    <button type="button" aria-pressed={selected} className={getGuaranteedApplicantClassName(selected)} onClick={handleClick}>
      <span className={styles.guaranteedSelectModalList__check}>{selected ? getMsg('LotteryPage.selected') : getMsg('LotteryPage.notSelected')}</span>
      <span className={styles.guaranteedSelectModalList__name}>{displayName}</span>
      <span className={styles.guaranteedSelectModalList__id}>{displayXId}</span>
    </button>
  );
}

interface GuaranteedWinnerDialogProps {
  applicants: readonly UserBean[];
  guaranteedIds: ReadonlySet<string>;
  guaranteedCount: number;
  totalWinners: number;
  onClose: () => void;
  onToggle: (xId: string) => Promise<void>;
}

export const GuaranteedWinnerDialog: React.FC<GuaranteedWinnerDialogProps> = ({
  applicants,
  guaranteedIds,
  guaranteedCount,
  totalWinners,
  onClose,
  onToggle,
}) => {
  const guaranteedSelectionMessage = getMsg('LotteryPage.guaranteedSelectionMessage', {
    guaranteedCount,
    totalWinners,
  });
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <AppDialog
      open
      onOpenChange={handleOpenChange}
      title={getMsg('LotteryPage.guaranteedSelectionTitle')}
      description={guaranteedSelectionMessage}
      descriptionClassName={dialogStyles.modalMessage}
      className={styles.guaranteedSelectModalContent}
    >
      <div className={styles.guaranteedSelectModalList}>
        <div className={`${styles.guaranteedSelectModalList__scroll} ${shared.customScrollbar}`}>
          {applicants.map((user) => (
            <GuaranteedApplicantButton key={user.x_id} user={user} selected={guaranteedIds.has(user.x_id)} onToggle={onToggle} />
          ))}
        </div>
      </div>
      <footer className={dialogStyles.modalButtons}>
        <button type="button" className={`${shared.btnPrimary} ${dialogStyles.modalBtnAction}`} onClick={onClose}>{getMsg('common.close')}</button>
      </footer>
    </AppDialog>
  );
};
