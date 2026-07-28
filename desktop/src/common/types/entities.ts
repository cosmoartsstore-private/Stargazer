export interface UserExtraField {
  key: string;
  value: string;
}

export interface UserBean {
  /** DBから読み込んだ応募者の安定ID。取込前のプレビュー行には存在しない。 */
  id?: number;
  name: string;
  x_id: string;
  vrc_url?: string; // VRCアカウントURL(オプション)
  casts: string[];
  /** casts と同じ順位に対応する安定ID。null は現在のキャストへ解決できない希望を表す。 */
  cast_ids?: Array<number | null>;
  /** 希望の扱い: ranked=第1〜3希望、flat=順不同の複数希望（全て50点） */
  preference_mode?: 'ranked' | 'flat';
  is_guaranteed?: boolean; // 確定枠フラグ
  raw_extra: UserExtraField[];
}

/** NGユーザー1件（仕様: username / accountId）。登録時は名前＋X ID。 */
export interface NGUserEntry {
  username?: string;
  accountId?: string;
  /** NGにした理由や、運営内で共有する補足。 */
  notes?: string;
}

/** 固定登録した要注意人物。X IDを必須とし、双方にユーザー名がある場合は名前も照合する。 */
export interface CautionUser {
  username: string;
  accountId: string;
  /** 旧データとの互換情報。未指定の新規登録は手動登録として保存する。 */
  registrationType?: 'auto' | 'manual';
  ngCastCount?: number;
  registeredAt?: string;
  reason?: string;
  notes?: string;
}

export interface CastBean {
  /** イベント共有DBでキャストを識別する安定ID。 */
  id: number;
  name: string;
  /** 源氏名など、取込時の希望名として正式名と同様に扱う別名。 */
  aliases?: string[];
  is_present: boolean;
  /** 連絡先一覧（Discord DM URL・WebプロフィールURL・Xの @username など）。＋で複数追加可能 */
  contact_urls?: string[];
  /** 仕様準拠のNGリスト（ユーザー名・アカウントID） */
  ng_entries?: NGUserEntry[];
  /** グループ名（1期生・2期生など） */
  group_name?: string;
  /** プロフィール写真（data URL） */
  photo_data_url?: string;
  /** キャストメモ */
  memo?: string;
}
