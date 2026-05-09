import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('Unexpected error in application:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      const message = err instanceof Error ? err.message : String(err ?? '不明なエラー');
      const stack = err instanceof Error ? err.stack : undefined;
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--discord-bg-main)',
            color: 'var(--discord-text-normal)',
            padding: '24px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--discord-bg-dark)',
              borderRadius: 8,
              padding: '24px 32px',
              border: '1px solid var(--discord-border)',
              maxWidth: 560,
              width: '100%',
              textAlign: 'left',
            }}
          >
            <h1 style={{ fontSize: 20, marginBottom: 12, color: 'var(--discord-text-header)' }}>
              予期しないエラーが発生しました
            </h1>
            <p style={{ fontSize: 14, color: 'var(--discord-text-muted)', marginBottom: 8 }}>
              画面を再読み込みしても解消しない場合は、スタッフまでお知らせください。
            </p>
            <details style={{ fontSize: 12, color: 'var(--discord-text-muted)', marginTop: 12 }}>
              <summary style={{ cursor: 'pointer' }}>エラー詳細</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 }}>
                {message}
                {stack ? `\n\n${stack}` : ''}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
