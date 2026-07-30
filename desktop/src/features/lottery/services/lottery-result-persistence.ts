import type { UserBean } from '@/common/types/entities';
import {
  formatXAccountIdForDisplay,
  normalizeXAccountId,
} from '@/common/xIdUtils';

export interface LotteryPersistenceRow {
  x_id: string;
  is_guaranteed: boolean;
}

export interface LotteryRestoreRow {
  is_guaranteed: number;
  x_id: string;
}

/** 当選者一覧をDB commandへ渡す形式へ整え、@有無や大小文字差による重複を防ぐ。 */
export function buildLotteryPersistenceRows(winners: UserBean[]): LotteryPersistenceRow[] {
  const seenXIds = new Set<string>();
  return winners.map((winner) => {
    const key = normalizeXAccountId(winner.x_id);
    if (!key) {
      throw new Error(`当選者 ${formatXAccountIdForDisplay(winner.x_id)} のX IDが不正です。`);
    }
    if (seenXIds.has(key)) {
      throw new Error(`当選者 ${formatXAccountIdForDisplay(winner.x_id)} が重複しています。`);
    }
    seenXIds.add(key);
    return { x_id: winner.x_id, is_guaranteed: !!winner.is_guaranteed };
  });
}

/** 保存行を現在の応募者一覧へ照合し、表示中データへ復元する。 */
export function restoreLotteryWinners(rows: LotteryRestoreRow[], applicants: UserBean[]): UserBean[] {
  const xIdToUser = new Map(
    applicants.flatMap((user) => {
      const key = normalizeXAccountId(user.x_id);
      return key ? [[key, user] as const] : [];
    }),
  );
  const restoredXIds = new Set<string>();
  const restored: UserBean[] = [];
  for (const row of rows) {
    const key = normalizeXAccountId(row.x_id);
    if (!key) {
      throw new Error(`保存時の応募者 ${formatXAccountIdForDisplay(row.x_id)} のX IDが不正です。`);
    }
    const user = xIdToUser.get(key);
    if (!user) {
      throw new Error(`保存時の応募者 ${formatXAccountIdForDisplay(row.x_id)} は現在の取込データに存在しません。`);
    }
    if (restoredXIds.has(key)) {
      throw new Error(`保存済み抽選結果で応募者 ${formatXAccountIdForDisplay(row.x_id)} が重複しています。`);
    }
    restoredXIds.add(key);
    restored.push({ ...user, is_guaranteed: row.is_guaranteed === 1 });
  }
  return restored;
}
