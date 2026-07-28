import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureEventWriteActivity,
  captureSessionWriteActivity,
  CommandWriteQueue,
  enqueueEventWrite,
  enqueueSessionWrite,
  getOpenEventContext,
  getRequiredEventContext,
  getRequiredEventName,
  getRequiredSessionContext,
  isCurrentEventContext,
  isCurrentSessionContext,
  isEventRecoveryActive,
  isEventWriteActivityUnchanged,
  isSessionRecoveryActive,
  isSessionWriteActivityUnchanged,
  runAsEventRecovery,
  runAsSessionRecovery,
  runWithEventLifecycleLock,
  waitForEventWritesToSettle,
} from '@/db/repositories/commandContext';

const mockState = vi.hoisted(() => ({
  eventName: 'Sample Event' as string | null,
  timestamp: '20260618120000' as string | null,
  generation: 3,
  eventGeneration: 3,
}));

vi.mock('@/db/database', () => ({
  getCurrentEventName: () => mockState.eventName,
  getCurrentSessionTimestamp: () => mockState.timestamp,
  getCurrentConnectionGeneration: () => mockState.generation,
  getCurrentEventConnectionGeneration: () => mockState.eventGeneration,
}));

beforeEach(() => {
  mockState.eventName = 'Sample Event';
  mockState.timestamp = '20260618120000';
  mockState.generation = 3;
  mockState.eventGeneration = 3;
});

describe('CommandWriteQueue', () => {
  it('同じキーの処理を呼出順に実行し、失敗後も次の処理を続ける', async () => {
    const queue = new CommandWriteQueue();
    const calls: string[] = [];
    let finishFirst: (() => void) | undefined;
    const first = queue.enqueue('same', async () => {
      calls.push('first');
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      throw new Error('first failed');
    });
    const second = queue.enqueue('same', async () => {
      calls.push('second');
      return 2;
    });

    await vi.waitFor(() => expect(calls).toEqual(['first']));
    finishFirst?.();
    await expect(first).rejects.toThrow('first failed');
    await expect(second).resolves.toBe(2);
    expect(calls).toEqual(['first', 'second']);
  });

  it('待機側には同じ連続操作内の失敗を伝える', async () => {
    const queue = new CommandWriteQueue();
    let failFirst: (() => void) | undefined;
    let finishSecond: (() => void) | undefined;
    const first = queue.enqueue('same', async () => {
      await new Promise<void>((resolve) => {
        failFirst = resolve;
      });
      throw new Error('first failed');
    });
    const second = queue.enqueue('same', () => new Promise<number>((resolve) => {
      finishSecond = () => resolve(2);
    }));
    const successful = queue.wait('same');
    let waitSettled = false;
    void successful.then(
      () => { waitSettled = true; },
      () => { waitSettled = true; },
    );

    await vi.waitFor(() => expect(failFirst).toBeTypeOf('function'));
    failFirst?.();
    await expect(first).rejects.toThrow('first failed');
    await vi.waitFor(() => expect(finishSecond).toBeTypeOf('function'));
    await Promise.resolve();
    expect(waitSettled).toBe(false);
    finishSecond?.();
    await expect(second).resolves.toBe(2);
    await expect(successful).rejects.toThrow('first failed');
  });

  it('終了待ちは失敗を再送出せず、待機中に追加された処理まで待つ', async () => {
    const queue = new CommandWriteQueue();
    let finishFirst: (() => void) | undefined;
    let finishSecond: (() => void) | undefined;
    const first = queue.enqueue('same', async () => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      throw new Error('first failed');
    });
    const idle = queue.waitUntilIdle('same');
    const second = queue.enqueue('same', () => new Promise<void>((resolve) => {
      finishSecond = resolve;
    }));

    await vi.waitFor(() => expect(finishFirst).toBeTypeOf('function'));
    finishFirst?.();
    await expect(first).rejects.toThrow('first failed');
    await vi.waitFor(() => expect(finishSecond).toBeTypeOf('function'));
    let idleResolved = false;
    void idle.then(() => {
      idleResolved = true;
    });
    await Promise.resolve();
    expect(idleResolved).toBe(false);
    finishSecond?.();
    await second;
    await expect(idle).resolves.toBeUndefined();
  });

  it('処理の開始と終了を活動世代へ反映する', async () => {
    const queue = new CommandWriteQueue();
    let finish: (() => void) | undefined;
    const before = queue.getActivityVersion('same');
    const operation = queue.enqueue('same', () => new Promise<void>((resolve) => {
      finish = resolve;
    }));

    expect(queue.getActivityVersion('same')).toBe(before + 1);
    expect(queue.isIdle('same')).toBe(false);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    finish?.();
    await operation;
    await vi.waitFor(() => expect(queue.isIdle('same')).toBe(true));
    expect(queue.getActivityVersion('same')).toBe(before + 2);
  });
});

describe('event lifecycle lock', () => {
  it('共有DBと配下セッションの書込み完了後に処理し、切替中の新規書込みを拒否する', async () => {
    const eventName = 'Lifecycle Test Event';
    const sessionContext = { eventName, timestamp: '20260725010101', generation: 1 };
    let finishEventWrite: (() => void) | undefined;
    let finishSessionWrite: (() => void) | undefined;
    const eventWrite = enqueueEventWrite(eventName, () => new Promise<void>((resolve) => {
      finishEventWrite = resolve;
    }));
    const sessionWrite = enqueueSessionWrite(sessionContext, () => new Promise<void>((resolve) => {
      finishSessionWrite = resolve;
    }));

    await vi.waitFor(() => {
      expect(finishEventWrite).toBeTypeOf('function');
      expect(finishSessionWrite).toBeTypeOf('function');
    });

    const lifecycleOperation = vi.fn(async () => 'completed');
    const lifecycle = runWithEventLifecycleLock([eventName], lifecycleOperation);

    await expect(enqueueEventWrite(eventName, async () => undefined))
      .rejects.toThrow(`イベント「${eventName}」に切り替えています。完了するまでお待ちください。`);
    await expect(enqueueSessionWrite(sessionContext, async () => undefined))
      .rejects.toThrow(`イベント「${eventName}」に切り替えています。完了するまでお待ちください。`);
    expect(lifecycleOperation).not.toHaveBeenCalled();

    finishEventWrite?.();
    finishSessionWrite?.();
    await Promise.all([eventWrite, sessionWrite]);
    await expect(lifecycle).resolves.toBe('completed');
    expect(lifecycleOperation).toHaveBeenCalledOnce();
  });

  it('共有DBまたはセッションDBの書込み中は固定した活動世代を無効とする', async () => {
    const context = {
      eventName: 'Activity Test Event',
      timestamp: '20260725020202',
      generation: 1,
    };
    const activity = captureSessionWriteActivity(context);
    expect(isSessionWriteActivityUnchanged(context, activity)).toBe(true);

    let finish: (() => void) | undefined;
    const write = enqueueEventWrite(context.eventName, () => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    expect(isSessionWriteActivityUnchanged(context, activity)).toBe(false);

    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    finish?.();
    await write;
    await vi.waitFor(() => expect(isSessionWriteActivityUnchanged(
      context,
      captureSessionWriteActivity(context),
    )).toBe(true));
    expect(isSessionWriteActivityUnchanged(context, activity)).toBe(false);
  });

  it('イベント共有DBの活動世代を固定し、contextで書込み完了を待つ', async () => {
    const context = { eventName: 'Event Activity Test', generation: 1 };
    const activity = captureEventWriteActivity(context);
    expect(isEventWriteActivityUnchanged(context, activity)).toBe(true);

    let finish: (() => void) | undefined;
    const write = enqueueEventWrite(context.eventName, () => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    const waitByContext = waitForEventWritesToSettle(context);
    expect(isEventWriteActivityUnchanged(context, activity)).toBe(false);

    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    finish?.();
    await Promise.all([write, waitByContext]);
    expect(isEventWriteActivityUnchanged(
      context,
      captureEventWriteActivity(context),
    )).toBe(true);
    expect(isEventWriteActivityUnchanged(context, activity)).toBe(false);
  });
});

describe('failure recovery tracking', () => {
  it('イベント共有データの再同期中だけ、同じ接続世代を処理中と判定する', async () => {
    const context = { eventName: 'Recovery Test Event', generation: 1 };
    let finishRecovery: (() => void) | undefined;

    const recovery = runAsEventRecovery(context, () => new Promise<void>((resolve) => {
      finishRecovery = resolve;
    }));

    expect(isEventRecoveryActive(context)).toBe(true);
    expect(isEventRecoveryActive({ ...context, generation: 2 })).toBe(false);
    finishRecovery?.();
    await recovery;
    expect(isEventRecoveryActive(context)).toBe(false);
  });

  it('同じセッションの再同期が重なっても、すべて終わるまで処理中と判定する', async () => {
    const context = {
      eventName: 'Recovery Test Event',
      timestamp: '20260725030303',
      generation: 1,
    };
    let finishFirst: (() => void) | undefined;
    let finishSecond: (() => void) | undefined;
    const first = runAsSessionRecovery(context, () => new Promise<void>((resolve) => {
      finishFirst = resolve;
    }));
    const second = runAsSessionRecovery(context, () => new Promise<void>((resolve) => {
      finishSecond = resolve;
    }));

    expect(isSessionRecoveryActive(context)).toBe(true);
    expect(isSessionRecoveryActive({ ...context, generation: 2 })).toBe(false);
    finishFirst?.();
    await first;
    expect(isSessionRecoveryActive(context)).toBe(true);
    finishSecond?.();
    await second;
    expect(isSessionRecoveryActive(context)).toBe(false);
  });
});

describe('event command context', () => {
  it('現在のイベント名と接続世代を固定する', () => {
    expect(getRequiredEventName()).toBe('Sample Event');
    expect(getRequiredEventContext()).toEqual({
      eventName: 'Sample Event',
      generation: 3,
    });
  });

  it('イベントが開かれていなければ失敗する', () => {
    mockState.eventName = null;

    expect(() => getRequiredEventName()).toThrow('イベントが開かれていません。');
    expect(() => getRequiredEventContext()).toThrow('イベントが開かれていません。');
  });

  it('イベント名と接続世代の両方が一致する場合だけ現在の接続と判定する', () => {
    const context = getRequiredEventContext();

    expect(isCurrentEventContext(context)).toBe(true);

    mockState.eventGeneration += 1;
    expect(isCurrentEventContext(context)).toBe(false);

    mockState.eventGeneration = context.generation;
    mockState.eventName = 'Other Event';
    expect(isCurrentEventContext(context)).toBe(false);
  });

  it('画面が想定するイベントだけ、現在の接続情報を返す', () => {
    expect(getOpenEventContext('Sample Event')).toEqual({
      eventName: 'Sample Event',
      generation: 3,
    });
    expect(getOpenEventContext('Other Event')).toBeNull();
    expect(getOpenEventContext(null)).toBeNull();

    mockState.eventName = null;
    expect(getOpenEventContext('Sample Event')).toBeNull();
  });

  it('セッション接続の世代だけが変わってもイベント共有接続を現在と判定する', () => {
    const context = getRequiredEventContext();

    mockState.generation += 1;

    expect(isCurrentEventContext(context)).toBe(true);
  });
});

describe('session command context', () => {
  it('現在のイベント名、セッション、接続世代を固定する', () => {
    expect(getRequiredSessionContext()).toEqual({
      eventName: 'Sample Event',
      timestamp: '20260618120000',
      generation: 3,
    });
  });

  it('取込セッションが開かれていなければ失敗する', () => {
    mockState.timestamp = null;

    expect(() => getRequiredSessionContext()).toThrow('取込セッションが開かれていません。');
  });

  it('イベント、セッション、接続世代がすべて一致する場合だけ現在の接続と判定する', () => {
    const context = getRequiredSessionContext();

    expect(isCurrentSessionContext(context)).toBe(true);

    mockState.timestamp = '20260618130000';
    expect(isCurrentSessionContext(context)).toBe(false);

    mockState.timestamp = context.timestamp;
    mockState.generation += 1;
    expect(isCurrentSessionContext(context)).toBe(false);

    mockState.generation = context.generation;
    mockState.eventName = 'Other Event';
    expect(isCurrentSessionContext(context)).toBe(false);
  });
});
