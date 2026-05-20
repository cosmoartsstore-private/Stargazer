# Stargazer Discord Bot

Stargazer のイベント運営アプリと連携する、Discord ⇄ SQLite の中継 bot です。

このリポジトリは Stargazer 本体とは独立して公開されています。**Stargazer 本体は外部に一切通信しません**。Discord と通信するのはこの bot プロセスのみで、ここに含まれるコード以外のものは存在しません。利用者は自分で監査・自分でビルドできます。

## 通信仕様

| 通信先 | プロトコル | 用途 |
|---|---|---|
| `gateway.discord.gg` | WSS | スラッシュコマンドの受信、応答送信 |
| `discord.com` / `cdn.discordapp.com` | HTTPS | Discord REST API |

それ以外の宛先には一切通信しません（テレメトリ・解析サーバー等は無し）。

## できること

| コマンド | 動作 |
|---|---|
| `/cass-insmb [exclude:<@メンバー>]` | サーバーの全メンバーをキャスト名簿に新規登録（除外指定可、既存はスキップ） |
| `/cass-atmb message:<投稿リンク> [include:<@メンバー>]` | 投稿のリアクション + 指定メンバーを「出席」、それ以外を「欠席」として一括上書き |
| `/cass-atmb-stat` | 現在出席フラグが立っているキャストを一覧表示 |
| `/cass-h` | ヘルプ |

書き込み対象は **環境変数 `STARGAZER_BOT_DB_PATH` で指定された SQLite ファイル** のみ。それ以外のファイル・パスには一切アクセスしません。

## 必要なもの

- Node.js 20 以上
- Discord Developer Portal で作成した bot アカウント（自分用）
- Stargazer 本体（per-event の SQLite を生成するもの）

## セットアップ（開発・手動実行）

```bash
npm install
cp .env.example .env
# .env に DISCORD_TOKEN, CLIENT_ID, GUILD_ID を記入
npm run register      # スラッシュコマンドを Discord に登録（初回のみ）
```

実行（手動）:

```bash
STARGAZER_BOT_TOKEN=<bot token> \
STARGAZER_BOT_DB_PATH=/absolute/path/to/stargazer.db \
node src/index.js
```

## Stargazer 本体から起動する場合

Stargazer は受信ボタン押下時に以下の環境変数を設定して bot プロセスを起動します:

- `STARGAZER_BOT_TOKEN` — Discord bot トークン
- `STARGAZER_BOT_DB_PATH` — 接続先 SQLite ファイルの絶対パス

Stargazer 側の「Discord 連携」画面で **この bot 実行ファイルへのパス** を指定してください。

## ファイル一覧

```
src/
├── index.js                    エントリポイント（環境変数を読んで Discord に接続）
├── db.js                       SQLite 接続（WAL モード）
├── parsers.js                  メンション / メッセージ URL の解析
├── deploy-commands.js          スラッシュコマンド登録（初回 / 変更時のみ）
└── commands/
    ├── cass-h.js
    ├── cass-insmb.js
    ├── cass-atmb.js
    └── cass-atmb-stat.js
```

依存パッケージは `package.json` 参照（`discord.js`, `better-sqlite3`, `dotenv` のみ）。

## Discord 側で必要な権限 / Intents

- Scopes: `bot`, `applications.commands`
- Intents: `Guilds`, `Guild Members`（メンバー一覧を取得するため Privileged Intent を有効化する必要あり）
- 推奨 Bot Permissions: `Send Messages`, `Read Message History`

`MessageContent` Intent は **不要** です（他人のメッセージ本文は受信しません）。

## 監査ポイント

このリポジトリの全コードは可読です。確認すべき点:

- ネットワーク先: `index.js` の `client.login()` 以降、`discord.js` 経由でのみ通信。他の HTTP クライアントは `dependencies` に存在しない。
- DB アクセス先: `db.js` で `STARGAZER_BOT_DB_PATH` のみを開く。他のパスは触らない。
- 環境変数の扱い: `STARGAZER_BOT_TOKEN` は Discord ログイン以外には使わない。
- 外部送信: コマンド応答以外で `interaction.client` が送信する箇所は無い。

## ライセンス

（公開時に利用者が決定）
