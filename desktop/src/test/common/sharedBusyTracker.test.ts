import { describe, expect, it, vi } from 'vitest';
import { createSharedBusyTracker } from '@/common/sharedBusyTracker';

describe('createSharedBusyTracker', () => {
  it('最初の処理開始から最後の処理終了までbusyを維持する', () => {
    const tracker = createSharedBusyTracker();
    const notify = vi.fn();
    const first = Symbol('first');
    const second = Symbol('second');

    tracker.begin(first, notify);
    tracker.begin(second, notify);
    tracker.finish(first);
    expect(notify.mock.calls).toEqual([[true]]);

    tracker.finish(second);
    expect(notify.mock.calls).toEqual([[true], [false]]);
  });

  it('画面ごとの通知先を一度ずつ開始し、完了時にまとめて解除する', () => {
    const tracker = createSharedBusyTracker();
    const firstNotify = vi.fn();
    const secondNotify = vi.fn();
    const first = Symbol('first');
    const second = Symbol('second');

    tracker.begin(first, firstNotify);
    tracker.begin(first, firstNotify);
    tracker.begin(second, secondNotify);
    expect(firstNotify.mock.calls).toEqual([[true]]);
    expect(secondNotify.mock.calls).toEqual([[true]]);

    tracker.finish(first);
    tracker.finish(Symbol('unknown'));
    expect(firstNotify).toHaveBeenCalledTimes(1);
    expect(secondNotify).toHaveBeenCalledTimes(1);

    tracker.finish(second);
    expect(firstNotify.mock.calls).toEqual([[true], [false]]);
    expect(secondNotify.mock.calls).toEqual([[true], [false]]);
  });

  it('通知先を持たない処理も他の処理と同じbusy期間に含める', () => {
    const tracker = createSharedBusyTracker();
    const notify = vi.fn();
    const silent = Symbol('silent');
    const visible = Symbol('visible');

    tracker.begin(silent);
    tracker.begin(visible, notify);
    tracker.finish(visible);
    expect(notify.mock.calls).toEqual([[true]]);

    tracker.finish(silent);
    expect(notify.mock.calls).toEqual([[true], [false]]);
  });
});
