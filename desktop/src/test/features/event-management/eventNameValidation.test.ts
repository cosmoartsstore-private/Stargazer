import { describe, expect, it } from 'vitest';
import {
  EVENT_NAME_MAX_LENGTH,
  getEventNameFormatError,
} from '@/features/event-management/eventNameValidation';

describe('getEventNameFormatError', () => {
  it('半角英数字・ハイフン・アンダースコアを64文字まで受け付ける', () => {
    expect(getEventNameFormatError('Event_2026-08')).toBeNull();
    expect(getEventNameFormatError('A'.repeat(EVENT_NAME_MAX_LENGTH))).toBeNull();
  });

  it('空白、ドット、パス区切り、全角文字を拒否する', () => {
    for (const name of ['Manual Test Event', 'Event.Name', '../Event', 'イベント']) {
      expect(getEventNameFormatError(name)).toBe('invalidCharacters');
    }
  });

  it('64文字を超える名前を拒否する', () => {
    expect(getEventNameFormatError('A'.repeat(EVENT_NAME_MAX_LENGTH + 1))).toBe('tooLong');
  });

  it('Windowsの予約名だけを大文字小文字を区別せず拒否する', () => {
    for (const name of ['CON', 'prn', 'Aux', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9']) {
      expect(getEventNameFormatError(name)).toBe('windowsReserved');
    }
    for (const name of ['CONCERT', 'COM0', 'COM10', 'LPT0', 'LPT10']) {
      expect(getEventNameFormatError(name)).toBeNull();
    }
  });
});
