// イベント名はWindows上の保存先ディレクトリ名として同じ規則で扱う。
export const EVENT_NAME_MAX_LENGTH = 64;

const EVENT_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const WINDOWS_RESERVED_EVENT_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type EventNameFormatError = 'invalidCharacters' | 'tooLong' | 'windowsReserved';

/** Backendと同じ、イベント名のパス構成要素としての制約を検証する。 */
export function getEventNameFormatError(name: string): EventNameFormatError | null {
  if (!EVENT_NAME_PATTERN.test(name)) return 'invalidCharacters';
  if (name.length > EVENT_NAME_MAX_LENGTH) return 'tooLong';
  if (WINDOWS_RESERVED_EVENT_NAME_PATTERN.test(name)) return 'windowsReserved';
  return null;
}
