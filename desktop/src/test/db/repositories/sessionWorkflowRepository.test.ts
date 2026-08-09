import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SESSION_WORKFLOW_STATE,
  flushSessionWorkflowWrites,
  getSessionWorkflowSnapshot,
  persistSessionWorkflowState,
} from '@/db/repositories/sessionWorkflowRepository';
import { replaceApplicantGuarantees } from '@/db/repositories/applicantRepository';
import { replaceLotteryResults } from '@/db/repositories/lotteryRepository';

const mockState = vi.hoisted(() => ({
  rows: [] as unknown[],
  invoke: vi.fn(async (_command: string, _payload?: unknown): Promise<unknown> => undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockState.invoke,
}));

vi.mock('@/db/database', () => ({
  getSessionDb: () => ({
    select: vi.fn(async () => mockState.rows),
  }),
}));

vi.mock('@/db/repositories/commandContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/repositories/commandContext')>();
  return {
    ...actual,
    getRequiredSessionContext: () => ({
      eventName: 'Sample Event',
      timestamp: '20260725120000',
      generation: 1,
    }),
  };
});

const SESSION_CONTEXT = {
  eventName: 'Sample Event',
  timestamp: '20260725120000',
  generation: 1,
};

const VALID_WORKFLOW_ROW = {
  matching_type_code: 'M002',
  lottery_count: 5,
  rotation_count: 2,
  total_tables: 5,
  users_per_table: 1,
  casts_per_rotation: 1,
  reserve_same_day_slots: 0,
  same_day_slot_count: 0,
  same_day_slot_unit: 'table',
  condition_revision: 3,
  is_lottery_result_current: 0,
};

beforeEach(async () => {
  await flushSessionWorkflowWrites(SESSION_CONTEXT);
  mockState.rows = [];
  mockState.invoke.mockClear();
});

describe('getSessionWorkflowSnapshot の保存値正規化', () => {
  it('現行schemaに必須のDB行がない場合は明示的に拒否する', async () => {
    await expect(getSessionWorkflowSnapshot()).rejects.toThrow(
      'セッション条件が保存されていません。',
    );
  });

  it('M003を含む有効な条件と抽選結果の鮮度を復元する', async () => {
    mockState.rows = [{
      matching_type_code: 'M003',
      lottery_count: 12,
      rotation_count: 3,
      total_tables: 8,
      users_per_table: 2,
      casts_per_rotation: 2,
      reserve_same_day_slots: 1,
      same_day_slot_count: 4,
      same_day_slot_unit: 'person',
      condition_revision: 7,
      is_lottery_result_current: 1,
    }];

    await expect(getSessionWorkflowSnapshot()).resolves.toEqual({
      state: {
        matchingTypeCode: 'M003',
        lotteryCount: 12,
        rotationCount: 3,
        totalTables: 8,
        usersPerTable: 2,
        castsPerRotation: 2,
        reserveSameDaySlots: true,
        sameDaySlotCount: 4,
        sameDaySlotUnit: 'person',
      },
      isLotteryResultCurrent: true,
      conditionRevision: 7,
    });
  });

  it('不正な保存値を既定値へ読み替えず明示的に拒否する', async () => {
    mockState.rows = [{
      matching_type_code: 'M999',
      lottery_count: 0,
      rotation_count: -1,
      total_tables: 0,
      users_per_table: 0,
      casts_per_rotation: 0,
      reserve_same_day_slots: 2,
      same_day_slot_count: -1,
      same_day_slot_unit: 'invalid',
      condition_revision: -1,
      is_lottery_result_current: 0,
    }];

    await expect(getSessionWorkflowSnapshot()).rejects.toThrow(
      'セッション条件「当日枠の確保」が不正です。',
    );
  });

  it.each([
    ['matching_type_code', 'M999', 'セッション条件「マッチング方式」が不正です。'],
    ['lottery_count', 0, 'セッション条件「抽選人数」が不正です。'],
    ['same_day_slot_count', -1, 'セッション条件「当日枠」が不正です。'],
    ['same_day_slot_unit', 'invalid', 'セッション条件「当日枠の計数単位」が不正です。'],
    ['condition_revision', -1, 'セッション条件「条件revision」が不正です。'],
    ['is_lottery_result_current', 2, '抽選結果の状態が不正です。'],
  ])('%s の不正値を明示的に拒否する', async (field, value, message) => {
    mockState.rows = [{ ...VALID_WORKFLOW_ROW, [field]: value }];

    await expect(getSessionWorkflowSnapshot()).rejects.toThrow(message);
  });
});

describe('session workflow repository', () => {
  it('現在セッションDBから条件を読み込む', async () => {
    mockState.rows = [VALID_WORKFLOW_ROW];

    await expect(getSessionWorkflowSnapshot()).resolves.toMatchObject({
      state: { matchingTypeCode: 'M002', lotteryCount: 5 },
      isLotteryResultCurrent: false,
      conditionRevision: 3,
    });
  });

  it('呼出時点のイベント・セッションと条件をbackend commandへ渡す', async () => {
    await persistSessionWorkflowState({
      matchingTypeCode: 'M000',
      lotteryCount: 20,
      rotationCount: 2,
      totalTables: 15,
      usersPerTable: 1,
      castsPerRotation: 1,
      reserveSameDaySlots: false,
      sameDaySlotCount: 0,
      sameDaySlotUnit: 'table',
    });

    expect(mockState.invoke).toHaveBeenCalledWith(
      'persist_session_workflow_state_atomic',
      {
        eventName: 'Sample Event',
        timestamp: '20260725120000',
        state: {
          matching_type_code: 'M000',
          lottery_count: 20,
          rotation_count: 2,
          total_tables: 15,
          users_per_table: 1,
          casts_per_rotation: 1,
          reserve_same_day_slots: false,
          same_day_slot_count: 0,
          same_day_slot_unit: 'table',
        },
      },
    );
  });

  it('保存失敗後も後続の保存を実行できる', async () => {
    mockState.invoke
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);

    await expect(
      persistSessionWorkflowState({ ...DEFAULT_SESSION_WORKFLOW_STATE }),
    ).rejects.toThrow('write failed');
    await expect(
      persistSessionWorkflowState({
        ...DEFAULT_SESSION_WORKFLOW_STATE,
        lotteryCount: 2,
      }),
    ).resolves.toBeUndefined();
    expect(mockState.invoke).toHaveBeenCalledTimes(2);
  });

  it('同じセッションDBを開き直しても書込みを呼出順に直列化する', async () => {
    let completeFirstWrite: (() => void) | undefined;
    mockState.invoke
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        completeFirstWrite = resolve;
      }))
      .mockResolvedValueOnce(undefined);
    const firstContext = {
      eventName: 'Sample Event',
      timestamp: '20260725120000',
      generation: 1,
    };
    const reopenedContext = { ...firstContext, generation: 2 };

    const first = persistSessionWorkflowState(
      { ...DEFAULT_SESSION_WORKFLOW_STATE, lotteryCount: 2 },
      firstContext,
    );
    await Promise.resolve();
    const second = persistSessionWorkflowState(
      { ...DEFAULT_SESSION_WORKFLOW_STATE, lotteryCount: 3 },
      reopenedContext,
    );
    await Promise.resolve();

    expect(mockState.invoke).toHaveBeenCalledTimes(1);
    completeFirstWrite?.();
    await first;
    await second;
    expect(mockState.invoke).toHaveBeenCalledTimes(2);
  });

  it('異なるrepositoryから同じセッションDBへ書く場合も呼出順に直列化する', async () => {
    let completeGuaranteeWrite: (() => void) | undefined;
    mockState.invoke
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        completeGuaranteeWrite = resolve;
      }))
      .mockResolvedValue(undefined);

    const guaranteeWrite = replaceApplicantGuarantees(['@guaranteed'], SESSION_CONTEXT);
    await vi.waitFor(() => expect(mockState.invoke).toHaveBeenCalledTimes(1));
    const workflowWrite = persistSessionWorkflowState(
      { ...DEFAULT_SESSION_WORKFLOW_STATE, lotteryCount: 2 },
      SESSION_CONTEXT,
    );
    const lotteryWrite = replaceLotteryResults(
      [{ x_id: '@guaranteed', is_guaranteed: true }],
      1,
      SESSION_CONTEXT,
    );
    await Promise.resolve();

    expect(mockState.invoke).toHaveBeenCalledTimes(1);
    completeGuaranteeWrite?.();
    await Promise.all([guaranteeWrite, workflowWrite, lotteryWrite]);
    expect(mockState.invoke.mock.calls.map(([command]) => command)).toEqual([
      'replace_applicant_guarantees_atomic',
      'persist_session_workflow_state_atomic',
      'replace_lottery_results_atomic',
    ]);
  });
});
