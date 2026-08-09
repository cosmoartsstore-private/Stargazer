import {
  getCurrentConnectionGeneration,
  getCurrentEventConnectionGeneration,
  getCurrentEventName,
  getCurrentSessionTimestamp,
} from '../database';
import { getMsg } from '@/messages/getMsg';

export interface SessionCommandContext {
  eventName: string;
  timestamp: string;
  generation: number;
}

export interface EventCommandContext {
  eventName: string;
  generation: number;
}

interface CommandQueueEntry {
  settled: Promise<void>;
  successful: Promise<void>;
}

/** 同じ業務データへの非同期commandを呼出順に実行し、完了後のqueueを保持しない。 */
export class CommandWriteQueue {
  private readonly entries = new Map<string, CommandQueueEntry>();
  private readonly activityVersions = new Map<string, number>();

  private advanceActivityVersion(key: string): void {
    this.activityVersions.set(key, (this.activityVersions.get(key) ?? 0) + 1);
  }

  enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    this.advanceActivityVersion(key);
    const previous = this.entries.get(key);
    const result = (previous?.settled ?? Promise.resolve()).then(operation);
    const settled = result.then(
      () => this.advanceActivityVersion(key),
      () => this.advanceActivityVersion(key),
    );
    // 後続処理自体は失敗後も実行するが、待機側には同じ連続操作内の失敗を伝える。
    const successful = Promise.allSettled([
      previous?.successful ?? Promise.resolve(),
      result,
    ]).then((outcomes) => {
      const failure = outcomes.find(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
      );
      if (failure) throw failure.reason;
    });
    void successful.catch(() => undefined);
    const entry: CommandQueueEntry = { settled, successful };
    this.entries.set(key, entry);
    void settled.then(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return result;
  }

  getActivityVersion(key: string): number {
    return this.activityVersions.get(key) ?? 0;
  }

  isIdle(key: string): boolean {
    return !this.entries.has(key);
  }

  async wait(key: string): Promise<void> {
    await this.entries.get(key)?.successful;
  }

  /** 待機中に追加された同じキーの処理まで完了させ、連続操作内の失敗も呼出元へ返す。 */
  async waitUntilSuccessfulIdle(key: string): Promise<void> {
    while (true) {
      const entry = this.entries.get(key);
      if (!entry) return;
      await entry.successful;
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
        return;
      }
    }
  }

  /** 失敗の有無にかかわらず、待機中に追加された同じキーの処理まで終了を待つ。 */
  async waitUntilIdle(key: string): Promise<void> {
    while (true) {
      const entry = this.entries.get(key);
      if (!entry) return;
      await entry.settled;
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
        return;
      }
    }
  }

  /** 条件に一致する全キーが空になるまで待つ。待機中に追加された一致キーも対象にする。 */
  async waitUntilIdleMatching(matches: (key: string) => boolean): Promise<void> {
    while (true) {
      const keys = [...this.entries.keys()].filter(matches);
      if (keys.length === 0) return;
      await Promise.all(keys.map((key) => this.waitUntilIdle(key)));
    }
  }

  /** 条件に一致する全キーの処理を完了させ、いずれかの失敗も呼出元へ返す。 */
  async waitUntilSuccessfulIdleMatching(
    matches: (key: string) => boolean,
  ): Promise<void> {
    while (true) {
      const keys = [...this.entries.keys()].filter(matches);
      if (keys.length === 0) return;
      await Promise.all(keys.map((key) => this.waitUntilSuccessfulIdle(key)));
    }
  }
}

/** 同じ取込セッションDBへ書き込むrepository間で共有する。 */
const sessionCommandWriteQueue = new CommandWriteQueue();

/** 同じイベント共有DBへ書き込むrepository間で共有する。 */
const eventCommandWriteQueue = new CommandWriteQueue();

const eventLifecycleLocks = new Set<string>();
const eventRecoveryCounts = new Map<string, number>();
const sessionRecoveryCounts = new Map<string, number>();

export interface SessionWriteActivity {
  eventVersion: number;
  sessionVersion: number;
}

/** イベント共有DBの再読込前後で比較する書込み世代を固定する。 */
export function captureEventWriteActivity(context: EventCommandContext): number {
  return eventCommandWriteQueue.getActivityVersion(context.eventName);
}

/** 固定後に共有DBへの新しい書込みが始まらず、処理も残っていないかを判定する。 */
export function isEventWriteActivityUnchanged(
  context: EventCommandContext,
  activityVersion: number,
): boolean {
  return eventCommandWriteQueue.isIdle(context.eventName)
    && eventCommandWriteQueue.getActivityVersion(context.eventName) === activityVersion;
}

function getSessionCommandKey(context: SessionCommandContext): string {
  return `${context.eventName}\u0000${context.timestamp}`;
}

function getEventRecoveryKey(context: EventCommandContext): string {
  return `${context.eventName}\u0000${context.generation}`;
}

function getSessionRecoveryKey(context: SessionCommandContext): string {
  return `${getSessionCommandKey(context)}\u0000${context.generation}`;
}

/** イベント共有データの失敗後再同期が進行中かを返す。 */
export function isEventRecoveryActive(context: EventCommandContext): boolean {
  return (eventRecoveryCounts.get(getEventRecoveryKey(context)) ?? 0) > 0;
}

/** 失敗したイベント共有データをDBへ同期し直す処理の開始と終了を記録する。 */
export async function runAsEventRecovery<T>(
  context: EventCommandContext,
  operation: () => Promise<T>,
): Promise<T> {
  const key = getEventRecoveryKey(context);
  eventRecoveryCounts.set(key, (eventRecoveryCounts.get(key) ?? 0) + 1);
  try {
    return await operation();
  } finally {
    const remaining = (eventRecoveryCounts.get(key) ?? 1) - 1;
    if (remaining > 0) eventRecoveryCounts.set(key, remaining);
    else eventRecoveryCounts.delete(key);
  }
}

/** 同じセッションで失敗後のDB再同期が進行中かを返す。 */
export function isSessionRecoveryActive(context: SessionCommandContext): boolean {
  return (sessionRecoveryCounts.get(getSessionRecoveryKey(context)) ?? 0) > 0;
}

/**
 * 失敗した楽観更新をDBへ同期し直す間だけ、同じセッションの新規業務操作へ再試行を求める。
 * 通常の書込みは対象にせず、失敗回復中の古い画面値が次の保存入力になることだけを防ぐ。
 */
export async function runAsSessionRecovery<T>(
  context: SessionCommandContext,
  operation: () => Promise<T>,
): Promise<T> {
  const key = getSessionRecoveryKey(context);
  sessionRecoveryCounts.set(key, (sessionRecoveryCounts.get(key) ?? 0) + 1);
  try {
    return await operation();
  } finally {
    const remaining = (sessionRecoveryCounts.get(key) ?? 1) - 1;
    if (remaining > 0) sessionRecoveryCounts.set(key, remaining);
    else sessionRecoveryCounts.delete(key);
  }
}

function isSessionCommandKeyForEvent(key: string, eventName: string): boolean {
  return key.startsWith(`${eventName}\u0000`);
}

/** セッション再読込の前後で比較する、共有DBとセッションDBの書込み世代を固定する。 */
export function captureSessionWriteActivity(
  context: SessionCommandContext,
): SessionWriteActivity {
  return {
    eventVersion: eventCommandWriteQueue.getActivityVersion(context.eventName),
    sessionVersion: sessionCommandWriteQueue.getActivityVersion(getSessionCommandKey(context)),
  };
}

/** 固定後に新しい書込みが始まらず、対象DBの処理も残っていないかを判定する。 */
export function isSessionWriteActivityUnchanged(
  context: SessionCommandContext,
  activity: SessionWriteActivity,
): boolean {
  const sessionKey = getSessionCommandKey(context);
  return eventCommandWriteQueue.isIdle(context.eventName)
    && sessionCommandWriteQueue.isIdle(sessionKey)
    && eventCommandWriteQueue.getActivityVersion(context.eventName) === activity.eventVersion
    && sessionCommandWriteQueue.getActivityVersion(sessionKey) === activity.sessionVersion;
}

function getEventLifecycleError(eventName: string): Error {
  return new Error(getMsg('commandContext.eventSwitchInProgress', { eventName }));
}

/** イベントの切替中でなければ、共有DB書込みを呼出順に実行する。 */
export function enqueueEventWrite<T>(
  eventName: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (eventLifecycleLocks.has(eventName)) return Promise.reject(getEventLifecycleError(eventName));
  return eventCommandWriteQueue.enqueue(eventName, operation);
}

/** イベントの切替中でなければ、取込セッションDB書込みを呼出順に実行する。 */
export function enqueueSessionWrite<T>(
  context: SessionCommandContext,
  operation: () => Promise<T>,
): Promise<T> {
  if (eventLifecycleLocks.has(context.eventName)) {
    return Promise.reject(getEventLifecycleError(context.eventName));
  }
  return sessionCommandWriteQueue.enqueue(getSessionCommandKey(context), operation);
}

/**
 * イベント配下の全DB書込みを止めて既存処理を完了させ、改名・削除・接続切替を排他的に行う。
 * ロック開始後の新規書込みは旧パスへ遅延実行せず、呼出元へ再試行可能な失敗として返す。
 */
export async function runWithEventLifecycleLock<T>(
  eventNames: string[],
  operation: () => Promise<T>,
): Promise<T> {
  const names = [...new Set(eventNames.filter(Boolean))].sort();
  const lockedName = names.find((name) => eventLifecycleLocks.has(name));
  if (lockedName) throw getEventLifecycleError(lockedName);
  names.forEach((name) => eventLifecycleLocks.add(name));
  try {
    await Promise.all(names.flatMap((name) => [
      eventCommandWriteQueue.waitUntilSuccessfulIdle(name),
      sessionCommandWriteQueue.waitUntilSuccessfulIdleMatching(
        (key) => isSessionCommandKeyForEvent(key, name),
      ),
    ]));
    return await operation();
  } finally {
    names.forEach((name) => eventLifecycleLocks.delete(name));
  }
}

/** 失敗時の再読込前に、同じイベント共有DBへの書込みがすべて終わるまで待つ。 */
export async function waitForEventWritesToSettle(
  context: EventCommandContext,
): Promise<void> {
  await eventCommandWriteQueue.waitUntilIdle(context.eventName);
}

/** 画面を離れる前に、同じイベント共有DBの先行書込み完了と成功を確認する。 */
export async function waitForSuccessfulEventWrites(
  context: EventCommandContext,
): Promise<void> {
  await eventCommandWriteQueue.waitUntilSuccessfulIdle(context.eventName);
}

/** 失敗時の再読込前に、同じ取込セッションDBへの書込みがすべて終わるまで待つ。 */
export async function waitForSessionWritesToSettle(
  context: SessionCommandContext,
): Promise<void> {
  await sessionCommandWriteQueue.waitUntilIdle(getSessionCommandKey(context));
}

/** 依存処理の開始前に、同じセッションの先行書込み完了と成功を確認する。 */
export async function waitForSuccessfulSessionWrites(
  context: SessionCommandContext,
): Promise<void> {
  await sessionCommandWriteQueue.wait(getSessionCommandKey(context));
}

/** 共有 DB への backend command に必要な、現在開いているイベント名を返す。 */
export function getRequiredEventName(): string {
  const eventName = getCurrentEventName();
  if (!eventName) throw new Error(getMsg('common.eventNotOpen'));
  return eventName;
}

/** 非同期処理の開始時点に固定する、イベント接続の識別情報を返す。 */
export function getRequiredEventContext(): EventCommandContext {
  return {
    eventName: getRequiredEventName(),
    generation: getCurrentEventConnectionGeneration(),
  };
}

/** 画面が想定するイベントと、現在開いている共有DBが一致する場合だけ識別情報を返す。 */
export function getOpenEventContext(
  expectedEventName: string | null,
): EventCommandContext | null {
  if (expectedEventName === null) return null;
  try {
    const context = getRequiredEventContext();
    return context.eventName === expectedEventName ? context : null;
  } catch {
    return null;
  }
}

/** 固定したイベント接続が現在も同じ世代で開かれているかを判定する。 */
export function isCurrentEventContext(context: EventCommandContext): boolean {
  return getCurrentEventName() === context.eventName
    && getCurrentEventConnectionGeneration() === context.generation;
}

/** セッション DB への backend command に必要な、イベント名とセッション timestamp を返す。 */
export function getRequiredSessionContext(): SessionCommandContext {
  const eventName = getRequiredEventName();
  const timestamp = getCurrentSessionTimestamp();
  if (!timestamp) throw new Error(getMsg('commandContext.sessionNotOpen'));
  return {
    eventName,
    timestamp,
    generation: getCurrentConnectionGeneration(),
  };
}

/** 非同期処理の開始時に固定したセッションが、現在も開かれているかを判定する。 */
export function isCurrentSessionContext(context: SessionCommandContext): boolean {
  return getCurrentEventName() === context.eventName
    && getCurrentSessionTimestamp() === context.timestamp
    && getCurrentConnectionGeneration() === context.generation;
}
