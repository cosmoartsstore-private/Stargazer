/** 0始まりの列インデックス。-1 = 使わない */
export interface ColumnMapping {
  name: number;
  x_id: number;
  vrc_url: number;
  cast1: number;
  cast2: number;
  cast3: number;
  /** 2列目ユーザー名(例: VRC名)。name が空のときのフォールバック */
  nameColumn2?: number;
  /** 応募リストに出す追加列(ラベル付きで raw_extra に入る) */
  extraColumns?: { columnIndex: number; label: string }[];
  /** 希望キャストの形式: 'multiple' = 複数指定可(カンマ区切り), 'single' = 単一項目 */
  castInputType?: 'multiple' | 'single';
  castUseWeight?: boolean;
}

/** 全項目を「未選択」で初期化（-1 = 使わない） */
export function createEmptyColumnMapping(): ColumnMapping {
  return {
    name: -1,
    x_id: -1,
    vrc_url: -1,
    cast1: -1,
    cast2: -1,
    cast3: -1,
  };
}

/** アカウントID(X)が指定されていれば true（必須） */
export function hasRequiredIdentityColumn(m: ColumnMapping): boolean {
  return m.x_id >= 0;
}
