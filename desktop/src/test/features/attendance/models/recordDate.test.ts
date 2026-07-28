import { describe, expect, it } from 'vitest';
import {
  buildCalendarDays,
  formatRecordDateInput,
  formatRecordDateValue,
  hasRecordDateFormat,
  parseRecordDate,
} from '@/features/attendance/models/recordDate';

describe('record date parsing', () => {
  it('YYYY-MM-DD形式だけを判定する', () => {
    expect(hasRecordDateFormat('2026-07-28')).toBe(true);
    expect(hasRecordDateFormat('2026-7-28')).toBe(false);
    expect(hasRecordDateFormat(' 2026-07-28 ')).toBe(false);
    expect(hasRecordDateFormat('2026/07/28')).toBe(false);
  });

  it('実在する日付をローカルDateへ変換する', () => {
    const date = parseRecordDate('2024-02-29');

    expect(date).not.toBeNull();
    expect(date && formatRecordDateValue(date)).toBe('2024-02-29');
  });

  it('形式が正しくても実在しない日付は拒否する', () => {
    expect(hasRecordDateFormat('2023-02-29')).toBe(true);
    expect(parseRecordDate('2023-02-29')).toBeNull();
    expect(parseRecordDate('2026-13-01')).toBeNull();
    expect(parseRecordDate('2026-04-31')).toBeNull();
    expect(parseRecordDate('2026/07/28')).toBeNull();
  });
});

describe('buildCalendarDays', () => {
  it('表示月の前後を含む日曜始まりの42日を返す', () => {
    const days = buildCalendarDays(new Date(2026, 6, 28));

    expect(days).toHaveLength(42);
    expect(days[0]?.getDay()).toBe(0);
    expect(formatRecordDateValue(days[0]!)).toBe('2026-06-28');
    expect(formatRecordDateValue(days[41]!)).toBe('2026-08-08');
  });

  it('月初が日曜日でも表示月初から固定6週を構成する', () => {
    const days = buildCalendarDays(new Date(2026, 1, 10));

    expect(formatRecordDateValue(days[0]!)).toBe('2026-02-01');
    expect(formatRecordDateValue(days[41]!)).toBe('2026-03-14');
  });
});

describe('formatRecordDateInput', () => {
  it.each([
    ['', ''],
    ['2026', '2026'],
    ['20267', '2026-7'],
    ['202607', '2026-07'],
    ['2026072', '2026-07-2'],
    ['20260728', '2026-07-28'],
    ['2026年07月28日', '2026-07-28'],
    ['202607281234', '2026-07-28'],
  ])('%s を %s へ整形する', (input, expected) => {
    expect(formatRecordDateInput(input)).toBe(expected);
  });
});
