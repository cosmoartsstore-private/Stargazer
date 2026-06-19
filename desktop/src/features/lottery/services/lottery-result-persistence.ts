import { getSessionDb } from '@/db/database';
import type { UserBean } from '@/common/types/entities';

interface ApplicantIdRow {
  id: number;
  x_id: string;
}

export interface LotteryPersistenceRow {
  applicant_id: number;
  is_guaranteed: boolean;
}

export interface LotteryRestoreRow {
  applicant_id: number;
  is_guaranteed: number;
}

export interface LotteryPersistenceSummary {
  lotteryCount: number;
  guaranteedCount: number;
  winnerCount: number;
}

/** 現在セッション DB の応募者 ID と X ID の対応を取得する。 */
async function getApplicantIdRows(): Promise<ApplicantIdRow[]> {
  const db = getSessionDb();
  return db.select<ApplicantIdRow[]>('SELECT id, x_id FROM applicants');
}

/** 応募者 ID 対応表から、抽選結果保存と復元で使う双方向 map を作る。 */
function createApplicantIdMaps(applicantRows: ApplicantIdRow[]): {
  idByXId: Map<string, number>;
  xIdById: Map<number, string>;
} {
  return {
    idByXId: new Map(applicantRows.map((row) => [row.x_id, row.id])),
    xIdById: new Map(applicantRows.map((row) => [row.id, row.x_id])),
  };
}

/** 当選者一覧を、DB の lottery_results に保存できる applicant_id ベースの行へ変換する。 */
export async function buildLotteryPersistenceRows(winners: UserBean[]): Promise<LotteryPersistenceRow[]> {
  const { idByXId } = createApplicantIdMaps(await getApplicantIdRows());
  const seenApplicantIds = new Set<number>();
  const rows: LotteryPersistenceRow[] = [];
  for (const winner of winners) {
    const id = idByXId.get(winner.x_id);
    // 保存済み抽選結果は run_id/applicant_id が一意のため、同じ applicant_id の当選者は先頭だけ保存する。
    if (id == null || seenApplicantIds.has(id)) continue;
    seenApplicantIds.add(id);
    rows.push({ applicant_id: id, is_guaranteed: !!winner.is_guaranteed });
  }
  return rows;
}

/** 保存対象になった抽選結果行だけを基準に、確定枠当選数を数える。 */
export function countGuaranteedPersistenceRows(rows: readonly LotteryPersistenceRow[]): number {
  return rows.filter((row) => row.is_guaranteed).length;
}

/** 保存対象行から、保存済み抽選結果の見出しに使う件数を一貫して算出する。 */
export function summarizeLotteryPersistenceRows(rows: readonly LotteryPersistenceRow[]): LotteryPersistenceSummary {
  const guaranteedCount = countGuaranteedPersistenceRows(rows);
  return {
    lotteryCount: rows.length - guaranteedCount,
    guaranteedCount,
    winnerCount: rows.length,
  };
}

/** 保存済み抽選結果行を、現在の応募者一覧に対応する UserBean として復元する。 */
export async function restoreLotteryWinners(rows: LotteryRestoreRow[], applicants: UserBean[]): Promise<UserBean[]> {
  const { xIdById } = createApplicantIdMaps(await getApplicantIdRows());
  const xIdToUser = new Map(applicants.map((user) => [user.x_id, user]));
  const restored: UserBean[] = [];
  for (const row of rows) {
    const xId = xIdById.get(row.applicant_id);
    if (!xId) continue;
    const user = xIdToUser.get(xId);
    if (!user) continue;
    restored.push({ ...user, is_guaranteed: row.is_guaranteed === 1 });
  }
  return restored;
}
