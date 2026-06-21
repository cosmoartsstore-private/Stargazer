import React from 'react';
import { AppDialog } from '@/components/AppDialog';
import styles from './ConfirmModal.module.css';
import shared from '@/styles/shared.module.css';

/** ポップアップメッセージ用モーダル（alert / confirm でUI統一）。Radix Dialog ベースでフォーカス管理・Esc 閉じを提供。 */
interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  /** 省略時: type=alert → 「お知らせ」、type=confirm → 「確認」 */
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'confirm' | 'alert';
  confirmDisabled?: boolean;
  size?: 'default' | 'wide' | 'extraWide';
  /** 特定機能だけでモーダル本体の寸法や余白を調整するための追加クラス。 */
  contentClassName?: string;
  /** message の下に追加で表示するカスタムコンテンツ */
  children?: React.ReactNode;
}

const DEFAULT_TITLE_ALERT = 'お知らせ';
const DEFAULT_TITLE_CONFIRM = '確認';

function getModalContentClass(size: ConfirmModalProps['size']): string {
  if (size === 'extraWide') return styles.modalContentExtraWide;
  if (size === 'wide') return styles.modalContentWide;
  return '';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  message,
  onConfirm,
  onCancel,
  title,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  type = 'confirm',
  confirmDisabled = false,
  size = 'default',
  contentClassName = '',
  children,
}) => {
  const displayTitle = title ?? (type === 'alert' ? DEFAULT_TITLE_ALERT : DEFAULT_TITLE_CONFIRM);
  const open = true;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    if (type === 'confirm' && onCancel) {
      onCancel();
    } else {
      onConfirm();
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={displayTitle}
      description={message}
      descriptionClassName={styles.modalMessage}
      className={`${getModalContentClass(size)}${contentClassName ? ` ${contentClassName}` : ''}`}
    >
      {children}
      <div className={styles.modalButtons}>
        {type === 'confirm' && onCancel && (
          <button type="button" className={styles.modalBtnCancel} onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
        <button type="button" className={`${shared.btnPrimary} ${styles.modalBtnConfirm}`} onClick={onConfirm} disabled={confirmDisabled}>
          {confirmLabel}
        </button>
      </div>
    </AppDialog>
  );
};
