/** 0始まりの列インデックス。-1 = 使わない */
export interface ColumnMapping {
  name: number;
  x_id: number;
  vrc_url: number;
  cast1: number;
  cast2: number;
  cast3: number;
  /** 応募リストに出す追加列(ラベル付きで raw_extra に入る) */
  extraColumns?: { columnIndex: number; label: string }[];
  /** 希望キャストの形式: 'multiple' = 複数指定可(カンマ区切り), 'single' = 単一項目 */
  castInputType: 'multiple' | 'single';
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
    castInputType: 'single',
  };
}

/** TSV の見出しから既知の応募項目を判定し、初期列設定を返す。 */
export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping = createEmptyColumnMapping();
  let multipleCastColumn = -1;
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index].toLowerCase().trim();
    if (!header) continue;
    const isXIdHeader = /\bx[\s_-]*id\b|twitter|アカウント\s*id/.test(header);
    if (isXIdHeader) {
      if (mapping.x_id < 0) mapping.x_id = index;
      continue;
    }
    if (
      mapping.name < 0
      && (/名前|お名前|ユーザー名/.test(header) || /\b(?:display[\s_-]+name|user[\s_-]*name|name)\b/.test(header))
    ) {
      mapping.name = index;
      continue;
    }
    if (mapping.vrc_url < 0 && /vrc|vrchat|プロフ/.test(header)) { mapping.vrc_url = index; continue; }
    if (mapping.cast1 < 0 && /第1希望|希望キャスト\s*1|希望1|第一希望|1st|choice\s*1/.test(header)) { mapping.cast1 = index; continue; }
    if (mapping.cast2 < 0 && /第2希望|希望キャスト\s*2|希望2|第二希望|2nd|choice\s*2/.test(header)) { mapping.cast2 = index; continue; }
    if (mapping.cast3 < 0 && /第3希望|希望キャスト\s*3|希望3|第三希望|3rd|choice\s*3/.test(header)) { mapping.cast3 = index; continue; }
    if (
      multipleCastColumn < 0
      && (/カンマ区切り/.test(header) || /^希望キャスト$/.test(header) || /^希望$/.test(header))
    ) {
      multipleCastColumn = index;
    }
  }
  if (
    multipleCastColumn >= 0
    && mapping.cast1 < 0
    && mapping.cast2 < 0
    && mapping.cast3 < 0
  ) {
    mapping.cast1 = multipleCastColumn;
    mapping.castInputType = 'multiple';
  }
  return mapping;
}

/** 複数回答形式では未使用となる第2・第3希望列を除外する。 */
export function resolveImportColumnMapping(mapping: ColumnMapping): ColumnMapping {
  return mapping.castInputType === 'multiple'
    ? { ...mapping, cast2: -1, cast3: -1 }
    : mapping;
}

/** 応募項目へ割り当て済みの列インデックスを返す。 */
export function getMappedColumnIndexes(mapping: ColumnMapping): Set<number> {
  return new Set([
    mapping.name,
    mapping.x_id,
    mapping.vrc_url,
    mapping.cast1,
    mapping.cast2,
    mapping.cast3,
  ].filter((index) => index >= 0));
}
