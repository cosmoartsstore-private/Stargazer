// Radix Dialog を基盤に、共通のモーダル構造と閉じる操作を提供する。

import * as Dialog from '@radix-ui/react-dialog';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { X } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from './AppDialog.module.css';

interface AppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  contentStyle?: CSSProperties;
  titleClassName?: string;
  headerClassName?: string;
  descriptionClassName?: string;
  closeClassName?: string;
  showClose?: boolean;
  useDefaultContentClass?: boolean;
  /** OSの色選択など、モーダル外部の補助UIを操作する画面だけ外部操作で閉じないようにする。 */
  closeOnInteractOutside?: boolean;
}

export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
  contentStyle,
  titleClassName = '',
  headerClassName = '',
  descriptionClassName = '',
  closeClassName = '',
  showClose = false,
  useDefaultContentClass = true,
  closeOnInteractOutside = true,
}: AppDialogProps) {
  // ポータル配置先、aria属性、追加クラスを公開propsから導出する。
  const modalContainer =
    typeof document !== 'undefined' ? (document.getElementById('modal-root') ?? document.body) : undefined;
  const contentClassName = useDefaultContentClass
    ? `${shared.modalContent}${className ? ` ${className}` : ''}`
    : className;
  const descriptionProps: { 'aria-describedby'?: undefined } =
    description == null ? { 'aria-describedby': undefined } : {};
  const titleClass = `${shared.modalTitle}${showClose ? ` ${styles.dialogTitle}` : ''}${
    titleClassName ? ` ${titleClassName}` : ''
  }`;
  const headerClass = `${styles.dialogHeader}${headerClassName ? ` ${headerClassName}` : ''}`;
  const closeButtonClass = `${styles.dialogClose}${closeClassName ? ` ${closeClassName}` : ''}`;
  const titleNode = <Dialog.Title className={titleClass}>{title}</Dialog.Title>;

  // 外部操作で閉じない画面だけRadixの既定イベントを抑止する。
  const handleInteractOutside: ComponentProps<typeof Dialog.Content>['onInteractOutside'] =
    closeOnInteractOutside ? undefined : (event) => event.preventDefault();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={modalContainer}>
        <Dialog.Overlay className={shared.modalOverlay}>
          <Dialog.Content className={contentClassName} style={contentStyle} onInteractOutside={handleInteractOutside} {...descriptionProps}>
            {showClose ? (
              /* 閉じるボタン付きの共通ヘッダー */
              <div className={headerClass}>
                {titleNode}
                <Dialog.Close asChild>
                  <button type="button" className={closeButtonClass} aria-label={getMsg('common.close')}><X size={18} /></button>
                </Dialog.Close>
              </div>
            ) : (
              /* 閉じるボタンを持たないタイトル表示 */
              titleNode
            )}
            {description != null && (
              <Dialog.Description className={descriptionClassName}>{description}</Dialog.Description>
            )}
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
