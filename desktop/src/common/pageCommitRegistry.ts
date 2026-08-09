/** 画面遷移や終了前に、入力確定・進行中保存・明示保存下書きの破棄確認を調停する。 */

export type PendingPageCommit = () => Promise<boolean>;
export type PendingPageLeaveGuard = () => Promise<boolean>;

const pendingPageCommits = new Set<PendingPageCommit>();
const pendingPageLeaveGuards = new Set<PendingPageLeaveGuard>();
let activeFlush: Promise<boolean> | null = null;

/** 表示中画面の確定処理を登録し、画面破棄時に呼ぶ解除関数を返す。 */
export function registerPendingPageCommit(commit: PendingPageCommit): () => void {
  pendingPageCommits.add(commit);
  return () => {
    pendingPageCommits.delete(commit);
  };
}

/** 明示保存が必要な下書きについて、画面を離れてよいか確認する処理を登録する。 */
export function registerPendingPageLeaveGuard(guard: PendingPageLeaveGuard): () => void {
  pendingPageLeaveGuards.add(guard);
  return () => {
    pendingPageLeaveGuards.delete(guard);
  };
}

/** 自動確定を完了してから破棄確認を行い、いずれかが失敗または取消なら遷移を許可しない。 */
export function flushPendingPageCommits(): Promise<boolean> {
  if (activeFlush) return activeFlush;

  activeFlush = (async () => {
    const commits = [...pendingPageCommits];
    const leaveGuards = [...pendingPageLeaveGuards];
    for (const commit of commits) {
      try {
        if (!await commit()) return false;
      } catch {
        return false;
      }
    }
    for (const guard of leaveGuards) {
      try {
        if (!await guard()) return false;
      } catch {
        return false;
      }
    }
    return true;
  })().finally(() => {
    activeFlush = null;
  });

  return activeFlush;
}
