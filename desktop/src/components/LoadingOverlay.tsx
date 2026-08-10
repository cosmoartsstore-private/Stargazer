// 読み込み中の進行表示と任意のキャンセル操作をオーバーレイで提供する。

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useRestoreFocusOnDialogUnmount } from '@/components/AppDialog';
import { getMsg } from '@/messages/getMsg';
import styles from './LoadingOverlay.module.css';

interface LoadingOverlayProps {
  message?: string;
  fullscreen?: boolean;
  cancelLabel?: string;
  onCancel?: () => void;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  message = getMsg('common.loading'),
  fullscreen = false,
  cancelLabel = getMsg('common.cancel'),
  onCancel,
}) => {
  useRestoreFocusOnDialogUnmount();
  // 全画面表示の有無を共通クラスへ反映する。
  const overlayClassName = `${styles.loadingOverlay}${fullscreen ? ` ${styles.loadingOverlayFullscreen}` : ''}`;

  if (onCancel) {
    const handleOpenChange = (open: boolean) => {
      if (!open) onCancel();
    };
    const handleInteractOutside: React.ComponentProps<typeof Dialog.Content>['onInteractOutside'] = (event) => event.preventDefault();

    return (
      <Dialog.Root open onOpenChange={handleOpenChange}>
        <Dialog.Overlay className={overlayClassName}>
          <Dialog.Content className={styles.loadingOverlay__content} aria-describedby={undefined} onInteractOutside={handleInteractOutside}>
            <div className={styles.loadingSpinner} aria-hidden />
            <Dialog.Title className={styles.loadingOverlay__message}>{message}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={styles.loadingOverlay__cancel}>{cancelLabel}</button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
    );
  }

  return (
    <div className={overlayClassName} role="status" aria-live="polite" aria-atomic="true" aria-busy="true">
      <div className={styles.loadingOverlay__content}>
        <div className={styles.loadingSpinner} aria-hidden />
        <p className={styles.loadingOverlay__message}>{message}</p>
      </div>
    </div>
  );
};
