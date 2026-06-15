import React from 'react';
import styles from './LoadingOverlay.module.css';

interface LoadingOverlayProps {
  message?: string;
  fullscreen?: boolean;
  cancelLabel?: string;
  onCancel?: () => void;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  message = '読み込み中…',
  fullscreen = false,
  cancelLabel = 'キャンセル',
  onCancel,
}) => (
  <div className={`${styles.loadingOverlay}${fullscreen ? ` ${styles.loadingOverlayFullscreen}` : ''}`}>
    <div className={styles.loadingOverlay__content}>
      <div className={styles.loadingSpinner} />
      <p className={styles.loadingOverlay__message}>{message}</p>
      {onCancel && (
        <button type="button" className={styles.loadingOverlay__cancel} onClick={onCancel}>
          {cancelLabel}
        </button>
      )}
    </div>
  </div>
);
