import { describe, expect, it } from 'vitest';
import { selectM003Capacity } from '@/features/matching/logics/matching-capacity';

describe('selectM003Capacity', () => {
  it('席、当選者、キャスト組が過不足なく一致する定員を算出する', () => {
    expect(selectM003Capacity({
      totalTables: 3,
      usersPerTable: 2,
      totalWinners: 6,
      activeCastCount: 6,
      castsPerRotation: 2,
      includedSameDaySlotCount: 0,
    })).toEqual({
      baseSeatCount: 6,
      totalSeatCount: 6,
      effectiveTableCount: 3,
      executionTableCount: 3,
      userTableCount: 3,
      hasEmptySeats: false,
      hasEmptyTables: false,
      hasIncompleteCastUnit: false,
      expectedTableCount: 3,
      expectedCapacity: 6,
    });
  });

  it('同日枠を席数へ加え、端数席を1テーブルへ切り上げる', () => {
    expect(selectM003Capacity({
      totalTables: 2,
      usersPerTable: 3,
      totalWinners: 7,
      activeCastCount: 12,
      castsPerRotation: 3,
      includedSameDaySlotCount: 4,
    })).toMatchObject({
      baseSeatCount: 6,
      totalSeatCount: 10,
      effectiveTableCount: 4,
      executionTableCount: 4,
      userTableCount: 3,
      hasEmptySeats: true,
      hasEmptyTables: true,
    });
  });

  it('完全なキャスト組が少ない場合はキャスト組数を収容上限にする', () => {
    expect(selectM003Capacity({
      totalTables: 5,
      usersPerTable: 2,
      totalWinners: 10,
      activeCastCount: 4,
      castsPerRotation: 2,
      includedSameDaySlotCount: 0,
    })).toMatchObject({
      effectiveTableCount: 5,
      expectedTableCount: 2,
      expectedCapacity: 4,
    });
  });

  it('完全なキャスト組が多い場合は実効テーブル数を収容上限にする', () => {
    expect(selectM003Capacity({
      totalTables: 2,
      usersPerTable: 2,
      totalWinners: 4,
      activeCastCount: 10,
      castsPerRotation: 2,
      includedSameDaySlotCount: 0,
    })).toMatchObject({
      effectiveTableCount: 2,
      expectedTableCount: 2,
      expectedCapacity: 4,
    });
  });

  it('端数キャストを不完全な組として検出し、完全な組だけで定員を計算する', () => {
    expect(selectM003Capacity({
      totalTables: 4,
      usersPerTable: 2,
      totalWinners: 7,
      activeCastCount: 7,
      castsPerRotation: 3,
      includedSameDaySlotCount: 0,
    })).toMatchObject({
      hasEmptySeats: true,
      hasEmptyTables: false,
      hasIncompleteCastUnit: true,
      expectedTableCount: 2,
      expectedCapacity: 4,
    });
  });

  it('席、当選者、キャストが0件でも実行用テーブル数だけは1に保つ', () => {
    expect(selectM003Capacity({
      totalTables: 0,
      usersPerTable: 2,
      totalWinners: 0,
      activeCastCount: 0,
      castsPerRotation: 2,
      includedSameDaySlotCount: 0,
    })).toEqual({
      baseSeatCount: 0,
      totalSeatCount: 0,
      effectiveTableCount: 0,
      executionTableCount: 1,
      userTableCount: 0,
      hasEmptySeats: false,
      hasEmptyTables: false,
      hasIncompleteCastUnit: false,
      expectedTableCount: 0,
      expectedCapacity: 0,
    });
  });

  it('設定テーブルが0件でも同日枠があれば必要テーブルを算出する', () => {
    expect(selectM003Capacity({
      totalTables: 0,
      usersPerTable: 2,
      totalWinners: 1,
      activeCastCount: 2,
      castsPerRotation: 2,
      includedSameDaySlotCount: 1,
    })).toEqual({
      baseSeatCount: 0,
      totalSeatCount: 1,
      effectiveTableCount: 1,
      executionTableCount: 1,
      userTableCount: 1,
      hasEmptySeats: true,
      hasEmptyTables: false,
      hasIncompleteCastUnit: false,
      expectedTableCount: 1,
      expectedCapacity: 2,
    });
  });
});
