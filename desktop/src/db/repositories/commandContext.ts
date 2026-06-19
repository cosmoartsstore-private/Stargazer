import { getCurrentEventName, getCurrentSessionTimestamp } from '../database';

/** 共有 DB への backend command に必要な、現在開いているイベント名を返す。 */
export function getRequiredEventName(): string {
  const eventName = getCurrentEventName();
  if (!eventName) throw new Error('イベントが開かれていません。');
  return eventName;
}

/** セッション DB への backend command に必要な、イベント名とセッション timestamp を返す。 */
export function getRequiredSessionContext(): { eventName: string; timestamp: string } {
  const eventName = getRequiredEventName();
  const timestamp = getCurrentSessionTimestamp();
  if (!timestamp) throw new Error('取込セッションが開かれていません。');
  return { eventName, timestamp };
}
