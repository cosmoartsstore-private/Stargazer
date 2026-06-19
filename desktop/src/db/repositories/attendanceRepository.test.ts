import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCastAttendance,
  getCastAttendanceHistory,
  getCastAttendanceSummary,
  hasCastAttendanceForDate,
  recordCastAttendance,
} from './attendanceRepository';

interface FakeDb {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
}

const invokeMock = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({
  sharedDb: null as FakeDb | null,
  eventName: 'Sample Event' as string | null,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('../database', () => ({
  getSharedDb: () => {
    if (!mockState.sharedDb) throw new Error('shared db is not set');
    return mockState.sharedDb;
  },
  getCurrentEventName: () => mockState.eventName,
}));

function createDb(options?: { emptyDateCount?: boolean; zeroDateCount?: boolean }): FakeDb {
  return {
    execute: vi.fn(),
    select: vi.fn(async <T>(query: string): Promise<T> => {
      if (query.includes('SELECT c.name AS cast_name') && query.includes('DATE(MAX(recorded_at))')) {
        return [{ cast_name: 'Cast A' }] as T;
      }
      if (query.includes('COUNT(*) AS cast_count')) {
        return [
          { cast_count: 2, recorded_at: '2026-06-18T10:00:00.000Z', cast_names: 'Cast A,Cast B' },
        ] as T;
      }
      if (query.includes('COUNT(*) AS total_count')) {
        return [{ cast_name: 'Cast A', total_count: 3 }] as T;
      }
      if (query.includes('SELECT COUNT(*) AS n FROM cast_attendance')) {
        if (options?.emptyDateCount) return [] as T;
        return [{ n: options?.zeroDateCount ? 0 : 1 }] as T;
      }
      return [] as T;
    }),
  };
}

beforeEach(() => {
  mockState.sharedDb = createDb();
  mockState.eventName = 'Sample Event';
  invokeMock.mockReset();
});

describe('attendance read operations', () => {
  it('最新日付の出席キャストを返す', async () => {
    await expect(getCastAttendance()).resolves.toEqual([{ cast_name: 'Cast A' }]);
  });

  it('履歴行に現在イベント名を付与する', async () => {
    await expect(getCastAttendanceHistory()).resolves.toEqual([
      {
        event_id: 0,
        event_name: 'Sample Event',
        cast_count: 2,
        recorded_at: '2026-06-18T10:00:00.000Z',
        cast_names: 'Cast A,Cast B',
      },
    ]);
  });

  it('イベント名が未設定の履歴行は空文字を付与する', async () => {
    mockState.eventName = null;

    await expect(getCastAttendanceHistory()).resolves.toEqual([
      {
        event_id: 0,
        event_name: '',
        cast_count: 2,
        recorded_at: '2026-06-18T10:00:00.000Z',
        cast_names: 'Cast A,Cast B',
      },
    ]);
  });

  it('キャスト別累積出席回数に現在イベント名を付与する', async () => {
    await expect(getCastAttendanceSummary()).resolves.toEqual([
      { cast_name: 'Cast A', total_count: 3, last_event: 'Sample Event' },
    ]);
  });

  it('イベント名が未設定の累積出席回数は last_event を null にする', async () => {
    mockState.eventName = null;

    await expect(getCastAttendanceSummary()).resolves.toEqual([
      { cast_name: 'Cast A', total_count: 3, last_event: null },
    ]);
  });

  it('指定日付の出席記録有無を返す', async () => {
    await expect(hasCastAttendanceForDate('2026-06-18')).resolves.toBe(true);
  });

  it('指定日付の出席記録がない場合は false を返す', async () => {
    mockState.sharedDb = createDb({ zeroDateCount: true });

    await expect(hasCastAttendanceForDate('2026-06-18')).resolves.toBe(false);
  });

  it('件数行を取得できない場合は false を返す', async () => {
    mockState.sharedDb = createDb({ emptyDateCount: true });

    await expect(hasCastAttendanceForDate('2026-06-18')).resolves.toBe(false);
  });
});

describe('recordCastAttendance', () => {
  it('出席キャスト名と記録日時を backend command に渡す', async () => {
    await recordCastAttendance(['Cast A', 'Cast B'], '2026-06-18');

    expect(invokeMock).toHaveBeenCalledWith('record_cast_attendance_atomic', {
      eventName: 'Sample Event',
      presentCastNames: ['Cast A', 'Cast B'],
      recordedAt: '2026-06-18',
    });
  });

  it('イベント未オープン時は保存 command を呼ばない', async () => {
    mockState.eventName = null;

    await expect(recordCastAttendance(['Cast A'], '2026-06-18')).rejects.toThrow('イベントが開かれていません。');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
