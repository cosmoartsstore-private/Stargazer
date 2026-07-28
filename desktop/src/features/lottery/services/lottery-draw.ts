import { shuffleArray } from '@/common/arrayUtils';
import type { UserBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';

/** 確定当選者を候補から除外し、抽選枠と結合した当選者一覧を返す。 */
export function drawLotteryWinners(
  applicants: readonly UserBean[],
  guaranteedWinners: readonly UserBean[],
  lotteryCount: number,
): UserBean[] {
  const guaranteedIds = new Set(guaranteedWinners.map((winner) => winner.x_id));
  const candidates = applicants.filter((applicant) => !guaranteedIds.has(applicant.x_id));
  const drawnWinners = shuffleArray(candidates).slice(0, lotteryCount);
  return [
    ...guaranteedWinners.map((winner) => ({ ...winner, is_guaranteed: true })),
    ...drawnWinners.map((winner) => ({ ...winner, is_guaranteed: false })),
  ];
}

/** 保存済み抽選結果の一覧に表示する日時付きラベルを生成する。 */
export function formatSavedLotteryLabel(winnerCount: number): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const dateTime = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return getMsg('lotteryDraw.savedResultLabel', { dateTime, winnerCount });
}
