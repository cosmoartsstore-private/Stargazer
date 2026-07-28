# ThemeSelector・文言管理・テスト配置変更計画 2026-07-27

## 位置づけ

この文書は、`ThemeSelector.tsx` の JSX 整理、Frontend 文言の一括管理、native HTML `title` 属性の撤去、Frontend テストと coverage の配置変更に関する実装前メモです。

別セッションの大規模な未コミット変更が完了していないため、現時点では実装しません。着手時はこの文書の件数や差分をそのまま前提にせず、最新の作業ツリーを再確認します。

この文書はプロジェクト内の変更計画だけを扱います。Codex のグローバルルール変更は別件です。

## ユーザー要件

- 短い `input`、`button` などは、視認できる範囲で属性をインラインに配置してよい。
- JSX 属性内に複数文の callback、複雑な条件式、長い style オブジェクトなどがある場合は、処理を縦に追える形へ整理する。
- callback の処理には、責務が分かる名前を付ける。
- Frontend の表示文言を、`messages.ja.properties` と `getMsg(key, params)` に相当する仕組みで一括管理する。
- 機能と意味が同一の共通文言だけを `common.*` とし、固有文言は所有コンポーネント名を名前空間にする。
- 独自コンポーネントの可視見出しを除き、native HTML `title` 属性を撤去する。
- Frontend テストは本体の隣へ置かず、`desktop/src/test` 配下へ集約する。
- Frontend の coverage レポートは `desktop/src/coverage` 配下へ出力する。
- 単純な private helper をテスト目的で公開せず、原則として公開処理を通した振る舞いを検証する。

## 調査時点の確認結果

- `desktop/src/components/ThemeSelector.tsx` は 147 行で、未コミット差分があります。差分の大部分は JSX の整形です。
- Frontend テストは 36 ファイルあり、すべて本体と隣接しています。調査時点では 23 ファイルが変更済み、7 ファイルが未追跡です。
- 相対 import、`vi.mock`、動的 import を含め、テスト移動に伴って更新が必要な module specifier は 53 件です。
- AST で確認した native HTML `title` 属性は 14 ファイル 32 件です。
- 同じ `title` という prop 名でも、`AppDialog`、`ConfirmModal`、Guide 内の `Section` などが表示する可視見出しは 78 件あり、native HTML 属性とは区別します。
- `getMsg`、`messages.ja.properties`、i18n ライブラリは未導入です。
- 日本語リテラルの計画用概算は、非テストの TS/TSX 40 ファイル、907 種類です。`GuidePage.tsx` が約半数を占めます。
- coverage は `@vitest/coverage-v8` が生成する Frontend 用レポートで、Rust および `src-tauri` とは無関係です。
- 現行設定は OS 一時領域へ coverage を出力しています。`desktop/coverage` には旧レポートの残骸があります。

## セルフレビューで確定した方針

### JSX と callback

- 単純な属性列挙は、1 行で意図を追える場合に限りインラインを許容します。
- 複数文、条件分岐、値変換、副作用を含む callback は、名前付き handler へ分離します。
- `map` 内で ID や index を渡すだけの薄い callback は許容し、実処理を名前付き関数へ置きます。関数 factory や `data-*` 属性へ機械的に置き換えません。
- 複雑な `className`、style オブジェクト、長い fallback は JSX より前で名前付きの値として計算します。
- 行数だけを理由にコンポーネントを細分化しません。`ThemeSelector.tsx` は同一ワークフロー内の凝集を維持します。

### 文言管理

- `desktop/src/messages/messages.ja.properties` を UTF-8 の正本とします。
- `desktop/src/messages/getMsg.ts` で raw resource を読み込み、`getMsg(key, params?)` を提供します。
- 補間は `{count}`、`{name}` などの名前付き変数だけを扱います。条件判断や業務ロジックは呼出側に残します。
- 外部 i18n ライブラリ、code generation、翻訳用 DTO は導入しません。
- 重複キー、未知キー、未解決 placeholder は開発・テスト時に検出します。
- 可視文言、確認・エラー文、ARIA 文言、利用者向け生成内容を対象とします。内部識別子、console 専用ログ、外部仕様由来の定型値は対象外です。
- `common.*` は表記が同じだけでは採用せず、操作と意味が同一の場合に限定します。
- Guide の装飾付き文章は HTML 文字列にせず、JSX 構造を残したまま文言断片をキー化します。
- 純粋ロジックの戻り値形式を、文言移行だけを理由に広範囲へ変更しません。既存契約を保てる範囲で `getMsg` を利用します。

### native HTML title

- 最終的に native HTML `title` 属性を 0 件にします。
- 可視見出しを表す独自コンポーネントの `title` prop は維持し、値だけを文言管理へ移します。
- 可視文言と重複する tooltip は、代替を追加せず削除します。
- アイコンだけの操作は `aria-label` へ操作名を移します。
- NG 理由など、現在 `title` にしかない業務情報は、可視表示または `aria-describedby` などへ移してから属性を削除します。
- 省略表示された文字列は DOM 上に全文が残るかを確認し、情報自体を削除しません。

### テストと private helper

- 着手時点に存在する Frontend テストを、製品ツリーを鏡写しにした `desktop/src/test/{common,db,features,layout,stores}` へ移します。
- 移動に必要な参照変更は既存の `@/*` alias を用い、深い相対パスを追加しません。`vi.mock` と本体 import が同じ module として解決されることをテストで確認します。
- まず配置移動だけを行って全テストを実行し、その後に private helper の公開境界を変更します。
- `buildTsvContent`、`clearLastLocation`、`normalizeSessionWorkflowRow`、`requiresOpenEvent`、`waitForEventNameWritesToSettle` は、公開フロー経由で同じ仕様を検証できるため、非公開化の候補とします。
- `CommandWriteQueue` は、非同期処理の直列化、失敗伝播、待機中追加、活動世代という複雑な契約を持つため、直接テストを認める例外とします。
- UI handler をテスト目的で export しません。今回のリファクタリングだけを理由に、新しい DOM テストライブラリは追加しません。

### coverage

- `desktop/vite.config.ts` の `reportsDirectory` を `desktop/src/coverage` に変更します。
- `.gitignore` も新しい出力先に合わせ、旧 `desktop/coverage` の生成物はコピーせず除去します。
- 外部ドライブ上で過去に権限問題があったため、移動後は clean な状態から coverage を再生成します。
- 生成に失敗しても OS 一時領域へ無断で戻さず、原因と未完了項目を報告します。

## 実施順序

1. 別セッション完了後に `git status`、対象差分、テスト数、native HTML `title` 数を再取得する。
2. 現行テストを変更前に実行し、開始時点の基準を固定する。
3. Frontend テストを `desktop/src/test` へ機械的に移し、参照を更新して再実行する。
4. coverage の出力先と ignore を変更し、`desktop/src/coverage` への生成を確認する。
5. `messages.ja.properties`、`getMsg`、補間と異常系のテストを追加する。
6. `ThemeSelector.tsx` を先行して、JSX、callback、文言、native HTML `title` を整理する。
7. 共通部品、layout、各 feature、Guide の順に文言と native HTML `title` を移行する。同時に、同じファイル内の複雑な JSX callback を整理する。
8. private helper の公開境界を整理し、公開フロー経由のテストへ変更する。
9. 検索、テスト、coverage、Frontend build、画面確認、文書確認を実施する。

各段階で検証し、配置変更、文言移行、挙動変更を一つの未検証差分へまとめません。

## 検証項目

- `desktop/src/test` 外に Frontend の `.test.ts` / `.test.tsx` が残っていないこと。
- native HTML `title` 属性が 0 件で、独自コンポーネントの可視見出しが維持されていること。
- 対象となる利用者向け文言が source 内へ直書きされていないこと。
- `npm test`
- `npm run test:coverage`
- coverage が `desktop/src/coverage` に生成され、既存 threshold を満たすこと。
- `npm run build --prefix desktop`
- `git diff --check`
- `ThemeSelector` の開閉、テーマ切替、色追加・削除、Hex 入力の blur 正規化、方向・強度・色相、選択中テーマだけのリセットが従来どおり動くこと。

## 競合回避と着手条件

- 別セッションの変更が完了し、ユーザーから実装開始の指示を受けるまで着手しません。
- 着手時は現在の未コミット内容を正とし、HEAD から古い内容を復元しません。
- 他セッションの変更を stash、reset、checkout、上書きしません。
- 調査時の件数とファイル一覧は参考値であり、着手直前の再確認結果を正とします。
