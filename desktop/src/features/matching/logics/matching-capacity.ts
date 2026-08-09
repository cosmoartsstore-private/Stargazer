import type { SameDaySlotUnit } from '@/common/types/sessionWorkflow';

interface M003CapacityInput {
  totalTables: number;
  usersPerTable: number;
  totalWinners: number;
  activeCastCount: number;
  castsPerRotation: number;
  reservedSameDaySlotCount: number;
  sameDaySlotUnit: SameDaySlotUnit;
}

/** M003 の物理席から当日枠を確保し、抽選対象者へ使える接客枠を算出する。 */
export function selectM003Capacity({
  totalTables,
  usersPerTable,
  totalWinners,
  activeCastCount,
  castsPerRotation,
  reservedSameDaySlotCount,
  sameDaySlotUnit,
}: M003CapacityInput) {
  const completeCastUnitCount = Math.floor(activeCastCount / castsPerRotation);
  const physicalSeatCount = totalTables * usersPerTable;
  const reservedTableCount = sameDaySlotUnit === 'table' ? reservedSameDaySlotCount : 0;
  const reservedSeatCount = sameDaySlotUnit === 'table'
    ? reservedSameDaySlotCount * usersPerTable
    : reservedSameDaySlotCount;
  const lotterySeatCount = Math.max(0, physicalSeatCount - reservedSeatCount);
  const executionTableCount = Math.max(1, totalTables);
  const winnerTableCount = Math.ceil(totalWinners / usersPerTable);
  const requiredTableCount = sameDaySlotUnit === 'table'
    ? winnerTableCount + reservedTableCount
    : Math.ceil((totalWinners + reservedSeatCount) / usersPerTable);
  const unreservedEmptySeatCount = Math.max(0, lotterySeatCount - totalWinners);
  const hasUnreservedEmptySeats = unreservedEmptySeatCount > 0;
  const hasUnreservedEmptyTables = totalTables > requiredTableCount;
  const hasIncompleteCastUnit = activeCastCount % castsPerRotation !== 0;

  // 端数キャストはグループを構成できない。当日枠も稼働テーブル内で先に確保する。
  const staffedTableCount = Math.min(completeCastUnitCount, totalTables);
  const staffedSeatCount = sameDaySlotUnit === 'table'
    ? Math.max(0, staffedTableCount - reservedTableCount) * usersPerTable
    : Math.max(0, staffedTableCount * usersPerTable - reservedSeatCount);
  const expectedCapacity = Math.min(staffedSeatCount, lotterySeatCount);

  return {
    completeCastUnitCount,
    physicalSeatCount,
    reservedSeatCount,
    lotterySeatCount,
    reservedTableCount,
    executionTableCount,
    winnerTableCount,
    requiredTableCount,
    unreservedEmptySeatCount,
    hasUnreservedEmptySeats,
    hasUnreservedEmptyTables,
    hasIncompleteCastUnit,
    staffedTableCount,
    expectedCapacity,
  };
}
