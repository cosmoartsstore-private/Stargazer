import { describe, expect, it, vi } from 'vitest';
import {
  flushPendingPageCommits,
  registerPendingPageCommit,
  registerPendingPageLeaveGuard,
} from '@/common/pageCommitRegistry';

describe('pageCommitRegistry', () => {
  it('確定処理を登録順に完了してから破棄確認を行う', async () => {
    const calls: string[] = [];
    const unregisterFirst = registerPendingPageCommit(async () => {
      calls.push('commit-1');
      return true;
    });
    const unregisterSecond = registerPendingPageCommit(async () => {
      calls.push('commit-2');
      return true;
    });
    const unregisterGuard = registerPendingPageLeaveGuard(async () => {
      calls.push('guard');
      return true;
    });

    try {
      await expect(flushPendingPageCommits()).resolves.toBe(true);
      expect(calls).toEqual(['commit-1', 'commit-2', 'guard']);
    } finally {
      unregisterFirst();
      unregisterSecond();
      unregisterGuard();
    }
  });

  it('確定処理が拒否した場合は後続処理と破棄確認を行わない', async () => {
    const laterCommit = vi.fn(async () => true);
    const guard = vi.fn(async () => true);
    const unregisterRejecting = registerPendingPageCommit(async () => false);
    const unregisterLater = registerPendingPageCommit(laterCommit);
    const unregisterGuard = registerPendingPageLeaveGuard(guard);

    try {
      await expect(flushPendingPageCommits()).resolves.toBe(false);
      expect(laterCommit).not.toHaveBeenCalled();
      expect(guard).not.toHaveBeenCalled();
    } finally {
      unregisterRejecting();
      unregisterLater();
      unregisterGuard();
    }
  });

  it('確定処理または破棄確認の例外を遷移拒否として扱う', async () => {
    const unregisterCommit = registerPendingPageCommit(async () => true);
    const unregisterGuard = registerPendingPageLeaveGuard(async () => {
      throw new Error('確認に失敗');
    });

    try {
      await expect(flushPendingPageCommits()).resolves.toBe(false);
    } finally {
      unregisterCommit();
      unregisterGuard();
    }
  });

  it('同時に要求された確定処理を一度だけ実行する', async () => {
    let finish: ((value: boolean) => void) | undefined;
    const commit = vi.fn(() => new Promise<boolean>((resolve) => {
      finish = resolve;
    }));
    const unregister = registerPendingPageCommit(commit);

    try {
      const first = flushPendingPageCommits();
      const second = flushPendingPageCommits();
      expect(second).toBe(first);
      expect(commit).toHaveBeenCalledOnce();

      finish?.(true);
      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    } finally {
      unregister();
    }
  });

  it('解除した処理は次の確定対象に含めない', async () => {
    const commit = vi.fn(async () => true);
    const unregister = registerPendingPageCommit(commit);
    unregister();

    await expect(flushPendingPageCommits()).resolves.toBe(true);
    expect(commit).not.toHaveBeenCalled();
  });
});
