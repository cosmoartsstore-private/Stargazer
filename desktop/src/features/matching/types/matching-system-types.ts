/**
 * マッチングシステム機能追加仕様に基づく型定義。
 * 仕様書: docs/matching-system-specification.md
 *
 * NGUserEntry の正の定義は common/types/entities.ts にある。
 * このファイルでは re-export のみ行い、マッチング固有の型を定義する。
 */

/** NGUserEntry は entities.ts を正とする（username + accountId の2フィールド構成） */
export type { NGUserEntry } from '@/common/types/entities';

/** NG判定基準 */
export type NGJudgmentType = 'username' | 'accountId' | 'either';
export const FIXED_NG_JUDGMENT_TYPE: NGJudgmentType = 'accountId';

/** マッチング時の挙動 */
export type NGMatchingBehavior = 'warn' | 'exclude';

/** 探索モード */
export type MatchingSearchMode = 'efficiency' | 'quality';

/** 要注意人物（ユーザー名 AND アカウントID の両方で厳密一致） */
export interface CautionUser {
  username: string;
  accountId: string;
  registrationType: 'auto' | 'manual';
  ngCastCount?: number;
  registeredAt: string; // ISO
  reason?: string;
  notes?: string;
}

export interface CautionUserSettings {
  autoRegisterThreshold: number;
  cautionUsers: CautionUser[];
}

/** NG例外（応募リストの警告抑制のみ。キャストNGには影響しない） */
export interface NGException {
  username: string;
  accountId: string;
  registeredAt: string;
  note?: string;
}

export interface NGExceptionSettings {
  exceptions: NGException[];
}
