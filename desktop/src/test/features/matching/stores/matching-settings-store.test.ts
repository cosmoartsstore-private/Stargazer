import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CAUTION_THRESHOLD,
  getEventCautionThreshold,
  getInitialMatchingSettings,
  persistEventCautionThreshold,
} from '@/features/matching/stores/matching-settings-store';

const repositoryMocks = vi.hoisted(() => ({
  getSetting: vi.fn(async () => null as string | null),
  setSetting: vi.fn(async () => undefined),
}));

vi.mock('@/db/repositories/settingsRepository', () => repositoryMocks);

beforeEach(() => {
  repositoryMocks.getSetting.mockReset();
  repositoryMocks.getSetting.mockResolvedValue(null);
  repositoryMocks.setSetting.mockReset();
  repositoryMocks.setSetting.mockResolvedValue(undefined);
});

describe('getInitialMatchingSettings', () => {
  it('DB読込前の空のイベント設定を返す', () => {
    expect(getInitialMatchingSettings()).toEqual({
      caution: {
        candidateThreshold: DEFAULT_CAUTION_THRESHOLD,
        cautionUsers: [],
      },
    });
  });
});

describe('event caution threshold', () => {
  it('未保存または不正値なら既定値を返す', async () => {
    await expect(getEventCautionThreshold()).resolves.toBe(DEFAULT_CAUTION_THRESHOLD);

    repositoryMocks.getSetting.mockResolvedValueOnce('0');
    await expect(getEventCautionThreshold()).resolves.toBe(DEFAULT_CAUTION_THRESHOLD);
  });

  it('イベント共有DBの保存値を返す', async () => {
    repositoryMocks.getSetting.mockResolvedValue('4');

    await expect(getEventCautionThreshold()).resolves.toBe(4);
    expect(repositoryMocks.getSetting).toHaveBeenCalledWith(
      'caution_auto_register_threshold',
    );
  });

  it('1以上の整数だけをイベント共有DBへ保存する', async () => {
    await persistEventCautionThreshold(3);
    expect(repositoryMocks.setSetting).toHaveBeenCalledWith(
      'caution_auto_register_threshold',
      '3',
    );

    await expect(persistEventCautionThreshold(0)).rejects.toThrow(
      '要注意候補の閾値は1以上の整数で指定してください。',
    );
  });
});
