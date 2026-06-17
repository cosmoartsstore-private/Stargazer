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
- **Cast Management** — キャスト情報の登録（写真・プロフィール・連絡先付き）
- **Data Import** — TSV からの応募者データ取り込み（キャスト希望対応）
- **Lottery** — バリデーション付き抽選システム
- **Matching** — 複数戦略の最適マッチング (M001 / M002 / M003)
- **Attendance** — イベントごとの出席履歴と出席回数管理
- **NG Management** — ブロックユーザー・要注意ユーザー管理
- **Post Template** — 投稿文テンプレート作成・コピー
- **STELLA RECORD 連携** — 外部アプリ登録・解除

## Project Structure

```
desktop/
  ├── src/                  # React フロントエンド
  │   ├── features/         #   一覧・抽選・マッチング・内部管理などの画面
  │   ├── components/       #   共通コンポーネント
  │   ├── db/               #   SQLite リポジトリ
  │   └── common/           #   ユーティリティ・型定義
  └── src-tauri/            # Rust バックエンド
      ├── src/lib.rs        #   Tauri コマンドハンドラ・マイグレーション
      └── windows/          #   NSIS インストーラスクリプト
sample-data/                # 手動確認用サンプルデータ
```

## Basic Flow

1. イベントを作成、または既存イベントへ切り替えます。
2. 応募管理の **一覧** タブで応募者 TSV を取り込みます。
3. **抽選** タブで当選者を確定します。
4. **マッチング** タブでキャスト割り当てを実行します。

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
