// 未捕捉の描画エラーを捕捉し、利用者向け案内へ切り替える。

import React from 'react';
import { getMsg } from '@/messages/getMsg';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorPage}>
          <div className={styles.errorPanel}>
            <h1 className={styles.errorHeading}>{getMsg('ErrorBoundary.heading')}</h1>
            <p className={styles.errorGuidance}>{getMsg('ErrorBoundary.guidance')}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
