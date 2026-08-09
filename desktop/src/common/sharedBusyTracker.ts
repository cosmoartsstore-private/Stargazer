export type BusyChangeNotifier = (busy: boolean) => void;

export interface SharedBusyTracker {
  begin: (token: symbol, notifier?: BusyChangeNotifier) => void;
  finish: (token: symbol) => void;
}

// 画面の再生成前に始まった処理を含め、共有処理がすべて終わるまでbusyを維持する。
export function createSharedBusyTracker(): SharedBusyTracker {
  const activeTokens = new Set<symbol>();
  const notifiers = new Set<BusyChangeNotifier>();

  return {
    begin(token, notifier) {
      activeTokens.add(token);
      if (notifier && !notifiers.has(notifier)) {
        notifiers.add(notifier);
        notifier(true);
      }
    },
    finish(token) {
      if (!activeTokens.delete(token) || activeTokens.size > 0) return;
      const completedNotifiers = [...notifiers];
      notifiers.clear();
      completedNotifiers.forEach((notifier) => notifier(false));
    },
  };
}
