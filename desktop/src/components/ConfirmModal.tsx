// 通知と確認を、操作結果の異なるメッセージダイアログとして提供する。

import type { ReactNode } from 'react';
import { AppDialog } from '@/components/AppDialog';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from './ConfirmModal.module.css';

interface MessageDialogProps {
  title: string;
  message: string;
  onOpenChange: (open: boolean) => void;
  actions: ReactNode;
}

interface NoticeDialogProps {
  title: string;
  message: string;
  onClose: () => void;
  closeLabel?: string;
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  intent?: 'default' | 'danger';
}

function MessageDialog({ title, message, onOpenChange, actions }: MessageDialogProps) {
  return (
    <AppDialog
      open
      onOpenChange={onOpenChange}
      title={title}
      description={message}
      className={styles.messageDialog}
      descriptionClassName={styles.modalMessage}
    >
      <footer className={styles.modalButtons}>{actions}</footer>
    </AppDialog>
  );
}

export function NoticeDialog({
  title,
  message,
  onClose,
  closeLabel = getMsg('common.close'),
}: NoticeDialogProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <MessageDialog
      title={title}
      message={message}
      onOpenChange={handleOpenChange}
      actions={(
        <button type="button" className={`${shared.btnPrimary} ${styles.modalBtnAction}`} onClick={onClose}>{closeLabel}</button>
      )}
    />
  );
}

export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = getMsg('common.ok'),
  cancelLabel = getMsg('common.cancel'),
  confirmDisabled = false,
  intent = 'default',
}: ConfirmDialogProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open) onCancel();
  };
  const confirmClassName = `${intent === 'danger' ? shared.btnDanger : shared.btnPrimary} ${styles.modalBtnAction}`;

  return (
    <MessageDialog
      title={title}
      message={message}
      onOpenChange={handleOpenChange}
      actions={(
        <>
          <button type="button" className={styles.modalBtnCancel} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={confirmClassName} onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</button>
        </>
      )}
    />
  );
}
