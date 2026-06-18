/** 入力配列を変更せず、抽選用にランダム順の配列を返す。 */
export function shuffle<T>(items: readonly T[]): T[] {
  const copied = [...items];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copied[index], copied[swapIndex]] = [copied[swapIndex], copied[index]];
  }
  return copied;
}

/** 保存済み抽選結果の一覧に表示する日時付きラベルを生成する。 */
export function formatSavedLotteryLabel(winnerCount: number): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `抽選結果 ${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}（${winnerCount}名）`;
}
