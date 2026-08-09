import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCastAttendanceHistory,
  getCastAttendanceRecordDates,
  hasCastAttendanceForDate,
  recordCastAttendance,
} from '@/db/repositories/attendanceRepository';

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

vi.mock('@/db/database', () => ({
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
      if (query.includes('COUNT(*) AS attendance_count')) {
        return [
          {
            recorded_at: '2026-06-18T10:00:00.000Z',
            cast_name: 'Cast, A',
            attendance_count: 2,
          },
        ] as T;
      }
      if (query.includes('FROM attendance_record_dates WHERE recorded_at = ?')) {
        if (options?.emptyDateCount) return [] as T;
        return [{ n: options?.zeroDateCount ? 0 : 1 }] as T;
      }
      if (query.includes('FROM attendance_record_dates')) {
        return [
          { recorded_at: '2026-06-19' },
          { recorded_at: '2026-06-18' },
        ] as T;
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
  it('日付・キャスト別の行を公開形式へ正規化して返す', async () => {
    await expect(getCastAttendanceHistory()).resolves.toEqual([
      {
        recordedAt: '2026-06-18T10:00:00.000Z',
        castName: 'Cast, A',
        attendanceCount: 2,
      },
    ]);

    expect(mockState.sharedDb?.select).toHaveBeenCalledTimes(1);
    expect(mockState.sharedDb?.select).toHaveBeenCalledWith(expect.stringContaining(
      'GROUP BY DATE(ca.recorded_at), c.id, c.name',
    ));
  });

  it('指定日付の出席記録有無を返す', async () => {
    await expect(hasCastAttendanceForDate('2026-06-18')).resolves.toBe(true);
  });

  it('出席者0人の日を含む記録日を保存順のまま返す', async () => {
    await expect(getCastAttendanceRecordDates()).resolves.toEqual([
      '2026-06-19',
      '2026-06-18',
    ]);
    expect(mockState.sharedDb?.select).toHaveBeenCalledWith(expect.stringContaining(
      'ORDER BY recorded_at DESC',
    ));
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
  it('出席キャストIDと記録日時を backend command に渡す', async () => {
    await recordCastAttendance([10, 20], '2026-06-18');

    expect(invokeMock).toHaveBeenCalledWith('record_cast_attendance_atomic', {
      eventName: 'Sample Event',
      presentCastIds: [10, 20],
      recordedAt: '2026-06-18',
    });
  });

  it('イベント未オープン時は保存 command を呼ばない', async () => {
    mockState.eventName = null;

    await expect(recordCastAttendance([10], '2026-06-18')).rejects.toThrow('イベントが開かれていません。');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
