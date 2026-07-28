import { selectM003Capacity } from '@/features/matching/logics/matching-capacity';
import { isTableBasedMatching, type MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
import { getMsg } from '@/messages/getMsg';

export interface LotteryValidationParams {
  matchingTypeCode: MatchingTypeCode;
  totalWinners: number;
  lotteryCount?: number;
  guaranteedCount?: number;
  totalTables: number;
  activeCastCount: number;
  castsPerRotation: number;
  usersPerTable: number;
  allowM003EmptySeats: boolean | undefined;
  sameDaySlotCount?: number;
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
  totalTables,
  activeCastCount,
  castsPerRotation,
  usersPerTable,
  allowM003EmptySeats,
  sameDaySlotCount = 0,
}: LotteryValidationParams): LotteryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const normalizedSameDaySlotCount = allowM003EmptySeats && Number.isFinite(sameDaySlotCount)
    ? Math.max(0, Math.floor(sameDaySlotCount))
    : 0;
  const displayedLotteryCount = lotteryCount ?? Math.max(0, totalWinners - guaranteedCount);

  if (matchingTypeCode === 'M000') {
    info.push(getMsg('lotteryValidation.lotteryOnlyInfo'));
  } else if (matchingTypeCode === 'M003') {
    const {
      baseSeatCount,
      totalSeatCount,
      effectiveTableCount,
      userTableCount,
      hasEmptySeats,
      hasEmptyTables,
      hasIncompleteCastUnit,
      expectedTableCount,
      expectedCapacity,
    } = selectM003Capacity({
      totalTables,
      usersPerTable,
      totalWinners,
      activeCastCount,
      castsPerRotation,
      includedSameDaySlotCount: normalizedSameDaySlotCount,
    });

    info.push(getMsg('lotteryValidation.groupSeatSummary', {
      baseSeatCount,
      sameDaySlotCount: normalizedSameDaySlotCount,
      totalSeatCount,
    }));

    if (effectiveTableCount < userTableCount) {
      errors.push(getMsg('lotteryValidation.insufficientGroupSeats', {
        totalSeatCount,
        totalWinners,
      }));
    }

    if (!allowM003EmptySeats && hasEmptySeats) {
      errors.push(getMsg('lotteryValidation.emptySeatsDisallowed', {
        totalWinners,
        usersPerTable,
      }));
    }
    if (hasEmptyTables && !allowM003EmptySeats) {
      errors.push(getMsg('lotteryValidation.emptyTablesDisallowed', {
        totalTables,
        userTableCount,
      }));
    }

    if (hasIncompleteCastUnit) {
      errors.push(getMsg('lotteryValidation.castUnitMismatch', {
        activeCastCount,
        castsPerRotation,
      }));
    }

    if (allowM003EmptySeats && totalSeatCount > totalWinners) {
      warnings.push(getMsg('lotteryValidation.extraSeats', {
        extraSeatCount: totalSeatCount - totalWinners,
      }));
    }

    if (totalWinners > expectedCapacity) {
      errors.push(getMsg('lotteryValidation.groupCapacityExceeded', {
        totalWinners,
        expectedTableCount,
        usersPerTable,
        expectedCapacity,
      }));
    } else if (totalWinners < expectedCapacity) {
      warnings.push(getMsg('lotteryValidation.groupCapacityShortfall', {
        totalWinners,
        expectedCapacity,
      }));
    }
  } else {
    info.push(getMsg('lotteryValidation.tableSeatSummary', { totalTables }));

    if (isTableBasedMatching(matchingTypeCode) && totalTables < totalWinners) {
      errors.push(getMsg('lotteryValidation.insufficientTables', {
        totalTables,
        totalWinners,
      }));
    }

    if (totalWinners > activeCastCount) {
      errors.push(getMsg('lotteryValidation.moreWinnersThanCasts', {
        totalWinners,
        activeCastCount,
      }));
    } else if (totalWinners < activeCastCount) {
      warnings.push(getMsg('lotteryValidation.moreCastsThanWinners', {
        activeCastCount,
        totalWinners,
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
