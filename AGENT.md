# Stargazer エージェント向け索引

このファイルはプロジェクト固有情報への索引です。共通の開発方針は Codex のグローバルルールを正とし、ここでは重複させません。

## 読む順序

1. 利用方法と機能範囲: `README.md`
2. 実装境界と状態・DBの流れ: `docs/ARCHITECTURE.md`
3. 未決定のプロダクト仕様: `SPEC_DECISION_ITEMS.md`
4. 過去のUI検討資料: `.claude/design-references/README.md`

`.claude/` のその他の調査メモ、UIキャプチャ、実行ログは内部資料です。公開仕様として扱わず、必要な案件に対応する資料だけを参照してください。

## 実装上の制約

- 実装の起点は `desktop/` です。Frontend は React / TypeScript、Backend は Tauri / Rust です。
- SQLite schema の正は `desktop/src-tauri/src/lib.rs` の現行 schema 定義とします。Frontend repository に DDL を重複させません。
- 複数SQLを伴う更新は Rust command の transaction で実行します。Frontend repository は読み取りと command 呼び出しの境界です。
- イベント共有DBと取込セッションDBの所有データを混在させません。詳細は `docs/ARCHITECTURE.md` を参照してください。
- `AppContextType` を変更した場合は、ヘルプ画面の実画面プレビュー用 context (`GuidePage.tsx`) も追従させます。
- 業務結果に影響する抽選・マッチング・取込・永続化の純粋処理には回帰テストを追加します。
- 単純な属性列挙、短い引数、短いオブジェクトは、1行で意図を追える範囲なら機械的に縦へ分割しません。formatter が改行する長さや、条件・副作用を含む処理は読みやすさを優先します。

## 検証

```bash
npm test
npm run test:coverage
npm run build --prefix desktop
cargo test --manifest-path desktop/src-tauri/Cargo.toml
```

配布物まで確認する場合は、上記に加えてルートで `npm run build` を実行します。

## 文書の配置

- 利用者・開発者向けの正式情報: `README.md`, `docs/`
- 未決定の仕様判断: `SPEC_DECISION_ITEMS.md`
- 調査メモ、監査引き継ぎ、ログ、キャプチャ: `.claude/`
- ルート直下へ検証用ファイルを追加せず、公開対象か内部資料かを先に分類してください。
