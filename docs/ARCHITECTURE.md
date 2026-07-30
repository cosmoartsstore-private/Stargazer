# Architecture

Stargazer は、React の画面層、TypeScript の業務ロジックと repository、Tauri command、SQLite で構成するローカル完結型のデスクトップアプリケーションです。

## 処理境界

```text
React page / hook
  ├─ pure logic・presenter・store
  └─ src/db/repositories
       ├─ 単純な参照: Tauri SQL plugin
       └─ 整合性が必要な更新: Tauri invoke
            └─ Rust command / SQLite transaction
```

画面コンポーネントは表示と操作の調停を担当します。抽選、マッチング、取込変換、出欠集計など、入出力だけで検証できる処理は feature 内の純粋モジュールへ置きます。複数画面で共有する技術的処理だけを `src/common/` へ移し、単一 feature の業務規則はその feature 内に残します。

## Database

Stargazerが所有する業務データは、寿命の違いに応じて2種類のDBへ分離します。

| DB | パスの単位 | 主なデータ | 寿命 |
|---|---|---|---|
| イベント共有DB | `Data/<event>/shared/db/stargazer.db` | イベント写真・説明メモ、キャスト、別名義、連絡先、NG、要注意人物、出欠履歴、イベント設定 | イベントを削除するまで |
| 取込セッションDB | `Data/<event>/<timestamp>/db/stargazer.db` | 応募者、希望キャストの論理ID・取込時名称、抽選条件、抽選結果、保存済み当選者 | イベントを削除するまで。抽選結果の保存後は履歴として保持 |

StellaRecord連携時だけ、StellaRecordが所有するDBを外部境界として開き、`apps`へ登録情報を書き込みます。このDBとschemaはStargazerの所有物ではなく、上記2種類の schema 初期化・検証対象には含めません。

`desktop/src/db/database.ts` が共有DBと現在セッションDBの接続を管理します。接続世代番号も管理し、同じイベント・timestampへ戻った場合でも、切替前に開始した非同期処理の結果を採用しません。イベント切替ではセッション接続を先に閉じ、共有接続を切り替えます。イベント管理画面では使用中イベントの削除ボタンを表示せず、使用していないイベントを削除する前に、そのイベントへ残っている書込みの完了を待ちます。

schema の正は `desktop/src-tauri/src/lib.rs` の現行 schema 定義です。新しいイベントと取込セッションは、一時ディレクトリ内で現行 schema の初期化と追加設定を完了してから最終ディレクトリへ移します。途中で失敗したデータは一覧へ公開せず、一時ディレクトリだけを削除します。一覧には、有効な名前で規定位置に `stargazer.db` ファイルがあるディレクトリを表示します。一覧取得時はDB内容を検証せず、選択して開くときにRust側でDB種別、必須table、必須columnを検証します。現行 schema に適合しないDBにはschemaの移行や補完を行わず、利用を拒否します。ただし、検証前にSQLiteの接続設定を適用するため、journal関連の状態や補助ファイルが更新される場合があります。Frontend repository は schema を作成しません。

複数テーブルを更新する保存処理は Rust command の単一 transaction にまとめます。単純な一覧取得は Tauri SQL plugin から直接実行します。

希望キャストは、イベント共有DBの `casts.id` をセッションDBの `applicant_casts.cast_id` から論理参照します。DBファイルが分かれるため外部キーは設定せず、取込時の `cast_name` を表示用名称として残します。取込時は正式名と `cast_aliases` の別名義をIDへ解決します。現在の名簿に一致しない名称や、複数キャストに該当する曖昧な名称は `cast_id = NULL` の未解決希望として保存し、取込画面で警告して修正できるようにします。改名後はIDから現在名を解決し、削除後に同名で再登録されたキャストも別IDとして扱います。

キャストの現在出席状態は `casts.is_attend` を正とし、出欠履歴は `cast_attendance` に別途記録します。

初回取込時にセッションがなければ作成し、保存済み抽選を持たない現在セッションへの再取込は応募者を transaction で全置換します。抽選結果を保存したセッションは読み取り専用の履歴として維持し、次の取込先には新しいセッションを作成します。応募者の個別削除は `applicants.id` を使い、残りの一覧を置換しません。書込み可能なセッションで応募者を置換・個別削除したときは、応募者IDに依存する現行抽選結果を破棄し、条件revisionを更新します。

## State and lifecycle

`desktop/src/stores/AppContext.tsx` は、現在の画面、イベントとセッション、SQLiteから読み込んだ表示データ、マッチング結果を保持します。永続的な業務データの正はSQLiteであり、Context は現在開いているDBの表示キャッシュと一時的な操作状態です。当選者、確定当選者、抽選・マッチング条件を localStorage へ二重保存しません。テーマとテーマ調整は、実際に画面全体へ適用する `AppContainer` が保持します。

出欠、応募者削除、抽選、確定当選者の選択は、操作結果を即時に伝えるため画面へ先に反映します。応募者・抽選・キャスト・セッション条件の書込みは、対象DB単位のRepositoryキューで呼出順に実行します。画面状態を戻すのは最新操作の保存に失敗した場合だけです。別の保存処理を理由に抽選画面全体をロックしません。新しい抽選結果は画面へ先に表示し、対応する transaction が完了するまでは現行結果として扱わず、抽選結果の保存とマッチングを開始しません。保存済み抽選を開くときは所有セッションへ切り替え、保存時の状態を読み取り専用で読み込みます。

起動時は次の順序で復元します。

1. `initializeApp` がイベント一覧と前回選択を取得する。
2. `AppProvider` が共有DBと前回セッションDBを開く。
3. `AppContainer` がイベント共有データとセッションデータを読み込む。
4. 読込中に接続世代が変わった場合、イベント名とtimestampが再び同じでも古い非同期要求の結果は破棄する。

最後に開いたイベントとセッションは、version付きの単一JSONとして localStorage へ保存します。テーマ、テーマ調整、探索モードも端末設定として localStorage に置きます。

Context の公開契約を変更するときは、`GuidePage.tsx` の `createGuideSampleContext` も更新します。ヘルプ画面は実画面コンポーネントを固定サイズのサンプルContext内で描画するためです。

## Matching

割り当て計算、結果整形、Worker実行は `desktop/src/features/matching/` に閉じています。画面間で共有する条件契約は `desktop/src/common/types/sessionWorkflow.ts`、条件と抽選結果の永続化はrepositoryとRust commandが担当します。

- `logics/`: 割り当て、NG判定、要注意人物判定などの純粋ロジック
- `presenters/`: 画面表示行とTSV出力への変換
- `stores/`: 端末単位の探索モードとイベント単位設定の保存境界
- `matching.worker.ts`: 計算量の大きい割り当てをUIスレッドから分離

マッチング結果はDBへ保存しません。抽選結果、キャスト、NG、希望キャストから再計算でき、入力変更時の失効管理を避けるためです。利用者が明示的に保存する抽選は、当選者、抽選・マッチング方式、抽選人数をセッションDBへ保存します。表示名は保存日時と当選人数から自動生成します。保存時は Rust が条件revisionの一致を確認し、同じ transaction 内で現行 `lottery_results` を保存先へコピーします。保存見出しの方式はDBの条件行から、抽選・確定当選の人数は現行結果から導出し、画面との二重管理を避けます。保存後は所有セッションを書込み不可の履歴として扱います。応募データ画面はイベント内の各取込セッションから保存済み抽選の見出しを取得し、選択した抽選の所有セッションへ切り替え、保存時の応募データ、確定当選者、抽選結果、方式、抽選人数を読み取り専用で表示します。この結果を入力としてマッチングを実行できます。

`session_workflow_state` は条件revisionと、現行抽選結果を確定したrevisionを保持します。条件・確定当選者・応募者が変わると結果を古い状態として扱います。抽選結果保存時は期待revisionをtransaction内で比較し、処理中に条件が変わっていれば保存全体を取り消します。

Web Workerを開始する前に、イベント共有DBと取込セッションDBの先行書込みを完了させ、画面上の条件・抽選結果・キャスト情報がDBのスナップショットと一致することを確認します。計算完了時にも接続世代、書込み世代、画面入力を比較し、計算中に入力が変わった結果は画面へ反映しません。楽観更新の保存失敗後にDBを再読込している間も、同じデータから新しいマッチングを開始しません。

応募者の X ID は `username` または `@username` 形式で受け付け、英数字とアンダースコアからなる1〜15文字のユーザー名を先頭の `@` なしで保存します。プロフィール URL は入力値として受け付けません。前後の空白、先頭の `@`、大文字小文字を除いた値で一意である必要があり、取込前とDBから読み込んだ一覧に同じ規則を適用します。不正行が存在する間は抽選・マッチング画面を開かず、Backendも抽選結果の確定と履歴保存を拒否します。自動削除は行わず、画面には対象行を示して安定IDによる個別削除だけを許可します。

要注意ユーザーの X ID は、入力時の大文字小文字を保った `username` 形式で保存します。候補集計、登録時の重複判定、固定登録と応募者の照合では、小文字化して先頭の `@` を除いた比較キーを使います。応募者名と利用者が入力した登録名が両方ある場合は名前も照合します。登録名が未入力でX IDを表示名へ補完した場合は、X IDだけで照合します。

希望または確定済みマッチングが現在存在しないキャストIDを参照する場合は、希望キャストとして判定できない可能性を警告します。抽選、マッチング、再実行、結果解除、PNG・TSV出力は制限しません。M000はキャストを参照しませんが、応募データの修正対象を確認できるよう応募者側の参照警告は表示し、マッチング結果に由来する警告は対象外とします。

ワークフロー中の主な中間状態は次のとおりです。

| 状態 | 保存先 | 寿命 |
|---|---|---|
| 抽選・マッチング条件 | 取込セッションDB `session_workflow_state` | 応募者データ区切りを使う間 |
| 確定当選者draft | 取込セッションDB `applicants.is_guaranteed` | 次に変更、応募者を全置換、またはイベントを削除するまで |
| 現行抽選結果 | 取込セッションDB `lottery_results` | 再抽選、応募者の置換・削除、またはイベント削除まで |
| 保存済み抽選 | 取込セッションDB `lottery_saved_runs` | イベント削除まで。保存後は所有セッションを読み取り専用で保持 |
| テーマ・探索モード・最終使用位置 | localStorage | 端末設定を変更・削除するまで |
| 計算中入力 | Web Worker の構造化コピー | 1回の計算完了または画面破棄まで |
| 最終マッチング | AppContext | アプリ終了、イベント・セッション切替、結果解除まで |

PNGとTSVは画面上の結果から都度生成し、アプリ内キャッシュとして保持しません。

## Directory ownership

| パス | 責務 |
|---|---|
| `desktop/src/features/` | feature ごとの画面、状態調停、純粋ロジック |
| `desktop/src/components/` | 複数 feature で使うUI部品 |
| `desktop/src/common/` | 複数 feature で共有する型・技術的処理 |
| `desktop/src/db/` | DB接続、初期化、Frontend repository |
| `desktop/src/layout/` | アプリ全体のナビゲーションとデータ読込 |
| `desktop/src/messages/` | Frontend の利用者向け文言 resource と名前付き変数の解決 |
| `desktop/src/stores/` | アプリ全体の一時状態とブラウザ保存 |
| `desktop/src/test/` | 製品ツリーを鏡写しにした Frontend テスト |
| `desktop/src-tauri/` | OS連携、schema 初期化、transaction を伴う永続化 |

小さな型や補助関数は、単一の利用元しかない限り所有 feature の近くに置きます。共有化は、複数箇所の規則を一つの正へ統合できる場合に限ります。

## Verification

Frontend の純粋ロジックと repository は Vitest、Backend の schema 初期化と transaction は Rust test で確認します。

```bash
npm test
npm run test:coverage
npm run build --prefix desktop
cargo test --manifest-path desktop/src-tauri/Cargo.toml
```

`npm run build --prefix desktop` は TypeScript と Vite の生成までを確認します。ルートの `npm run build` は Tauri の配布物生成を含むため、リリース前に実行します。
