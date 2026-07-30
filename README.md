# Stargazer

イベント運営向けの抽選・キャストマッチングデスクトップアプリケーション。応募者データの取り込みから抽選、最適マッチング、出欠管理までをカバーします。

完全ローカル運用。外部 API・認証は使用しません。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Radix UI |
| Backend | Rust (Edition 2021), Tauri v2 |
| Database | SQLite (rusqlite) |
| Algorithm | Hungarian Algorithm (munkres-js) による最適マッチング |
| Export | html-to-image による PNG、UTF-8 TSV |
| Icons | Lucide React |

## Features

- **Event Management** — データ区切りとなるイベントの作成・切替・改名・削除、写真・説明メモの編集
- **Cast Management** — キャスト情報の登録（別名義・写真・プロフィール・連絡先付き）
- **Data Import** — TSV からの応募者データ取り込み（空・形式不正・重複 X ID の警告と手動削除、キャスト希望対応）
- **Lottery** — バリデーション付き抽選システム（キャストを使わない単純抽選 M000 対応）
- **Matching** — 複数戦略の最適マッチング (M001 / M002 / M003)、キャスト別 TSV、キャスト別・テーブル別 PNG 出力
- **Attendance** — イベントごとの出席履歴、期間指定による出席回数の確認
- **NG Management** — 理由メモ付きのキャスト別NG・要注意ユーザー管理
- **Post Template** — 投稿文テンプレート作成・コピー
- **Theme Customization** — デフォルトテーマのカスタムカラー調整、チェックテーマの色相調整
- **StellaRecord 連携** — 外部ランチャーへのアプリ登録

## Screenshots

| デフォルトテーマ | チェックテーマ |
|---|---|
| [![デフォルトテーマの応募データ画面](docs/screenshots/default/01-applicant-data.png)](docs/screenshots/default/01-applicant-data.png) | [![チェックテーマの応募データ画面](docs/screenshots/check/01-applicant-data.png)](docs/screenshots/check/01-applicant-data.png) |

全20画面を両テーマで収録した40枚の画面サンプルは、[UI Gallery](docs/UI_GALLERY.md) を参照してください。

## Project Structure

```
desktop/
  ├── src/                  # React フロントエンド
  │   ├── features/         #   データ取込・抽選・マッチング・内部管理などの画面
  │   ├── components/       #   共通コンポーネント
  │   ├── layout/           #   ナビゲーション・表示データの読込
  │   ├── messages/         #   Frontend の表示文言 resource
  │   ├── stores/           #   アプリ全体の表示状態・端末設定
  │   ├── test/             #   Frontend テスト
  │   ├── db/               #   SQLite リポジトリ
  │   └── common/           #   ユーティリティ・型定義
  └── src-tauri/            # Rust バックエンド
      ├── src/lib.rs        #   Tauri コマンドハンドラ・現行 schema 初期化
      └── windows/          #   NSIS インストーラスクリプト
sample-data/                # 手動確認用サンプルデータ
```

状態管理、DBの寿命、Frontend と Rust command の責務境界は [Architecture](docs/ARCHITECTURE.md) を参照してください。

## Basic Flow

1. イベントを作成、または既存イベントへ切り替えます。
2. 応募管理の **データ取込** タブで応募者 TSV を取り込みます。
3. **抽選** タブで当選者とマッチング条件を確定します。
4. **マッチング** タブで条件を確認し、キャスト割り当てを実行します。

ギフト抽選などで M000 を使う場合は、出席キャストを設定せずに抽選まで実行でき、マッチング工程はありません。

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20.19 以上の 20 系、22.12 以上の 22 系、または 24 以上
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/)
- Windows 10 / 11

画面は Full HD（1920×1080）の全画面利用を基準とし、アプリは最大化して起動します。

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

### Test

```bash
# TypeScript の純粋ロジックテスト
npm test

# カバレッジ付きで実行
npm run test:coverage
```

テストは製品ツリーを鏡写しにした `desktop/src/test/` 配下へ配置し、取込パース、抽選、マッチング、出欠集計など、業務結果に影響する純粋ロジックを優先して検証します。カバレッジレポートは `desktop/src/coverage/` に生成され、Git の管理対象には含めません。

## Database

SQLite は用途別に DB を分けます。

- イベント共有 DB: `meta`, `casts`, `cast_aliases`, `cast_urls`, `cast_ng_entries`, `caution_users`, `cast_attendance`, `settings`
- 取込セッション DB: `applicants`, `applicant_casts`, `applicant_extra`, `session_workflow_state`, `lottery_results`, `lottery_saved_runs`, `lottery_saved_run_results`

Stargazer 自身はルート DB を持ちません。`apps` は外部アプリである StellaRecord の DB へ連携情報を登録するときだけ使用します。

応募者、確定当選者、抽選・マッチング条件、現行抽選結果は取込セッション DB を正とします。明示的に保存した抽選を開くと、所有セッションへ切り替え、保存時の応募データ、当選者、抽選・マッチング方式、抽選人数を読み取り専用で表示します。その結果を使ったマッチングは実行できます。保存時の表示名は日時と当選人数から自動生成します。抽選結果を保存したセッションは履歴として保持し、次に応募データを取り込むときは新しいセッションを作成します。

空、形式不正、または正規化後に重複する X ID が存在する場合は該当行を警告し、利用者が取込画面または応募データ一覧から手動削除するまで抽選とマッチングを利用できません。X ID は `username` または `@username` 形式で受け付け、英数字とアンダースコアからなる1〜15文字のユーザー名を先頭の `@` なしで保存します。プロフィール URL は入力値として受け付けません。自動削除や暗黙の除外は行いません。

要注意ユーザーと候補閾値はイベント共有 DB を正とします。自動候補はキャスト NG から都度算出し、明示的に追加したユーザーだけを固定登録します。候補集計、登録時の重複判定、応募者との照合では、X ID の大文字小文字と先頭の `@` を区別しません。応募者名と利用者が入力した登録名が両方ある場合は、名前も一致した人を要注意として扱います。登録名が未入力の場合はX IDだけで照合します。

localStorage へ保存するのはテーマ、探索モード、最後に開いたイベント・セッションなどの端末設定だけです。

応募者・キャスト・出席・抽選結果の複数 SQL を伴う保存処理は、Rust 側 command で単一 SQLite transaction として実行します。

希望キャストはイベント共有DBの安定IDで識別し、取込セッションDBにはIDと取込時名称を保存します。取込時はキャストの正式名と登録済みの別名義をIDへ解決します。現在の名簿に一致しない名称や、複数キャストに該当する曖昧な名称は未解決として保持し、取込画面で警告して修正できるようにします。キャストを削除して同名で再登録しても、IDが異なるため別キャストとして扱います。

削除済み・未解決の希望キャストがある場合は、希望どおりに判定できない可能性を画面で警告します。抽選とマッチングは継続できます。M000はキャストを参照しませんが、応募データの修正対象を確認できるよう希望キャストの警告は表示します。マッチング結果自体はDBへ保存しないため、再起動後には復元されません。詳しい状態の寿命は [Architecture](docs/ARCHITECTURE.md#matching) を参照してください。

## License

Proprietary — CosmoArtsStore
