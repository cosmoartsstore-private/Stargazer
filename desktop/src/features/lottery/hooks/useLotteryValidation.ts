import { useMemo } from 'react';
import { isTableBasedMatching } from '@/features/matching/types/matching-type-codes';

interface UseLotteryValidationProps {
    matchingTypeCode: string;
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

export function useLotteryValidation({
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
}: UseLotteryValidationProps) {
    return useMemo(() => {
        const errors: string[] = [];
        const warnings: string[] = [];
        const info: string[] = [];
        const normalizedSameDaySlotCount = allowM003EmptySeats && Number.isFinite(sameDaySlotCount)
            ? Math.max(0, Math.floor(sameDaySlotCount))
            : 0;
        const displayedLotteryCount = lotteryCount ?? Math.max(0, totalWinners - guaranteedCount);

        if (matchingTypeCode === 'M003') {
            const unitCount = activeCastCount / castsPerRotation;
            const baseSeatCount = totalTables * usersPerTable;
            const totalSeatCount = baseSeatCount + normalizedSameDaySlotCount;
            const effectiveTableCount = Math.ceil(totalSeatCount / usersPerTable);
            const userTableCount = Math.ceil(totalWinners / usersPerTable);

            info.push(`合計席数: 通常 ${baseSeatCount} 席 + 当日枠 ${normalizedSameDaySlotCount} 席 = 合計 ${totalSeatCount} 席です。`);

            if (effectiveTableCount < userTableCount) {
                errors.push(`合計席数（${totalSeatCount} 席）が当選者配置に必要な席数（${totalWinners} 席）より少なくなっています。`);
            }

            const hasEmptySeats = totalWinners % usersPerTable !== 0;
            const hasEmptyTables = effectiveTableCount > userTableCount;

            if (!allowM003EmptySeats && hasEmptySeats) {
                errors.push(`当選者数（${totalWinners} 名）が「1テーブルのユーザー数（${usersPerTable}）」で割り切れないため端数の空席が発生します。「当日枠を含める」を有効にしてください。`);
            }
            if (hasEmptyTables && !allowM003EmptySeats) {
                errors.push(`指定された条件（総テーブル数${totalTables}）では誰も座らない空きテーブルが発生します。総テーブル数は当選者配置に必要な${userTableCount}に合わせてください。`);
            }

            if (activeCastCount % castsPerRotation !== 0) {
                errors.push(`出席キャスト数（${activeCastCount} 名）が「1ローテあたりのキャスト数（${castsPerRotation}）」で割り切れません。`);
            }

            if (allowM003EmptySeats && totalSeatCount > totalWinners) {
                warnings.push(`当選者数より合計席数が ${totalSeatCount - totalWinners} 席多くなっています。当日枠または空席として扱います。`);
            }

            const expectedCapacity = Math.min(unitCount, effectiveTableCount) * usersPerTable;
            if (totalWinners > expectedCapacity) {
                errors.push(`当選者数（${totalWinners}名）が1ローテの接客枠（${Math.min(unitCount, effectiveTableCount)}テーブル × ${usersPerTable}人 = ${expectedCapacity}名）を上回っています。出勤キャスト数またはテーブル設定を見直してください。`);
            } else if (totalWinners < expectedCapacity) {
                warnings.push(`当選者数（${totalWinners}名）が1ローテの接客枠（${expectedCapacity}名）を下回っています。空席や待機状態のキャストが発生する可能性があります。`);
            }
        } else {
            info.push(`合計席数: 総テーブル数 ${totalTables} = 合計 ${totalTables} 席です。`);

            if (isTableBasedMatching(matchingTypeCode as import('@/features/matching/types/matching-type-codes').MatchingTypeCode)) {
                if (totalTables < totalWinners) {
                    errors.push(`総テーブル数（${totalTables}）が当選者数（${totalWinners} 名）より少なくなっています。`);
                }
            }

            if (totalWinners > activeCastCount) {
                errors.push(`当選者数（${totalWinners}名）が出勤キャスト数（${activeCastCount}名）を上回っています。現在のマッチング方式では全員に同時割り当てできません。`);
            } else if (totalWinners < activeCastCount) {
                warnings.push(`出勤キャスト数（${activeCastCount}名）が当選者数（${totalWinners}名）を上回っています。待機状態となるキャストが発生する可能性があります。`);
            }
        }
        info.push(`合計当選者数: 抽選 ${displayedLotteryCount} 名 + 確定 ${guaranteedCount} 名 = 合計 ${totalWinners} 名です。`);

        return { errors, warnings, info };
    }, [
        matchingTypeCode, totalWinners, lotteryCount, guaranteedCount, totalTables,
        activeCastCount, castsPerRotation, usersPerTable, allowM003EmptySeats, sameDaySlotCount
    ]);
}
