import type { CastBean, UserBean } from '@/common/types/entities';
import type { SessionWorkflowState } from '@/common/types/sessionWorkflow';
import { normalizeXAccountId } from '@/common/xIdUtils';

export interface MatchingInputSnapshot {
  winners: UserBean[];
  casts: CastBean[];
  workflow: SessionWorkflowState;
  isLotteryResultCurrent: boolean;
}

interface PersistedLotteryResult {
  x_id: string;
  is_guaranteed: number;
}

/** NG判定と同じ規則で、割り当てを禁止するX IDだけを順序非依存の集合へ正規化する。 */
function getMatchingNgAccountIds(cast: CastBean): string[] {
  const accountIds = new Set<string>();
  for (const entry of cast.ng_entries ?? []) {
    const accountId = normalizeXAccountId(entry.accountId ?? '');
    if (accountId !== null) accountIds.add(accountId);
  }
  return [...accountIds].sort();
}

/** マッチング実行と結果表示へ影響する出席キャスト情報を、実行前後で比較できる文字列へ変換する。 */
export function getMatchingCastFingerprint(casts: CastBean[]): string {
  return JSON.stringify(
    casts
      .filter((cast) => cast.is_present)
      .map((cast) => [cast.id, cast.name, getMatchingNgAccountIds(cast)]),
  );
}

/** 完了済み結果の有効性へ影響する条件だけを、名簿の表示順と名称から独立して比較する。 */
export function getMatchingCastConstraintFingerprint(casts: CastBean[]): string {
  return JSON.stringify(
    casts
      .filter((cast) => cast.is_present)
      .sort((left, right) => left.id - right.id)
      .map((cast) => [cast.id, getMatchingNgAccountIds(cast)]),
  );
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
      winner.preference_mode,
      !!winner.is_guaranteed,
    ]),
    casts: getMatchingCastFingerprint(input.casts),
    workflow: input.workflow,
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
