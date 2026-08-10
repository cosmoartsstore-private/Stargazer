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
- **Matching** — 複数戦略の最適マッチング (M001 / M002 / M003)、希望順位別の割り当て内訳とNG警告、キャスト別 TSV、キャスト別・テーブル別 PNG 出力
- **Attendance** — イベントごとの出席履歴、期間指定による出席回数、固定見出し付き一覧の縦横スクロール
- **NG Management** — 理由メモ付きのキャスト別NG・要注意ユーザー管理
- **Post Template** — 投稿文テンプレート作成・コピー
- **Theme Customization** — デフォルトテーマのカスタムカラー調整、チェックテーマの色相調整

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
2. **応募管理** の開始画面で **応募データを新規で取り込む** を選び、応募者 TSV の列対応と警告を確認します。
3. 取り込んだ応募者一覧を確認し、**抽選へ進む** で抽選人数、確定当選者、マッチング方式を設定して抽選します。
4. M001〜M003では **マッチングへ進む** で割り当て条件の確認画面へ進み、キャスト割り当てを実行します。結果はアプリ内へ明示保存でき、キャスト別 TSV またはキャスト別・テーブル別 PNG として出力できます。

開始画面からは、イベント内へ明示保存した抽選結果を開いてマッチングを開始したり、保存済みマッチング結果を読み取り専用で確認したりできます。

保存結果の閲覧画面でサイドバーの **応募管理** を選ぶと開始画面へ戻ります。新規取込、応募データ、抽選、マッチングの作業中画面では、同じ操作で現在の工程を維持します。

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
# Frontend と Tauri CLI の依存関係をlockfileどおりに導入
npm ci --ignore-scripts --prefix desktop

# 開発起動
npm run dev
```

JavaScript依存関係の正は `desktop/package.json` と `desktop/package-lock.json` です。ルートの `package.json` はコマンド転送だけを担当し、ルート直下の `node_modules` と `package-lock.json` は使用しません。

### Build

```bash
npm run build
```

> **Note:** `tauri` はグローバルではなく `desktop/node_modules` に入っているため、必ず `npm run` 経由で起動してください。

### Test

```bash
# lockfileと依存関係の整合性、既知の脆弱性
npm ci --ignore-scripts --prefix desktop
npm audit --audit-level=low --prefix desktop

# Frontend の業務ロジック・repository テストとカバレッジ
npm run test:coverage

# Frontend 本番ビルド
npm run build --prefix desktop

# Backend の形式、lint、schema・transaction テスト
cargo fmt --manifest-path desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path desktop/src-tauri/Cargo.toml --locked
```

Frontend テストは製品ツリーを鏡写しにした `desktop/src/test/` 配下へ配置し、取込パース、抽選、マッチング、出欠集計、repository の永続化境界を検証します。Rust テストは `desktop/src-tauri/src/lib.rs` の現行 schema 初期化、transaction、保存済み結果の固定スナップショットを検証します。カバレッジレポートは `desktop/src/coverage/` に生成され、Git の管理対象には含めません。

2026-08-11時点の検証結果は、Frontend 55ファイル・450件、Rust 40件が成功し、Frontend coverageは Statements 96.16%、Branches 89.38%、Functions 100%、Lines 97.06%です。GitHub Actionsも上記と同じ依存監査、Frontend検証、Rust検証をWindows上で実行します。

## Database

SQLite は用途別に DB を分けます。

- イベント共有 DB: `meta`, `casts`, `cast_aliases`, `cast_urls`, `cast_ng_entries`, `caution_users`, `cast_attendance`, `attendance_record_dates`, `settings`, `saved_results`
- 取込セッション DB: `applicants`, `applicant_casts`, `applicant_extra`, `session_workflow_state`, `lottery_results`

Stargazer 自身はルート DB を持ちません。StellaRecord の `apps` へ登録するバックエンド処理はありますが、登録 UI は実機確認が完了するまで無効です。

応募者、確定当選者、抽選・マッチング条件、現行抽選結果は取込セッション DB を正とします。作業セッションは応募管理の開始画面へ戻るとき、イベント切替時、またはアプリ終了時に破棄します。明示保存した抽選・マッチング結果は、日時と当選人数から表示名を作り、イベント共有 DB の `saved_results` へ固定スナップショットとして残します。保存済み抽選を開くと、そのスナップショットから読み取り専用の一時セッションを作成し、保存時の応募データ、当選者、方式、条件を表示します。その抽選結果を使ったマッチングも実行できます。

作業セッション自体は再開対象ではありません。明示保存した抽選・マッチング結果だけをイベント削除まで保持し、件数による自動削除、個別削除、リネームは行いません。

空、形式不正、または正規化後に重複する X ID が存在する場合は該当行を警告し、利用者が取込画面または応募データ一覧から手動削除するまで抽選とマッチングを利用できません。X ID は `username` または `@username` 形式で受け付け、英数字とアンダースコアからなる1〜15文字のユーザー名を先頭の `@` なしで保存します。プロフィール URL は入力値として受け付けません。自動削除や暗黙の除外は行いません。

要注意ユーザーと候補閾値はイベント共有 DB を正とします。自動候補はキャスト NG から都度算出し、明示的に追加したユーザーだけを固定登録します。候補集計、登録時の重複判定、応募者との照合では、X ID の大文字小文字と先頭の `@` を区別しません。応募者名と利用者が入力した登録名が両方ある場合は、名前も一致した人を要注意として扱います。登録名が未入力の場合はX IDだけで照合します。

localStorage へ保存するのはテーマ、テーマ調整、最後に開いたイベントだけです。作業セッションと業務データは保存しません。

応募者・キャスト・出席・抽選・マッチング結果の複数 SQL を伴う保存処理は、Rust 側 command で単一 SQLite transaction として実行します。

希望キャストはイベント共有DBの安定IDで識別し、取込セッションDBにはIDと取込時名称を保存します。取込時はキャストの正式名だけをIDへ解決し、別名義はキャスト名簿の検索にだけ使用します。現在の正式名に一意一致しない名称は未解決として保持し、取込画面で警告して修正できるようにします。キャストを削除して同名で再登録しても、IDが異なるため別キャストとして扱います。

削除済み・未解決の希望キャストがある場合は、希望どおりに判定できない可能性を画面で警告します。抽選とマッチングは継続できます。M000はキャストを参照しませんが、応募データの修正対象を確認できるよう希望キャストの警告は表示します。マッチング結果は作業中だけContextへ保持し、明示保存した場合はイベント共有DBの履歴から再表示できます。キャストNGの割り当て判定には正規化したX IDだけを使い、登録名やメモは使用しません。詳しい状態の寿命は [Architecture](docs/ARCHITECTURE.md#matching) を参照してください。

### Data のバックアップと再インストール

イベントデータはインストール先の `Data` フォルダーに保存します。通常のアンインストールではデータを残しますが、別の場所へ再インストールした場合は以前の `Data` を自動検出しません。バックアップまたは移動はStargazerを終了してから `Data` フォルダー全体をコピーし、必要に応じて新しいインストール先へ戻してください。

## License

Proprietary — CosmoArtsStore
