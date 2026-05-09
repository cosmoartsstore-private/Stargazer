import React from 'react';
import styles from './LoadingOverlay.module.css';

interface LoadingOverlayProps {
  message?: string;
  fullscreen?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  message = '読み込み中…',
  fullscreen = false,
}) => (
  <div className={`${styles.loadingOverlay}${fullscreen ? ` ${styles.loadingOverlayFullscreen}` : ''}`}>
    <div className={styles.loadingOverlay__content}>
      <div className={styles.loadingSpinner} />
      <p className={styles.loadingOverlay__message}>{message}</p>
    </div>
  </div>
);
