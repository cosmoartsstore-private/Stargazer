import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MATCHING_WORKER_TIME_LIMIT_MS,
  scheduleMatchingWorkerDeadline,
} from '@/features/matching/hooks/useMatchingExecution';

afterEach(() => {
  vi.useRealTimers();
});

describe('scheduleMatchingWorkerDeadline', () => {
  it('有効なWorkerを30秒で強制終了し、時間切れを通知する', () => {
    vi.useFakeTimers();
    const worker = { terminate: vi.fn() };
    const reportTimeLimit = vi.fn();

    scheduleMatchingWorkerDeadline(
      () => true,
      () => worker.terminate(),
      reportTimeLimit,
    );

    vi.advanceTimersByTime(MATCHING_WORKER_TIME_LIMIT_MS - 1);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(reportTimeLimit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(reportTimeLimit).toHaveBeenCalledOnce();
  });

  it('既に無効になったWorkerは時間到達後も終了処理を重ねない', () => {
    vi.useFakeTimers();
    const terminateWorker = vi.fn();
    const reportTimeLimit = vi.fn();

    scheduleMatchingWorkerDeadline(() => false, terminateWorker, reportTimeLimit);
    vi.advanceTimersByTime(MATCHING_WORKER_TIME_LIMIT_MS);

    expect(terminateWorker).not.toHaveBeenCalled();
    expect(reportTimeLimit).not.toHaveBeenCalled();
  });
});
