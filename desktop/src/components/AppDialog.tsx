import * as Dialog from '@radix-ui/react-dialog';
import type { CSSProperties, ReactNode } from 'react';
import { X } from '@/common/icons';
import shared from '@/styles/shared.module.css';
import styles from './AppDialog.module.css';

interface AppDialogProps {
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
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
}

export function AppDialog({
  open = true,
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
}: AppDialogProps) {
  const modalContainer =
    typeof document !== 'undefined' ? (document.getElementById('modal-root') ?? document.body) : undefined;
  const contentClassName = useDefaultContentClass
    ? `${shared.modalContent}${className ? ` ${className}` : ''}`
    : className;
  const descriptionProps: { 'aria-describedby'?: undefined } =
    description == null ? { 'aria-describedby': undefined } : {};
  const titleNode = title == null ? null : (
    <Dialog.Title className={`${shared.modalTitle}${showClose ? ` ${styles.dialogTitle}` : ''}${titleClassName ? ` ${titleClassName}` : ''}`}>
      {title}
    </Dialog.Title>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={modalContainer}>
        <Dialog.Overlay className={shared.modalOverlay}>
          <Dialog.Content
            className={contentClassName}
            style={contentStyle}
            {...descriptionProps}
          >
            {showClose ? (
              <div className={`${styles.dialogHeader}${headerClassName ? ` ${headerClassName}` : ''}`}>
                {titleNode}
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className={`${styles.dialogClose}${closeClassName ? ` ${closeClassName}` : ''}`}
                    aria-label="閉じる"
                  >
                    <X size={18} />
                  </button>
                </Dialog.Close>
              </div>
            ) : (
              titleNode
            )}
            {description != null && (
              <Dialog.Description className={descriptionClassName}>
                {description}
              </Dialog.Description>
            )}
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
