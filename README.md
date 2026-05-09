# Stargazer

イベント運営向けの抽選・キャストマッチングデスクトップアプリケーション。応募者データの取り込みから抽選、最適マッチング、出欠管理までをカバーします。

完全ローカル運用。外部 API・認証は使用しません。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Radix UI |
| Backend | Rust (Edition 2021), Tauri v2 |
| Database | SQLite (rusqlite) with migrations |
| Algorithm | Hungarian Algorithm (munkres-js) による最適マッチング |
| Export | html-to-image |
| Icons | Lucide React |

## Features

- **Event Management** — イベントの作成・編集・管理
- **Cast Management** — キャスト情報の登録（写真・メモ付き）
- **Data Import** — CSV からの応募者データ取り込み（キャスト希望対応）
- **Lottery** — バリデーション付き抽選システム
- **Matching** — 複数戦略の最適マッチング (M001 / M002 / M003)
- **Attendance** — イベントごとの出欠管理
- **NG Management** — ブロックユーザー・要注意ユーザー管理
- **Tweet Integration** — ツイートインテント連携
- **STELLA RECORD 連携** — 外部アプリ登録・解除

## Project Structure

```
desktop/
  ├── src/                  # React フロントエンド
  │   ├── pages/            #   ページ (DataManagement, Lottery, Matching, Attendance, etc.)
  │   ├── components/       #   共通コンポーネント
  │   └── lib/              #   ユーティリティ・型定義
  └── src-tauri/            # Rust バックエンド
      ├── src/commands/     #   Tauri コマンドハンドラ
      ├── src/db/           #   DB アクセス・マイグレーション
      └── windows/          #   NSIS インストーラスクリプト
docs/                       # 設計ドキュメント
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/)
- Windows 10 / 11

### Setup

```bash
# 依存インストール (ルートと desktop の両方)
npm install
cd desktop && npm install && cd ..

# 開発起動
npm run dev
```

### Build

```bash
npm run build
```

> **Note:** `tauri` はグローバルではなく `desktop/node_modules` に入っているため、必ず `npm run` 経由で起動してください。

## Database

SQLite テーブル: `events`, `casts`, `cast_urls`, `cast_ng_entries`, `applicants`, `applicant_casts`, `applicant_extra`, `caution_users`, `attendance`, `settings`, `cast_attendance`, `event_cast_present`

## License

Proprietary — CosmoArtsStore
