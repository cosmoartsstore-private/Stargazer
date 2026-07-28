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
| イベント共有DB | `Data/<event>/shared/db/stargazer.db` | イベント写真・説明メモ、キャスト、別名、連絡先、NG、要注意人物、出欠履歴、イベント設定 | イベントを削除するまで |
| 取込セッションDB | `Data/<event>/<timestamp>/db/stargazer.db` | 応募者、希望キャストの論理ID・取込時名称、抽選条件、抽選結果、保存済み当選者 | 現在の応募者データ区切り |

StellaRecord連携時だけ、StellaRecordが所有するDBを外部境界として開き、`apps`へ登録情報を書き込みます。このDBとschemaはStargazerの所有物ではなく、上記2種類のmigration対象にも含めません。

`desktop/src/db/database.ts` が共有DBと現在セッションDBの接続を管理します。接続世代番号も管理し、同じイベント・timestampへ戻った場合でも、切替前に開始した非同期処理の結果を採用しません。イベント切替ではセッション接続を先に閉じ、共有接続を切り替えます。イベント管理画面では使用中イベントの削除ボタンを表示せず、使用していないイベントを削除する前に、そのイベントへ残っている書込みの完了を待ちます。

schema と migration の正は `desktop/src-tauri/src/lib.rs` です。新しいイベントと取込セッションは、一時ディレクトリ内で migration と追加初期化を完了してから最終ディレクトリへ移します。途中で失敗したデータは一覧へ公開せず、一時ディレクトリだけを削除します。一覧は有効な名前のディレクトリを列挙し、現行DBがない既存ディレクトリは初めて開くときにDBを作成します。既存DBはURIを返す前に Rust 側で migration とDB種別ごとの必須tableを検証します。未初期化の `user_version = 0`、別種別のDB、アプリが対応する版より新しい schema version は変更せず拒否します。Frontend repository は schema 作成を行いません。

複数テーブルを更新する保存処理は Rust command の単一 transaction にまとめます。単純な一覧取得は Tauri SQL plugin から直接実行します。

希望キャストは、イベント共有DBの `casts.id` をセッションDBの `applicant_casts.cast_id` から論理参照します。DBファイルが分かれるため外部キーは設定せず、取込時の `cast_name` を欠損時の表示用名称として残します。新しい取込では正式名と `cast_aliases` の別名をIDへ解決し、複数キャストに該当する曖昧な名前は未解決のまま保存します。IDの保存元を示す情報がない既存セッションは、名称だけでは削除前のキャストと同名で再登録したキャストを区別できないため、現在の名簿からIDを推測しません。過去の中間版が名称一致で補完したIDも `NULL` へ戻し、旧形式として記録します。再取込後は取込時に解決したIDを正として扱います。改名後はIDから現在名を解決し、削除後に同名で再登録されたキャストも別IDとして扱います。

キャストの現在出席状態は `casts.is_attend` を正とします。出欠履歴は `cast_attendance` に別途記録します。旧 `event_cast_present` の値は migration で `casts.is_attend` へ引き継ぎますが、既存DBの互換データを破壊しないためテーブル自体は削除しません。現行UIから利用していない `header_templates` も同じ理由でschemaを保持します。

初回取込時にセッションがなければ作成し、以後の再取込は現在セッションの応募者を transaction で全置換します。応募者の個別削除は `applicants.id` を使い、残りの一覧を置換しません。これにより、旧DBに空・重複 X ID が複数残っていても1件ずつ手動削除できます。応募者の置換・個別削除時は、応募者IDに依存する現行抽選と名前付き保存抽選も破棄し、条件revisionを更新します。過去版が作成した複数セッションの自動削除は行いません。

## State and lifecycle

`desktop/src/stores/AppContext.tsx` は、現在の画面、イベントとセッション、SQLiteから読み込んだ表示データ、マッチング結果を保持します。永続的な業務データの正はSQLiteであり、Context は現在開いているDBの表示キャッシュと一時的な操作状態です。当選者、確定当選者、抽選・マッチング条件を localStorage へ二重保存しません。テーマとテーマ調整は、実際に画面全体へ適用する `AppContainer` が保持します。

出欠、応募者削除、抽選、確定当選者の選択は、従来の操作感を保つため画面へ先に反映します。応募者・抽選・キャスト・セッション条件の書込みは、対象DB単位のRepositoryキューで呼出順に実行します。画面状態を戻すのは最新操作の保存に失敗した場合だけです。別の保存処理を理由に抽選画面全体をロックしません。新しい抽選結果は画面へ先に表示し、保存済み抽選の復元中は直前の結果を表示したままにします。どちらも対応する transaction が完了するまでは現行結果として扱わず、名前付き保存とマッチングを開始しません。

起動時は次の順序で復元します。

1. `initializeApp` がイベント一覧と前回選択を取得する。
2. `AppProvider` が共有DBと前回セッションDBを開く。
3. `AppContainer` がイベント共有データとセッションデータを読み込む。
4. 読込中に接続世代が変わった場合、イベント名とtimestampが再び同じでも古い非同期要求の結果は破棄する。

最後に開いたイベントとセッションは、version付きの単一JSONとして localStorage へ保存します。テーマ、テーマ調整、探索モードも端末設定として localStorage に置きます。旧版の業務データ用localStorageキーは現行状態の復元には使用しません。

Context の公開契約を変更するときは、`GuidePage.tsx` の `createGuideSampleContext` も更新します。ヘルプ画面は実画面コンポーネントを固定サイズのサンプルContext内で描画するためです。

## Matching

割り当て計算、結果整形、Worker実行は `desktop/src/features/matching/` に閉じています。画面間で共有する条件契約は `desktop/src/common/types/sessionWorkflow.ts`、条件と抽選結果の永続化はrepositoryとRust commandが担当します。

- `logics/`: 割り当て、NG判定、要注意人物判定などの純粋ロジック
- `presenters/`: 画面表示行とTSV出力への変換
- `stores/`: 端末単位の探索モードとイベント単位設定の保存境界
- `matching.worker.ts`: 計算量の大きい割り当てをUIスレッドから分離

マッチング結果はDBへ保存しません。抽選結果、キャスト、NG、希望キャストから再計算でき、入力変更時の失効管理を避けるためです。利用者が明示的に保存する抽選は、当選者、抽選・マッチング方式、抽選人数をセッションDBへ保存します。表示名は保存日時と当選人数から自動生成します。保存時は Rust が条件revisionの一致を確認し、同じ transaction 内で現行 `lottery_results` を保存先へコピーします。保存見出しの方式はDBの条件行から、抽選・確定当選の人数は現行結果から導出し、画面との二重管理を避けます。保存済み抽選を開くと、確定当選者draft、現行抽選結果、方式、抽選人数を同じ transaction で置き換えます。

`session_workflow_state` は条件revisionと、現行抽選結果を確定したrevisionを保持します。条件・確定当選者・応募者が変わると結果を古い状態として扱います。抽選結果保存時は期待revisionをtransaction内で比較し、処理中に条件が変わっていれば保存全体を取り消します。

Web Workerを開始する前に、イベント共有DBと取込セッションDBの先行書込みを完了させ、画面上の条件・抽選結果・キャスト情報がDBのスナップショットと一致することを確認します。計算完了時にも接続世代、書込み世代、画面入力を比較し、計算中に入力が変わった結果は画面へ反映しません。楽観更新の保存失敗後にDBを再読込している間も、同じデータから新しいマッチングを開始しません。

応募者の X ID は、前後の空白を除き大文字小文字を区別しない値で一意である必要があります。取込前とDB保存時に同じ規則で検査し、旧DBから読み込んだ一覧にも適用します。不正行が存在する間は抽選・マッチング画面を開かず、Backendも抽選結果の確定と履歴保存を拒否します。自動削除は行わず、画面には対象行を示して安定IDによる個別削除だけを許可します。

旧セッションDBの既存抽選結果は、V5 migrationとV6の追補で旧版と同じく現在の結果として扱います。旧条件との一致を推測するのではなく、既存結果を現行扱いした旧版の外部挙動を維持する互換処理です。結果が存在しないセッションや、移行後に条件revisionが進んだセッションを誤って確定済みにはしません。旧共有DBの要注意人物は、自動候補から追加したか手動登録から追加したかの区分、NGキャスト数、理由・メモを変更せず保持します。過去の開発版で互換テーブルが欠落したDBは、後続migrationで `event_cast_present` と `header_templates` のschemaを非破壊で復元します。`event_cast_present` の欠損行は、旧表からV3で移した現行の正 `casts.is_attend` から復元します。失われた `header_templates` の内容は推測して作り直しません。

要注意ユーザーの X ID は、入力時の大文字小文字を保った `@username` 形式で保存します。候補集計と登録時の重複判定は保存表記の完全一致を使います。固定登録と応募者の照合時だけ小文字化と先頭 `@` の除去を行い、応募者名と登録名が両方ある場合は名前も照合します。

希望または確定済みマッチングが現在存在しないキャストIDを参照する場合は、希望キャストとして判定できない可能性を警告します。抽選、マッチング、再実行、結果解除、PNG・TSV出力は制限しません。M000 はキャストを参照しない単純抽選なので、この警告も表示しません。

ワークフロー中の主な中間状態は次のとおりです。

| 状態 | 保存先 | 寿命 |
|---|---|---|
| 抽選・マッチング条件 | 取込セッションDB `session_workflow_state` | 応募者データ区切りを使う間 |
| 確定当選者draft | 取込セッションDB `applicants.is_guaranteed` | 次に変更または再取込するまで |
| 現行抽選結果 | 取込セッションDB `lottery_results` | 再抽選または応募者の置換・削除まで |
| 保存済み抽選 | 取込セッションDB `lottery_saved_runs` | 応募者の置換・削除まで |
| テーマ・探索モード・最終使用位置 | localStorage | 端末設定を変更・削除するまで |
| 計算中入力 | Web Worker の構造化コピー | 1回の計算完了または画面破棄まで |
| 最終マッチング | AppContext | アプリ終了、イベント・セッション切替、結果解除まで |

PNGとTSVは画面上の結果から都度生成し、アプリ内キャッシュとして保持しません。

## Legacy data

次の旧形式データには、専用の検出・移行UIがありません。

- `Data/db/stargazer.db`
- `Data/<event>/db/stargazer.db`
- 旧 `stargazer_session` / `stargazer_matching_settings`

イベント一覧は有効な名前のディレクトリを列挙し、現行DBがない場合は初回open時に作成します。`db`、`logs`、`archive` もイベント名に使用でき、改名・削除はイベントの親ディレクトリ単位で行います。旧単一DBや別用途のファイルが同じディレクトリにある場合も自動判別しないため、旧データを保持する必要がある場合は操作前に `Data` を退避してください。旧globalデータをどのイベントへ、旧応募者データをどのセッションへ移すかは未決定です。

現行インストーラーの通常アンインストールでは `Data/archive` と通常のイベントディレクトリを残し、`Data/db`、`Data/logs`、旧WebView profileを削除します。このため、旧データやイベント名 `db`・`logs` のデータを残す場合は事前の退避が必要です。アンインストール時の保持範囲と、業務データの保存先をインストール先から分離するかは、既存データの移行方法と合わせて判断します。

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
| `desktop/src-tauri/` | OS連携、migration、transaction を伴う永続化 |

小さな型や補助関数は、単一の利用元しかない限り所有 feature の近くに置きます。共有化は、複数箇所の規則を一つの正へ統合できる場合に限ります。

## Verification

Frontend の純粋ロジックと repository は Vitest、Backend の migration と transaction は Rust test で確認します。

```bash
npm test
npm run test:coverage
npm run build --prefix desktop
cargo test --manifest-path desktop/src-tauri/Cargo.toml
```

`npm run build --prefix desktop` は TypeScript と Vite の生成までを確認します。ルートの `npm run build` は Tauri の配布物生成を含むため、リリース前に実行します。
