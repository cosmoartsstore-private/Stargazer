import { useMemo } from 'react';
import {
    validateLotteryConditions,
    type LotteryValidationParams,
} from '@/features/lottery/services/lottery-validation';

/** 抽選条件検証を React の依存配列に接続するための hook。 */
export function useLotteryValidation({
    matchingTypeCode,
    totalWinners,
    lotteryCount,
    guaranteedCount,
    totalTables,
    activeCastCount,
    castsPerRotation,
    usersPerTable,
    allowM003EmptySeats,
    sameDaySlotCount,
}: LotteryValidationParams) {
    return useMemo(() => {
        return validateLotteryConditions({
            matchingTypeCode,
            totalWinners,
            lotteryCount,
            guaranteedCount,
            totalTables,
            activeCastCount,
            castsPerRotation,
            usersPerTable,
            allowM003EmptySeats,
            sameDaySlotCount,
        });
    }, [
        matchingTypeCode, totalWinners, lotteryCount, guaranteedCount, totalTables,
        activeCastCount, castsPerRotation, usersPerTable, allowM003EmptySeats, sameDaySlotCount
    ]);
}
