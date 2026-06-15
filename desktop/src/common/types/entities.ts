export interface UserBean {
  name: string;
  x_id: string;
  vrc_url?: string; // VRCアカウントURL(オプション)
  casts: string[];
  /** 希望の扱い: ranked=第1〜3希望、flat=順不同の複数希望（全て50点） */
  preference_mode?: 'ranked' | 'flat';
  is_guaranteed?: boolean; // 確定枠フラグ
  raw_extra: unknown[];
}

/** NGユーザー1件（仕様: username / accountId）。登録時は名前＋X ID。 */
export interface NGUserEntry {
  username?: string;
  accountId?: string;
}

export interface CastBean {
  name: string;
  is_present: boolean;
  /** 連絡先URL一覧（VRCプロフィール・X・Discord等）。＋で複数追加可能 */
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
