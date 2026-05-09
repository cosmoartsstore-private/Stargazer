export const NAV = {
  GUIDE: 'ヘルプ',
  SETTINGS: 'テーマ',
} as const;

export const DEFAULT_ROTATION_COUNT = 2;

export const IMPORT_OVERWRITE = {
  MODAL_TITLE: '応募データの上書き',
  MODAL_MESSAGE: '応募データが既にあります。\n上書きして取り込みますか？（現在の応募者・当選結果・マッチング結果はクリアされます）',
  CONFIRM_LABEL: '取り込む',
  CANCEL_LABEL: 'キャンセル',
} as const;
