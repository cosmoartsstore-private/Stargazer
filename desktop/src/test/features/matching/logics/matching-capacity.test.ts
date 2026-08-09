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
      reservedSameDaySlotCount: 0,
      sameDaySlotUnit: 'table',
    })).toEqual({
      physicalSeatCount: 6,
      reservedSeatCount: 0,
      lotterySeatCount: 6,
      reservedTableCount: 0,
      executionTableCount: 3,
      winnerTableCount: 3,
      requiredTableCount: 3,
      unreservedEmptySeatCount: 0,
      hasUnreservedEmptySeats: false,
      hasUnreservedEmptyTables: false,
      hasIncompleteCastUnit: false,
      completeCastUnitCount: 3,
      staffedTableCount: 3,
      expectedCapacity: 6,
    });
  });

  it('1名単位の当日枠は指定人数分の席を物理席から差し引く', () => {
    expect(selectM003Capacity({
      totalTables: 3,
      usersPerTable: 2,
      totalWinners: 5,
      activeCastCount: 6,
      castsPerRotation: 2,
      reservedSameDaySlotCount: 1,
      sameDaySlotUnit: 'person',
    })).toMatchObject({
      physicalSeatCount: 6,
      reservedSeatCount: 1,
      lotterySeatCount: 5,
      reservedTableCount: 0,
      requiredTableCount: 3,
      unreservedEmptySeatCount: 0,
      expectedCapacity: 5,
    });
  });

  it('1テーブル単位の当日枠はテーブル内の全席を物理席から差し引く', () => {
    expect(selectM003Capacity({
      totalTables: 3,
      usersPerTable: 2,
      totalWinners: 4,
      activeCastCount: 6,
      castsPerRotation: 2,
      reservedSameDaySlotCount: 1,
      sameDaySlotUnit: 'table',
    })).toMatchObject({
      physicalSeatCount: 6,
      reservedSeatCount: 2,
      lotterySeatCount: 4,
      reservedTableCount: 1,
      winnerTableCount: 2,
      requiredTableCount: 3,
      unreservedEmptySeatCount: 0,
      expectedCapacity: 4,
    });
  });

  it('テーブル単位の当日枠は稼働可能なキャスト組からも先に確保する', () => {
    expect(selectM003Capacity({
      totalTables: 5,
      usersPerTable: 2,
      totalWinners: 6,
      activeCastCount: 4,
      castsPerRotation: 2,
      reservedSameDaySlotCount: 1,
      sameDaySlotUnit: 'table',
    })).toMatchObject({
      completeCastUnitCount: 2,
      staffedTableCount: 2,
      reservedSeatCount: 2,
      lotterySeatCount: 8,
      expectedCapacity: 2,
    });
  });

  it('1名単位の当日枠は稼働可能な席から指定人数分だけ確保する', () => {
    expect(selectM003Capacity({
      totalTables: 5,
      usersPerTable: 2,
      totalWinners: 3,
      activeCastCount: 4,
      castsPerRotation: 2,
      reservedSameDaySlotCount: 1,
      sameDaySlotUnit: 'person',
    })).toMatchObject({
      completeCastUnitCount: 2,
      staffedTableCount: 2,
      reservedSeatCount: 1,
      expectedCapacity: 3,
    });
  });

  it('当日枠を除いて残る空席と空きテーブルを区別して返す', () => {
    expect(selectM003Capacity({
      totalTables: 4,
      usersPerTable: 2,
      totalWinners: 3,
      activeCastCount: 8,
      castsPerRotation: 2,
      reservedSameDaySlotCount: 1,
      sameDaySlotUnit: 'table',
    })).toMatchObject({
      lotterySeatCount: 6,
      unreservedEmptySeatCount: 3,
      hasUnreservedEmptySeats: true,
      hasUnreservedEmptyTables: true,
      requiredTableCount: 3,
    });
  });

  it('端数キャストを不完全な組として検出し、完全な組だけで定員を計算する', () => {
    expect(selectM003Capacity({
      totalTables: 4,
      usersPerTable: 2,
      totalWinners: 4,
      activeCastCount: 7,
      castsPerRotation: 3,
      reservedSameDaySlotCount: 0,
      sameDaySlotUnit: 'table',
    })).toMatchObject({
      hasIncompleteCastUnit: true,
      completeCastUnitCount: 2,
      staffedTableCount: 2,
      expectedCapacity: 4,
    });
  });

  it('物理テーブルが0件でも実行用テーブル数だけは1に保つ', () => {
    expect(selectM003Capacity({
      totalTables: 0,
      usersPerTable: 2,
      totalWinners: 0,
      activeCastCount: 0,
      castsPerRotation: 2,
      reservedSameDaySlotCount: 0,
      sameDaySlotUnit: 'person',
    })).toMatchObject({
      physicalSeatCount: 0,
      lotterySeatCount: 0,
      executionTableCount: 1,
      staffedTableCount: 0,
      expectedCapacity: 0,
    });
  });
});
