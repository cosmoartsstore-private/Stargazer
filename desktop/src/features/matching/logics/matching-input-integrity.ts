import type { CastBean, UserBean } from '@/common/types/entities';
import type { SessionWorkflowState } from '@/common/types/sessionWorkflow';

export interface MatchingInputSnapshot {
  winners: UserBean[];
  casts: CastBean[];
  workflow: SessionWorkflowState;
  searchMode: string;
  isLotteryResultCurrent: boolean;
}

interface PersistedLotteryResult {
  x_id: string;
  is_guaranteed: number;
}

/** マッチングへ影響するキャスト情報だけを、実行前後で比較できる文字列へ変換する。 */
export function getMatchingCastFingerprint(casts: CastBean[]): string {
  return JSON.stringify(casts.map((cast) => [
    cast.id,
    cast.name,
    cast.is_present,
    (cast.ng_entries ?? []).map((entry) => [entry.username ?? '', entry.accountId ?? '']),
  ]));
}

/** Worker実行中に結果へ影響する入力が変わっていないか確認するための指紋を作る。 */
export function getMatchingInputFingerprint(input: MatchingInputSnapshot): string {
  return JSON.stringify({
    winners: input.winners.map((winner) => [
      winner.id ?? null,
      winner.name,
      winner.x_id,
      winner.casts,
      winner.cast_ids ?? null,
      winner.preference_mode ?? null,
      !!winner.is_guaranteed,
    ]),
    casts: getMatchingCastFingerprint(input.casts),
    workflow: input.workflow,
    searchMode: input.searchMode,
    isLotteryResultCurrent: input.isLotteryResultCurrent,
  });
}

/** 画面が保持する条件と、DBから読み直した条件が一致するか確認する。 */
export function isSameWorkflowState(actual: SessionWorkflowState, expected: SessionWorkflowState): boolean {
  return (Object.keys(expected) as Array<keyof SessionWorkflowState>)
    .every((key) => actual[key] === expected[key]);
}

/** 画面上の当選者順と、DBへ確定した抽選結果が一致するか確認する。 */
export function isSameLotteryResult(winners: UserBean[], persistedRows: PersistedLotteryResult[]): boolean {
  return winners.length === persistedRows.length
    && winners.every((winner, index) => {
      const row = persistedRows[index];
      return row.x_id === winner.x_id
        && row.is_guaranteed === (winner.is_guaranteed ? 1 : 0);
    });
}
