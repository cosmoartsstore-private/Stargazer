interface M003CapacityInput {
  totalTables: number;
  usersPerTable: number;
  totalWinners: number;
  activeCastCount: number;
  castsPerRotation: number;
  includedSameDaySlotCount: number;
}

/** M003 の席数、必要テーブル数、完全なキャスト組が対応できる収容人数を算出する。 */
export function selectM003Capacity({
  totalTables,
  usersPerTable,
  totalWinners,
  activeCastCount,
  castsPerRotation,
  includedSameDaySlotCount,
}: M003CapacityInput) {
  const completeCastUnitCount = Math.floor(activeCastCount / castsPerRotation);
  const baseSeatCount = totalTables * usersPerTable;
  const totalSeatCount = baseSeatCount + includedSameDaySlotCount;
  const effectiveTableCount = Math.ceil(totalSeatCount / usersPerTable);
  const executionTableCount = Math.max(1, effectiveTableCount);
  const userTableCount = Math.ceil(totalWinners / usersPerTable);
  const hasEmptySeats = totalWinners % usersPerTable !== 0;
  const hasEmptyTables = effectiveTableCount > userTableCount;
  const hasIncompleteCastUnit = activeCastCount % castsPerRotation !== 0;

  // 端数キャストはグループを構成できないため、接客枠は完全なキャスト組数だけで計算する。
  const expectedTableCount = Math.min(completeCastUnitCount, effectiveTableCount);
  const expectedCapacity = expectedTableCount * usersPerTable;

  return {
    baseSeatCount,
    totalSeatCount,
    effectiveTableCount,
    executionTableCount,
    userTableCount,
    hasEmptySeats,
    hasEmptyTables,
    hasIncompleteCastUnit,
    expectedTableCount,
    expectedCapacity,
  };
}
