import type { UserBean } from '@/common/types/entities';

export interface LotteryPersistenceRow {
  x_id: string;
  is_guaranteed: boolean;
}

export interface LotteryRestoreRow {
  is_guaranteed: number;
  x_id: string;
}

/** 当選者一覧をDB commandへ渡す行へ変換し、重複を保存前に拒否する。 */
export function buildLotteryPersistenceRows(winners: UserBean[]): LotteryPersistenceRow[] {
  const seenXIds = new Set<string>();
  return winners.map((winner) => {
    if (seenXIds.has(winner.x_id)) {
      throw new Error(`当選者 ${winner.x_id} が重複しています。`);
    }
    seenXIds.add(winner.x_id);
    return { x_id: winner.x_id, is_guaranteed: !!winner.is_guaranteed };
  });
}

/** JOIN済みの抽選結果行を、現在の応募者一覧に対応する UserBean として復元する。 */
export function restoreLotteryWinners(rows: LotteryRestoreRow[], applicants: UserBean[]): UserBean[] {
  const xIdToUser = new Map(applicants.map((user) => [user.x_id, user]));
  const restoredXIds = new Set<string>();
  const restored: UserBean[] = [];
  for (const row of rows) {
    const user = xIdToUser.get(row.x_id);
    if (!user) {
      throw new Error(`保存時の応募者 ${row.x_id} は現在の取込データに存在しません。`);
    }
    if (restoredXIds.has(row.x_id)) {
      throw new Error(`保存済み抽選結果で応募者 ${row.x_id} が重複しています。`);
    }
    restoredXIds.add(row.x_id);
    restored.push({ ...user, is_guaranteed: row.is_guaranteed === 1 });
  }
  return restored;
}
