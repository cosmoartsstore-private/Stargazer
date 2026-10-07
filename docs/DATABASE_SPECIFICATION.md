# Stargazer DB仕様書

## 1. 文書管理

| 項目 | 内容 |
|---|---|
| 文書ID | SG-DB-001 |
| 文書種別 | 物理DB・永続化仕様書 |
| 対象製品 | Stargazer |
| 対象バージョン | 0.1.0 |
| 文書版 | 1.2 |
| 基準日 | 2026-09-07 |
| Schema正本 | desktop/src-tauri/src/lib.rs のSHARED_SCHEMA、SESSION_SCHEMA |
| 対象読者 | 開発担当者、保守担当者、障害調査担当者、data移行担当者 |
| 関連文書 | [Stargazer 外部仕様書](EXTERNAL_SPECIFICATION.md) |

### 1.1 対象

- Stargazer所有SQLite DBの配置、table、column、key、index、constraint
- Event共有DBと取込session DBの所有境界
- JSON snapshot、localStorage、backup manifestを含む永続化境界
- Schema作成、検証、更新、破棄、backup・復元の整合性規則
- StellaRecord所有DBへの外部書込境界

### 1.2 対象外

- 画面layout、操作文言、受入条件
- Matching algorithmの内部計算
- Test fixtureと開発用database
- 未release形式に対するmigration

## 2. Storage architecture

### 2.1 DB区分

| DB ID | 区分 | Path | Ownership | 寿命 |
|---|---|---|---|---|
| DB-SHARED | Event共有DB | Data/<event>/shared/db/stargazer.db | Stargazer | Event削除まで |
| DB-SESSION | 取込session DB | Data/<event>/<YYYYMMDDhhmmss>/db/stargazer.db | Stargazer | 作業session破棄まで |
| DB-STELLA | StellaRecord apps DB | Registry DbPathの参照先 | StellaRecord | StellaRecord側の管理 |

### 2.2 App root解決順

| Priority | 解決元 |
|---:|---|
| 1 | HKCU\Software\CosmoArtsStore\Stargazer のInstallLocation |
| 2 | 実行中Stargazer.exeの親directory |
| 3 | %LOCALAPPDATA%\CosmoArtsStore\Stargazer |

### 2.3 Directory構造

    <app-root>/
      Data/
        <event>/
          shared/
            db/
              stargazer.db
          <14桁日時>/
            .stargazer-in-progress
            db/
              stargazer.db
      Cache/
        EBWebView/

### 2.4 Path constraint

| 対象 | Constraint |
|---|---|
| Event名 | ASCII英数字、hyphen、underscoreのみ |
| Event名長 | 1～64文字 |
| Windows予約名 | CON、PRN、AUX、NUL、COM1～COM9、LPT1～LPT9の拒否 |
| Event名重複 | ASCII英字大小を無視した一意性 |
| Session directory名 | ASCII数字14桁 |
| Session時刻形式 | YYYYMMDDhhmmss |
| Windows長path | 既存親directoryのcanonicalize後における拡張長path対応 |

## 3. SQLite connection

| 項目 | 設定 |
|---|---|
| Foreign key | PRAGMA foreign_keys = ON |
| Journal mode | PRAGMA journal_mode = WAL |
| Busy timeout | 5秒 |
| 新規DB作成 | READ_WRITE + CREATE |
| 既存DB更新 | READ_WRITE |
| 復元検証 | READ_ONLY + NO_MUTEX |
| 複数statement更新 | Rust側transaction |
| Frontend直接処理 | 単純SELECTと単純key-value更新 |

新規directoryは、WAL checkpoint TRUNCATEの完了後に公開し、backupへ格納する。

## 4. Relationship overview

    DB-SHARED
      casts
        ├─ cast_aliases
        ├─ cast_urls
        ├─ cast_ng_entries
        └─ cast_attendance
      attendance_record_dates
      caution_users
      meta
      settings
      saved_results

    DB-SESSION
      applicants
        ├─ applicant_casts
        ├─ applicant_extra
        └─ lottery_results
      session_workflow_state

    Logical cross-DB reference
      applicant_casts.cast_id ─ ─ ─ > DB-SHARED.casts.id

DB間にはforeign keyを設けない。取込時の表示名は、applicant_casts.cast_nameへsnapshotとして保持する。

## 5. Event共有DB

### 5.1 meta

metaは、Event固有の単一値情報を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| key | TEXT | 可 | なし | PRIMARY KEY、meta key |
| value | TEXT | 可 | なし | meta value |

### 5.2 casts

castsは、Event内のcast masterを保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT、安定ID |
| name | TEXT | 不可 | なし | UNIQUE、正式名 |
| group_name | TEXT | 可 | NULL | Group名 |
| is_attend | INTEGER | 不可 | 1 | 0: 未出席、1: 出席 |
| photo_data_url | TEXT | 可 | NULL | 画像Data URL |
| memo | TEXT | 可 | NULL | Profile |
| created_at | TEXT | 不可 | SQLite local datetime | 作成日時 |

### 5.3 cast_urls

cast_urlsは、Cast連絡先を登録順に保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT、表示順補助 |
| cast_id | INTEGER | 不可 | なし | casts.id、ON DELETE CASCADE |
| url | TEXT | 不可 | なし | URLまたは自由記入 |

### 5.4 cast_ng_entries

cast_ng_entriesは、Cast別のNG登録を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT、表示順補助 |
| cast_id | INTEGER | 不可 | なし | casts.id、ON DELETE CASCADE |
| username | TEXT | 可 | NULL | 表示名 |
| userid | TEXT | 可 | NULL | X username、先頭@なし |
| notes | TEXT | 可 | NULL | 理由・メモ |

### 5.5 caution_users

caution_usersは、固定登録した要注意人物を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | 不可 | なし | 登録表示名 |
| account_id | TEXT | 不可 | なし | X username、COLLATE NOCASE、UNIQUE |
| notes | TEXT | 可 | NULL | 理由・メモ |
| ng_cast_count | INTEGER | 不可 | 0 | 登録時のNG cast数 |
| registered_at | TEXT | 不可 | SQLite local datetime | 登録日時 |

### 5.6 cast_attendance

cast_attendanceは、指定日に出席したCastの明細を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT |
| cast_id | INTEGER | 不可 | なし | casts.id、ON DELETE CASCADE |
| recorded_at | TEXT | 不可 | SQLite local datetime | 記録日または記録日時 |

### 5.7 attendance_record_dates

attendance_record_datesは、出席者0名を含む記録日のmasterを保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| recorded_at | TEXT | 可 | なし | PRIMARY KEY、画面保存値YYYY-MM-DD |

### 5.8 cast_aliases

cast_aliasesは、Castの別名義を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT、表示順補助 |
| cast_id | INTEGER | 不可 | なし | casts.id、ON DELETE CASCADE |
| alias | TEXT | 不可 | なし | 別名義 |

Table constraintは、UNIQUE(cast_id, alias)とする。

### 5.9 settings

settingsは、Event単位のkey-value設定を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| key | TEXT | 可 | なし | PRIMARY KEY |
| value | TEXT | 不可 | なし | 文字列value |

### 5.10 saved_results

saved_resultsは、利用者が明示保存した抽選・matching結果を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT |
| source_session_token | TEXT | 不可 | なし | UNIQUE、保存元session識別子 |
| result_type | TEXT | 不可 | なし | lottery / matching |
| label | TEXT | 不可 | なし | 表示名、command境界1～200文字 |
| matching_type_code | TEXT | 不可 | なし | M000 / M001 / M002 / M003 |
| lottery_count | INTEGER | 可 | NULL | 抽選resultだけの無作為当選数 |
| guaranteed_count | INTEGER | 可 | NULL | 抽選resultだけの確定当選数 |
| winner_count | INTEGER | 不可 | なし | 1以上の総当選数 |
| snapshot_json | TEXT | 不可 | なし | 固定表示・再構築用JSON |
| created_at | TEXT | 不可 | SQLite local datetime | 保存日時 |

Table constraintは次のとおりとする。

- Lottery: lottery_count 1以上、guaranteed_count 0以上、winner_countとの合計一致
- Matching: matching_type_code M001～M003、lottery_count NULL、guaranteed_count NULL
- source_session_token一意性による1 session 1保存結果

## 6. 取込session DB

### 6.1 applicants

applicantsは、取り込んだ応募者のmasterを保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT、画面内安定ID |
| x_id | TEXT | 不可 | なし | X ID原文または正規化username |
| name | TEXT | 可 | NULL | 表示名 |
| vrc_url | TEXT | 可 | NULL | VRChat参照値 |
| preference_mode | TEXT | 不可 | なし | ranked / flat |
| is_guaranteed | INTEGER | 不可 | 0 | 0: 通常、1: 確定当選 |
| created_at | TEXT | 不可 | SQLite local datetime | 作成日時 |

X IDが不正な行も保存するが、抽選・matching commandの境界で利用を拒否する。

### 6.2 applicant_casts

applicant_castsは、応募者の希望Castを保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT |
| applicant_id | INTEGER | 不可 | なし | applicants.id、ON DELETE CASCADE |
| preference_order | INTEGER | 不可 | なし | 0始まりの希望位置 |
| cast_name | TEXT | 不可 | なし | 取込・再選択時の正式名snapshot |
| cast_id | INTEGER | 可 | NULL | DB-SHARED.casts.idへの論理参照 |

rankedでは希望位置を保持し、flatでは有効な希望だけを連続した位置に格納する。

### 6.3 applicant_extra

applicant_extraは、標準項目へ割り当てなかったTSV列を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT、取込列順補助 |
| applicant_id | INTEGER | 不可 | なし | applicants.id、ON DELETE CASCADE |
| field_key | TEXT | 不可 | なし | TSV header |
| field_value | TEXT | 可 | NULL | Cell value |

### 6.4 lottery_results

lottery_resultsは、現行抽選結果を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT、結果順 |
| applicant_id | INTEGER | 不可 | なし | applicants.id、ON DELETE CASCADE |
| is_guaranteed | INTEGER | 不可 | 0 | 0: 無作為当選、1: 確定当選 |
| drawn_at | TEXT | 不可 | SQLite local datetime | 抽選確定日時 |

### 6.5 session_workflow_state

session_workflow_stateは、Sessionごとに1行だけ抽選・matching条件を保持する。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 1 | PRIMARY KEY、CHECK id = 1 |
| session_token | TEXT | 不可 | 16 byte random hex小文字 | UNIQUE、保存済みresultとの対応 |
| is_lottery_read_only | INTEGER | 不可 | 0 | 0 / 1、保存済み抽選復元session区分 |
| matching_type_code | TEXT | 不可 | M001 | M000 / M001 / M002 / M003 |
| lottery_count | INTEGER | 不可 | 1 | 1以上 |
| rotation_count | INTEGER | 不可 | 2 | 1以上 |
| total_tables | INTEGER | 不可 | 15 | 1以上 |
| users_per_table | INTEGER | 不可 | 1 | 1以上 |
| casts_per_rotation | INTEGER | 不可 | 1 | 1以上 |
| reserve_same_day_slots | INTEGER | 不可 | 0 | 0 / 1 |
| same_day_slot_count | INTEGER | 不可 | 0 | 0以上 |
| same_day_slot_unit | TEXT | 不可 | table | person / table |
| condition_revision | INTEGER | 不可 | 0 | 条件世代 |
| lottery_result_revision | INTEGER | 可 | NULL | 現行抽選結果が基準とした条件世代 |

Schemaの初期化時に、id = 1の初期rowを挿入する。

## 7. Index

| DB | Index | Column | 用途 |
|---|---|---|---|
| DB-SHARED | sqlite自動index | casts.name | 正式名一意性 |
| DB-SHARED | sqlite自動index | caution_users.account_id | 大小文字を無視した一意性 |
| DB-SHARED | sqlite自動index | cast_aliases.cast_id, alias | Cast内別名義一意性 |
| DB-SHARED | idx_cast_aliases_cast_id | cast_id, id | Cast別の登録順読込 |
| DB-SHARED | sqlite自動index | saved_results.source_session_token | Session単位の保存済みresult確認 |
| DB-SHARED | idx_saved_results_type_created_at | result_type, created_at DESC, id DESC | 種別ごとの新しい順履歴 |
| DB-SESSION | idx_applicant_casts_cast_id | cast_id | 削除済み・未解決cast参照確認 |
| DB-SESSION | idx_applicants_x_id | x_id | X ID照合 |

## 8. Key catalog

### 8.1 meta

| Key | Value | Null | 更新元 |
|---|---|---:|---|
| notes | Event説明メモ | 可 | Event管理 |
| photo_data_url | Event写真Data URL | 可 | Event管理 |

### 8.2 settings

| Key | Value | 未保存時 |
|---|---|---|
| tweet_template | 投稿template文字列、最大500文字の画面入力 | Default template |
| caution_auto_register_threshold | 1以上の整数を表す10進文字列 | 2 |

汎用key-value schemaとして未定義keyの保存を許容するが、現行実装で利用するkeyは上記2種に限定する。

## 9. Value catalog

| Value | 意味 |
|---|---|
| matching_type_code M000 | 抽選のみ |
| matching_type_code M001 | Random matching |
| matching_type_code M002 | Rotation matching |
| matching_type_code M003 | Group matching |
| preference_mode ranked | preference_orderによる順位付き希望 |
| preference_mode flat | 順位なし希望 |
| same_day_slot_unit person | 人数単位の当日枠 |
| same_day_slot_unit table | Table単位の当日枠 |
| result_type lottery | 保存済み抽選 |
| result_type matching | 保存済みmatching |

## 10. Snapshot JSON

### 10.1 保存済み抽選

**Top-level exact key**

| Key | Type | 内容 |
|---|---|---|
| applicants | array | 保存時の全応募者 |
| workflow | object | 保存時の抽選・matching条件 |
| winners | array | 保存時の当選者と確定区分 |

**applicants element**

| Key | Type |
|---|---|
| name | string / null |
| x_id | string |
| vrc_url | string / null |
| casts | string[] |
| cast_ids | (integer / null)[] |
| preference_mode | ranked / flat |
| is_guaranteed | boolean |
| raw_extra | { key: string, value: string / null }[] |

**workflow exact key**

| Key | Type |
|---|---|
| matching_type_code | M000 / M001 / M002 / M003 |
| lottery_count | integer 1以上 |
| rotation_count | integer 1以上 |
| total_tables | integer 1以上 |
| users_per_table | integer 1以上 |
| casts_per_rotation | integer 1以上 |
| reserve_same_day_slots | boolean |
| same_day_slot_count | integer 0以上 |
| same_day_slot_unit | person / table |

winners elementは、x_id文字列とis_guaranteed booleanで構成する。

### 10.2 保存済みmatching

**Top-level exact key**

| Key | Type | 内容 |
|---|---|---|
| casts | array | 表示と整合性確認に必要なcast snapshot |
| applicants | array | 当選者と割り当て |
| tableSlots | array | Table・seat表示 |
| scoreSummary | object | 希望別件数とscore |

**casts element**

| Key | Type |
|---|---|
| id | integer |
| name | string |
| isPresent | boolean |
| ngEntries | { username: string / null, accountId: string / null }[] |

User objectは、name文字列とxId文字列で構成する。

**Assignment object**

| Key | Type | Constraint |
|---|---|---|
| castId | integer | casts内の存在ID |
| rank | integer | 0～3 |
| rotationIndex | integer | 0以上 |
| score | number | 有限、0以上 |
| isNgWarning | boolean | NG警告区分 |
| ngReason | string / null | NG警告時の非空文字列 |

applicants elementは、user objectと1件以上のmatchesで構成する。

tableSlots elementは、0以上のtableIndex、user objectまたはnull、matches arrayで構成する。

**scoreSummary exact key**

- totalScore
- averageScore
- firstChoiceCount
- secondChoiceCount
- thirdChoiceCount
- flatPreferenceCount
- unpreferredCount
- ngWarningCount

保存時に、JSON構造、当選者、条件、現行Cast・出席・NG状態が一致することを確認する。

## 11. Transaction and invariant

| Operation | DB | Transaction範囲 | 主invariant |
|---|---|---|---|
| Event新規作成 | DB-SHARED | Schema初期化と追加初期値 | 不完全directoryの非公開 |
| Session新規作成 | DB-SESSION | Schema初期化、応募者保存、marker作成 | 全Eventを通じた作業session 1件 |
| 応募者全置換 | DB-SESSION | 応募者、希望、追加列、抽選結果、revision | 途中失敗時の旧応募者維持 |
| 応募者個別削除 | DB-SESSION | 対象応募者、cascade、全抽選結果、revision | 他応募者IDの維持 |
| 応募者希望更新 | DB-SESSION | 対象希望list全置換 | 現行抽選結果の維持 |
| 抽選条件更新 | DB-SESSION | 条件row、revision、旧結果状態 | 変更時だけのrevision更新 |
| 確定当選者更新 | DB-SESSION | 全応募者確定flag、condition revision | X ID集合の一意一致、既存抽選結果のrevision不一致化 |
| 抽選結果全置換 | DB-SESSION | 旧結果削除、新結果挿入、result revision | expected condition revision一致 |
| Cast追加 | DB-SHARED | Cast、alias、URL、NG | 名称整合性 |
| Cast部分更新 | DB-SHARED | 指定fieldと指定child list | 指定外fieldの維持 |
| Cast削除 | DB-SHARED | Cast削除とcascade child | Session側logical referenceの非更新 |
| 出席記録 | DB-SHARED | 指定日の既存明細削除、記録日、出席明細 | 出席0名日の保持 |
| Event meta更新 | DB-SHARED | notes、photoの指定field | 指定外keyの維持 |
| 要注意人物upsert | DB-SHARED | account ID単位 | NOCASE一意性 |
| 保存済み抽選 | DB-SESSION + DB-SHARED | Session検証後のshared insert | 現行result・条件一致、1 session 1件 |
| 保存済みmatching | DB-SESSION + DB-SHARED | Session検証後のshared IMMEDIATE transaction | 現行result・cast状態一致、1 session 1件 |

SQLite fileをまたぐdistributed transactionは使用しない。shared insertの前にSessionを再検証し、source_session_tokenの一意性により競合を拒否する。

## 12. Session lifecycle

### 12.1 Creation

1. Event共有DBの現行schema確認
2. 全Event配下における既存作業sessionなしの確認
3. 14桁local時刻directory名の確定
4. 最終directoryと同じ親における一時directory作成
5. Session schemaのtransaction初期化
6. 応募者一式または保存済み抽選snapshotの保存
7. .stargazer-in-progress markerの作成
8. WAL checkpoint TRUNCATE
9. 一時directoryから最終directoryへのrename

### 12.2 Disposal

| Trigger | 対象 |
|---|---|
| 応募管理開始画面への復帰 | 現在session |
| Event切替 | 切替前session |
| App終了 | 現在session |
| 次回起動時清掃 | Marker付き残存session |

破棄対象directoryは、同一Event配下のquarantine名へrenameしてから再帰削除する。

Markerがない14桁directoryは、自動清掃の対象としない。

### 12.3 Saved lottery restoration

- SavedLotterySnapshotからの新規session再構築
- 応募者、workflow、lottery_resultsの復元
- is_lottery_read_only = 1による抽選入力固定
- M001～M003における後続matchingの許可

## 13. Schema initialization and validation

### 13.1 New DB

- 新規fileだけを対象としたCREATE
- Schema全体の単一transaction
- Required table一覧の存在確認
- 全required columnを参照するLIMIT 0 queryのprepare確認
- 初期化失敗時の一時directory削除

### 13.2 Existing DB

- 既存file必須
- Required table存在確認
- Required column queryのprepare確認
- 不一致時のopen拒否
- 自動column追加、自動table追加、migration、自動削除の不実施
- Schema version tableの非採用

### 13.3 Required table

| DB | Required table |
|---|---|
| DB-SHARED | meta、casts、cast_urls、cast_ng_entries、caution_users、cast_attendance、attendance_record_dates、cast_aliases、settings、saved_results |
| DB-SESSION | applicants、applicant_casts、applicant_extra、lottery_results、session_workflow_state |

## 14. Backup and restore

### 14.1 Archive format

| 項目 | 値 |
|---|---|
| Format | ZIP、Deflate |
| Manifest entry | stargazer-backup.json |
| Format ID | com.cosmoartsstore.stargazer-data-backup |
| Format version | 2 |
| DB entry | Data/<event>/shared/db/stargazer.db |
| Session DB | 対象外 |
| Manifest最大size | 1 MiB |
| 最大entry数 | 100,001 |
| 最大展開後合計size | 64 GiB |
| Encryption | なし |

**Manifest exact key**

| Key | Type |
|---|---|
| format | string |
| format_version | integer |
| created_at | RFC 3339 string |
| application_version | non-empty string |
| events | Event名昇順string[] |
| settings | 5 key object |

### 14.2 Backup

1. 作業session不在の確認
2. 端末設定形式とEvent一覧の確認
3. Event共有DBごとのintegrity_check
4. Event共有DBごとのWAL checkpoint TRUNCATE
5. ManifestとDB fileの一時ZIP書込
6. File sync
7. 新規保存または既存fileの退避後置換
8. 成功後の退避file削除

### 14.3 Restore

1. ZIP形式、entry数、重複名、symlink、展開後sizeの確認
2. Exact entry pathとManifest Event一覧一致の確認
3. App root配下の一時Dataへの展開
4. 全Event共有DBの現行schemaとintegrity_check
5. Restore tokenによる検証済み一時Dataの固定
6. DB connection閉鎖後の現在Data置換
7. 5端末設定の一括反映
8. 失敗時の旧Data rollbackまたは退避先通知

Archive entryは、Path traversalを許容しないexact構成とする。

## 15. localStorage

localStorageには、SQLite外で管理する端末単位の設定を保存する。

| Key | Format | Validation | Backup |
|---|---|---|---|
| stargazer_theme_id | dark / skyblue | 列挙値 | 対象 |
| stargazer_theme_customization | JSON | Exact key、Hex色、数値range、色数1～5 | 対象 |
| stargazer_import_column_mappings | JSON version 1 | Header string[]、列index、single / multiple | 対象 |
| stargazer_applicant_display_columns | JSON version 1 | 追加列header構成、vrc_url / raw_extra:indexの重複なし選択 | 対象 |
| stargazer:lastLocation | JSON | Event名と現存Eventの一致 | 対象 |

業務応募者、抽選結果、matching結果は、localStorageへ保存しない。

## 16. Direct input length and DB boundary

| Data | UI上限 | DB constraint |
|---|---:|---|
| Event名 | 64 | Path command境界64 |
| Event説明メモ | 2,000 | TEXT |
| Cast正式名 | 200 | TEXT UNIQUE |
| Cast group名 | 200 | TEXT |
| Cast別名義 | 200 | TEXT、Cast内UNIQUE |
| Cast profile | 2,000 | TEXT |
| Cast連絡先 | 4,096 | TEXT |
| NG表示名 | 200 | TEXT |
| X ID入力 | 16 | TEXT、保存・照合時の形式検証 |
| NG理由・メモ | 2,000 | TEXT |
| 投稿template | 500 | settings TEXT |
| 保存済みresult label | 自動生成 | Command境界200、TEXT |

直接文字入力の上限はUI境界で実装し、既存のTEXT valueに対するschema migrationは行わない。

## 17. StellaRecord external DB

### 17.1 Discovery

| 項目 | 値 |
|---|---|
| Registry | HKCU\Software\CosmoArtsStore\StellaRecord |
| Value | DbPath |
| 利用可能判定 | DbPath値あり、参照file存在 |

### 17.2 apps schema

このschemaはStellaRecordが所有し、Stargazer DB schemaの対象としない。

| Column | Type | Null | Default | Constraint / 意味 |
|---|---|---:|---|---|
| id | INTEGER | 不可 | 自動採番 | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | 不可 | なし | 製品名 |
| description | TEXT | 不可 | 空文字 | 製品説明 |
| path | TEXT | 不可 | なし | UNIQUE、実行path |
| icon | BLOB | 可 | NULL | PNG byte |
| registered_at | DATETIME | 可 | SQLite local datetime | 登録日時 |

CREATE TABLE IF NOT EXISTSの実行後にINSERT OR REPLACEを行い、pathの一意性を基準として登録する。

### 17.3 Write value

| Column | Value |
|---|---|
| name | Stargazer |
| description | Event抽選・cast matching用desktop app |
| path | 現在実行中のexe path |
| icon | 同梱128×128 PNG、読込失敗時NULL |

Event、応募者、抽選、matching、出席、NG、templateは転送しない。

## 18. Deletion and retention

| Operation | Physical target | Retention |
|---|---|---|
| Event削除 | Data/<event> | 当該Event共有DBと配下sessionの削除 |
| Session破棄 | Data/<event>/<timestamp> | Event共有DBの維持 |
| 通常uninstall | 実行file、resource、uninstaller、Cache/EBWebView、registry | Dataの維持 |
| Data backup | 利用者指定ZIP | App側自動削除なし |
| StellaRecord登録 | External apps row | Stargazer uninstall時の自動削除なし |

## 19. Change history

| Date | Version | 内容 |
|---|---|---|
| 2026-09-07 | 1.0 | 現行schema、永続化境界、snapshot、backup、external DBの統合 |
| 2026-09-07 | 1.1 | 応募データ表示項目の端末保存形式とbackup format version 2を追加 |
| 2026-09-07 | 1.2 | 説明文を述語で完結する常体へ統一し、表とラベルの名詞句表記と区別 |
