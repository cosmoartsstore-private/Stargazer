import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppContext } from '@/stores/AppContext';
import shared from '@/styles/shared.module.css';

type Status = 'unknown' | 'idle' | 'running';

export const DiscordIntegrationPage: React.FC = () => {
  const { currentEventName, bumpDataReload } = useAppContext();

  const [tokenSaved, setTokenSaved] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [editing, setEditing] = useState<boolean>(false);
  const [botEntry, setBotEntry] = useState<string | null>(null);
  const [botEntryInput, setBotEntryInput] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<boolean>(false);
  const [status, setStatus] = useState<Status>('unknown');
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  const refreshTokenState = useCallback(async () => {
    const exists = await invoke<boolean>('discord_token_exists');
    setTokenSaved(exists);
  }, []);

  const refreshBotEntry = useCallback(async () => {
    const entry = await invoke<string | null>('bot_entry_get');
    setBotEntry(entry);
  }, []);

  const refreshStatus = useCallback(async () => {
    const running = await invoke<boolean>('discord_bot_status');
    setStatus(running ? 'running' : 'idle');
  }, []);

  useEffect(() => {
    refreshTokenState();
    refreshBotEntry();
    refreshStatus();
  }, [refreshTokenState, refreshBotEntry, refreshStatus]);

  useEffect(() => {
    if (status !== 'running') {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(() => {
      void refreshStatus();
    }, 3000);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status, refreshStatus]);

  const flashMessage = (text: string) => {
    setMessage(text);
    setError(null);
    window.setTimeout(() => setMessage(null), 4000);
  };

  const handleSaveToken = async () => {
    if (tokenInput.trim() === '') {
      setError('トークンが空です');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await invoke('discord_token_save', { token: tokenInput.trim() });
      setTokenInput('');
      setEditing(false);
      await refreshTokenState();
      flashMessage('接続キーを保存しました');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleClearToken = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke('discord_token_clear');
      await refreshTokenState();
      flashMessage('接続キーを削除しました');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    if (currentEventName === null) {
      setError('イベントが開かれていません');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await invoke('discord_bot_start', { eventName: currentEventName });
      await refreshStatus();
      flashMessage('受信を開始しました');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke('discord_bot_stop');
      await refreshStatus();
      bumpDataReload();
      flashMessage('切断しました。データを再読み込みします');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBotEntry = async () => {
    if (botEntryInput.trim() === '') {
      setError('パスが空です');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await invoke('bot_entry_set', { path: botEntryInput.trim() });
      setBotEntryInput('');
      setEditingEntry(false);
      await refreshBotEntry();
      flashMessage('bot 実行ファイルのパスを保存しました');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleClearBotEntry = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke('bot_entry_clear');
      await refreshBotEntry();
      flashMessage('bot のパス設定を削除しました');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const openDeveloperPortal = () => {
    window.open('https://discord.com/developers/applications', '_blank');
  };

  const statusLabel =
    status === 'running' ? '受信中' : status === 'idle' ? '待機中' : '確認中';
  const statusColor =
    status === 'running' ? '#43b581' : status === 'idle' ? '#747f8d' : '#faa61a';

  return (
    <div className={shared['page-wrapper']}>
      <header className={shared['page-header']}>
        <h2 className={`${shared['page-header-title']} ${shared['page-header-title--lg']}`}>
          Discord 連携
        </h2>
        <p className={shared['page-header-subtitle']}>
          現在のイベントの DB に対して、Discord 上のコマンドで読み書きできるようにします。
          受信中のみ動作し、切断するとデータを再読み込みします。
        </p>
      </header>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>1. 接続キー</h3>
        <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
          Discord 側で発行した接続キー（bot トークン）を保存します。
          Windows の資格情報マネージャーに暗号化保存され、平文ファイルには残りません。
        </p>

        {!tokenSaved && !editing && (
          <div>
            <p style={{ marginBottom: 8 }}>状態: <strong>未設定</strong></p>
            <button
              className={shared['btn-primary']}
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              接続キーを入力する
            </button>
            <button
              className={shared['btn-secondary']}
              onClick={openDeveloperPortal}
              style={{ marginLeft: 8 }}
            >
              Discord 連携設定ページを開く
            </button>
          </div>
        )}

        {tokenSaved && !editing && (
          <div>
            <p style={{ marginBottom: 8 }}>
              状態: <strong style={{ color: '#43b581' }}>登録済み</strong>
            </p>
            <button
              className={shared['btn-secondary']}
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              再登録
            </button>
            <button
              className={shared['btn-danger']}
              onClick={handleClearToken}
              disabled={busy || status === 'running'}
              style={{ marginLeft: 8 }}
            >
              削除
            </button>
          </div>
        )}

        {editing && (
          <div>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ここに接続キーを貼り付け"
              style={{
                width: '100%',
                maxWidth: 480,
                padding: 8,
                marginBottom: 8,
                fontFamily: 'monospace',
              }}
              autoFocus
              disabled={busy}
            />
            <div>
              <button
                className={shared['btn-primary']}
                onClick={handleSaveToken}
                disabled={busy || tokenInput.trim() === ''}
              >
                保存
              </button>
              <button
                className={shared['btn-secondary']}
                onClick={() => { setEditing(false); setTokenInput(''); }}
                disabled={busy}
                style={{ marginLeft: 8 }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>2. bot 実行ファイル</h3>
        <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
          受信中だけ動作する小さなプログラムです。Stargazer 本体には同梱されていません。
          公開リポジトリから取得して、その実行ファイルのパスをここに設定してください。
          ソースコードは公開されており、誰でも監査できます。
        </p>

        {!botEntry && !editingEntry && (
          <div>
            <p style={{ marginBottom: 8 }}>状態: <strong>未設定</strong></p>
            <button
              className={shared['btn-primary']}
              onClick={() => setEditingEntry(true)}
              disabled={busy}
            >
              パスを指定する
            </button>
          </div>
        )}

        {botEntry && !editingEntry && (
          <div>
            <p style={{ marginBottom: 8 }}>
              状態: <strong style={{ color: '#43b581' }}>設定済み</strong>
            </p>
            <p
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                opacity: 0.8,
                marginBottom: 12,
                wordBreak: 'break-all',
              }}
            >
              {botEntry}
            </p>
            <button
              className={shared['btn-secondary']}
              onClick={() => setEditingEntry(true)}
              disabled={busy || status === 'running'}
            >
              変更
            </button>
            <button
              className={shared['btn-danger']}
              onClick={handleClearBotEntry}
              disabled={busy || status === 'running'}
              style={{ marginLeft: 8 }}
            >
              削除
            </button>
          </div>
        )}

        {editingEntry && (
          <div>
            <input
              type="text"
              value={botEntryInput}
              onChange={(e) => setBotEntryInput(e.target.value)}
              placeholder="例: C:\Users\You\Downloads\stargazer-bot.exe"
              style={{
                width: '100%',
                maxWidth: 600,
                padding: 8,
                marginBottom: 8,
                fontFamily: 'monospace',
              }}
              autoFocus
              disabled={busy}
            />
            <div>
              <button
                className={shared['btn-primary']}
                onClick={handleSaveBotEntry}
                disabled={busy || botEntryInput.trim() === ''}
              >
                保存
              </button>
              <button
                className={shared['btn-secondary']}
                onClick={() => { setEditingEntry(false); setBotEntryInput(''); }}
                disabled={busy}
                style={{ marginLeft: 8 }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>3. 受信</h3>
        <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
          受信ボタンを押すと、現在開いているイベントの DB に対して
          Discord からのコマンドを受け付けます。切断するまで動作します。
        </p>
        <p style={{ marginBottom: 8 }}>
          対象イベント: <strong>{currentEventName ?? '（未選択）'}</strong>
        </p>
        <p style={{ marginBottom: 12 }}>
          状態: <strong style={{ color: statusColor }}>{statusLabel}</strong>
        </p>

        {status !== 'running' ? (
          <button
            className={shared['btn-success']}
            onClick={handleConnect}
            disabled={busy || !tokenSaved || !botEntry || currentEventName === null}
          >
            受信
          </button>
        ) : (
          <button
            className={shared['btn-danger']}
            onClick={handleDisconnect}
            disabled={busy}
          >
            切断
          </button>
        )}

        {!tokenSaved && (
          <p style={{ fontSize: 12, color: '#faa61a', marginTop: 8 }}>
            ※ 受信するには接続キーを先に登録してください。
          </p>
        )}
        {!botEntry && (
          <p style={{ fontSize: 12, color: '#faa61a', marginTop: 8 }}>
            ※ 受信するには bot 実行ファイルのパスを先に設定してください。
          </p>
        )}
        {currentEventName === null && (
          <p style={{ fontSize: 12, color: '#faa61a', marginTop: 8 }}>
            ※ 受信するにはイベントを開いてください。
          </p>
        )}
      </section>

      {message !== null && (
        <div style={{ padding: 12, background: '#43b58133', borderRadius: 6, marginBottom: 8 }}>
          {message}
        </div>
      )}
      {error !== null && (
        <div style={{ padding: 12, background: '#f0414233', borderRadius: 6, color: '#f04142' }}>
          エラー: {error}
        </div>
      )}
    </div>
  );
};
