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

async function getApplicantIdRows(): Promise<ApplicantIdRow[]> {
  const db = getSessionDb();
  return db.select<ApplicantIdRow[]>('SELECT id, x_id FROM applicants');
}

export async function buildLotteryPersistenceRows(winners: UserBean[]): Promise<LotteryPersistenceRow[]> {
  const applicantRows = await getApplicantIdRows();
  const xIdToId = new Map(applicantRows.map((row) => [row.x_id, row.id]));
  return winners
    .map((winner) => {
      const id = xIdToId.get(winner.x_id);
      return id == null ? null : { applicant_id: id, is_guaranteed: !!winner.is_guaranteed };
    })
    .filter((row): row is LotteryPersistenceRow => row !== null);
}

export async function restoreLotteryWinners(rows: LotteryRestoreRow[], applicants: UserBean[]): Promise<UserBean[]> {
  const applicantRows = await getApplicantIdRows();
  const idToXId = new Map(applicantRows.map((row) => [row.id, row.x_id]));
  const xIdToUser = new Map(applicants.map((user) => [user.x_id, user]));
  const restored: UserBean[] = [];
  for (const row of rows) {
    const xId = idToXId.get(row.applicant_id);
    if (!xId) continue;
    const user = xIdToUser.get(xId);
    if (!user) continue;
    restored.push({ ...user, is_guaranteed: row.is_guaranteed === 1 });
  }
  return restored;
}
