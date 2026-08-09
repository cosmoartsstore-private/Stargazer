import { selectM003Capacity } from '@/features/matching/logics/matching-capacity';
import { isTableBasedMatching, type MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
import type { SameDaySlotUnit } from '@/common/types/sessionWorkflow';
import { getMsg } from '@/messages/getMsg';

export interface LotteryValidationParams {
  matchingTypeCode: MatchingTypeCode;
  totalWinners: number;
  lotteryCount?: number;
  guaranteedCount?: number;
  availableLotteryCandidateCount?: number;
  rotationCount: number;
  totalTables: number;
  activeCastCount: number;
  castsPerRotation: number;
  usersPerTable: number;
  reserveSameDaySlots: boolean | undefined;
  sameDaySlotCount?: number;
  sameDaySlotUnit?: SameDaySlotUnit;
}

export interface LotteryValidationResult {
  errors: string[];
  warnings: string[];
  info: string[];
}

/** 抽選とマッチング条件の組み合わせを検証し、画面に表示するメッセージへ変換する。 */
export function validateLotteryConditions({
  matchingTypeCode,
  totalWinners,
  lotteryCount,
  guaranteedCount = 0,
  availableLotteryCandidateCount,
  rotationCount,
  totalTables,
  activeCastCount,
  castsPerRotation,
  usersPerTable,
  reserveSameDaySlots,
  sameDaySlotCount = 0,
  sameDaySlotUnit = 'table',
}: LotteryValidationParams): LotteryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const normalizedSameDaySlotCount = reserveSameDaySlots && Number.isFinite(sameDaySlotCount)
    ? Math.max(0, Math.floor(sameDaySlotCount))
    : 0;
  const displayedLotteryCount = lotteryCount ?? Math.max(0, totalWinners - guaranteedCount);

  if (
    availableLotteryCandidateCount !== undefined
    && displayedLotteryCount > availableLotteryCandidateCount
  ) {
    errors.push(getMsg('lotteryValidation.insufficientCandidates', {
      lotteryCount: displayedLotteryCount,
      candidateCount: availableLotteryCandidateCount,
    }));
  }

  if (matchingTypeCode === 'M000') {
    info.push(getMsg('lotteryValidation.lotteryOnlyInfo'));
  } else if (matchingTypeCode === 'M003') {
    const {
      completeCastUnitCount,
      physicalSeatCount,
      reservedSeatCount,
      lotterySeatCount,
      unreservedEmptySeatCount,
      hasUnreservedEmptySeats,
      hasUnreservedEmptyTables,
      hasIncompleteCastUnit,
      staffedTableCount,
      expectedCapacity,
    } = selectM003Capacity({
      totalTables,
      usersPerTable,
      totalWinners,
      activeCastCount,
      castsPerRotation,
      reservedSameDaySlotCount: normalizedSameDaySlotCount,
      sameDaySlotUnit,
    });

    info.push(getMsg(sameDaySlotUnit === 'table'
      ? 'lotteryValidation.groupSeatSummaryByTable'
      : 'lotteryValidation.groupSeatSummaryByPerson', {
      totalTables,
      physicalSeatCount,
      sameDaySlotCount: normalizedSameDaySlotCount,
      reservedSeatCount,
      lotterySeatCount,
    }));

    if (reservedSeatCount > physicalSeatCount) {
      errors.push(getMsg('lotteryValidation.sameDaySlotsExceedCapacity', {
        reservedSeatCount,
        physicalSeatCount,
      }));
    }

    if (totalWinners > lotterySeatCount) {
      errors.push(getMsg('lotteryValidation.insufficientGroupSeats', {
        lotterySeatCount,
        totalWinners,
      }));
    }

    if (!reserveSameDaySlots && hasUnreservedEmptySeats) {
      errors.push(getMsg('lotteryValidation.emptySeatsDisallowed', {
        emptySeatCount: unreservedEmptySeatCount,
      }));
    }
    if (hasUnreservedEmptyTables && !reserveSameDaySlots) {
      errors.push(getMsg('lotteryValidation.emptyTablesDisallowed', {
        totalTables,
        winnerTableCount: Math.ceil(totalWinners / usersPerTable),
      }));
    }

    if (hasIncompleteCastUnit) {
      errors.push(getMsg('lotteryValidation.castUnitMismatch', {
        activeCastCount,
        castsPerRotation,
      }));
    }

    if (rotationCount > completeCastUnitCount) {
      errors.push(getMsg('lotteryValidation.rotationCountExceedsCastUnits', {
        rotationCount,
        completeCastUnitCount,
      }));
    }

    if (reserveSameDaySlots && unreservedEmptySeatCount > 0) {
      warnings.push(getMsg('lotteryValidation.extraSeats', {
        extraSeatCount: unreservedEmptySeatCount,
      }));
    }

    if (totalWinners > expectedCapacity) {
      errors.push(getMsg('lotteryValidation.groupCapacityExceeded', {
        totalWinners,
        staffedTableCount,
        reservedSeatCount,
        expectedCapacity,
      }));
    } else if (totalWinners < expectedCapacity) {
      warnings.push(getMsg('lotteryValidation.groupCapacityShortfall', {
        totalWinners,
        staffedTableCount,
        reservedSeatCount,
        expectedCapacity,
      }));
    }
  } else {
    const reservedTableCount = normalizedSameDaySlotCount;
    const lotteryTableCount = Math.max(0, totalTables - reservedTableCount);
    const requiredCastCount = totalWinners + reservedTableCount;
    info.push(getMsg('lotteryValidation.tableSeatSummary', {
      totalTables,
      reservedTableCount,
      lotteryTableCount,
    }));

    if (reservedTableCount > totalTables) {
      errors.push(getMsg('lotteryValidation.sameDayTablesExceedCapacity', {
        reservedTableCount,
        totalTables,
      }));
    }

    if (isTableBasedMatching(matchingTypeCode) && lotteryTableCount < totalWinners) {
      errors.push(getMsg('lotteryValidation.insufficientTables', {
        lotteryTableCount,
        totalWinners,
      }));
    }

    if (requiredCastCount > activeCastCount) {
      errors.push(getMsg('lotteryValidation.moreRequiredTablesThanCasts', {
        requiredCastCount,
        activeCastCount,
      }));
    } else if (requiredCastCount < activeCastCount) {
      warnings.push(getMsg('lotteryValidation.moreCastsThanWinners', {
        activeCastCount,
        requiredCastCount,
      }));
    }

    if (rotationCount > activeCastCount) {
      errors.push(getMsg('lotteryValidation.rotationCountExceedsCasts', {
        rotationCount,
        activeCastCount,
      }));
    }
  }
  info.push(getMsg('lotteryValidation.totalWinnerSummary', {
    lotteryCount: displayedLotteryCount,
    guaranteedCount,
    totalWinners,
  }));

  return { errors, warnings, info };
}
