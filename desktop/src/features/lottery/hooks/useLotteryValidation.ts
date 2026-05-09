import { useMemo } from 'react';
import { isTableBasedMatching } from '@/features/matching/types/matching-type-codes';

interface UseLotteryValidationProps {
    matchingTypeCode: string;
    totalWinners: number;
    totalTables: number;
    activeCastCount: number;
    castsPerRotation: number;
    usersPerTable: number;
    allowM003EmptySeats: boolean | undefined;
}

export function useLotteryValidation({
    matchingTypeCode,
    totalWinners,
    totalTables,
    activeCastCount,
    castsPerRotation,
    usersPerTable,
    allowM003EmptySeats,
}: UseLotteryValidationProps) {
    return useMemo(() => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (matchingTypeCode === 'M003') {
            const unitCount = activeCastCount / castsPerRotation;
            const userTableCount = Math.ceil(totalWinners / usersPerTable);

            if (totalTables < unitCount) {
                errors.push(`総テーブル数（${totalTables}）がキャストのユニット数（${unitCount}）より少なくなっています。すべてのキャストが常に配置できるよう、総テーブル数は${unitCount} 以上に設定してください。`);
            }
            if (totalTables < userTableCount) {
                errors.push(`総テーブル数（${totalTables}）が当選者配置に必要なテーブル数（${userTableCount}）より少なくなっています。`);
            }

            const hasEmptySeats = totalWinners % usersPerTable !== 0;
            const hasEmptyTables = totalTables > userTableCount;

            if (!allowM003EmptySeats && (hasEmptySeats || hasEmptyTables)) {
                if (hasEmptySeats) {
                    errors.push(`当選者数（${totalWinners} 名）が「1テーブルのユーザー数（${usersPerTable}）」で割り切れないため端数の空席が発生します。「空席・手動指定による空きテーブルを許可する」にチェックを入れてください。`);
                }
                if (hasEmptyTables) {
                    errors.push(`指定された条件（総テーブル数${totalTables}）では誰も座らない完全な空きテーブルが発生します。「空席・手動指定による空きテーブルを許可する」にチェックを入れてください。`);
                }
            }

            if (activeCastCount % castsPerRotation !== 0) {
                errors.push(`出席キャスト数（${activeCastCount} 名）が「1ローテあたりのキャスト数（${castsPerRotation}）」で割り切れません。`);
            }

            if (hasEmptySeats && allowM003EmptySeats) {
                warnings.push(`最後のテーブルに${usersPerTable - (totalWinners % usersPerTable)} 名分の空席が発生します。`);
            }

            const expectedCapacity = castsPerRotation * usersPerTable;
            if (totalWinners > expectedCapacity) {
                warnings.push(`当選者数（${totalWinners}名）が1ローテの接客枠（${castsPerRotation}キャスト × ${usersPerTable}人 = ${expectedCapacity}名）を上回っています。キャストが配置されないテーブルが発生する可能性があります。`);
            } else if (totalWinners < expectedCapacity) {
                warnings.push(`当選者数（${totalWinners}名）が1ローテの接客枠（${expectedCapacity}名）を下回っています。空席や待機状態のキャストが発生する可能性があります。`);
            }
        } else {
            if (isTableBasedMatching(matchingTypeCode as import('@/features/matching/types/matching-type-codes').MatchingTypeCode)) {
                if (totalTables < totalWinners) {
                    errors.push(`総テーブル数（${totalTables}）が当選者数（${totalWinners} 名）より少なくなっています。`);
                }
            }

            if (totalWinners > activeCastCount) {
                warnings.push(`当選者数（${totalWinners}名）が出勤キャスト数（${activeCastCount}名）を上回っています。接客を受けられないユーザーが発生する可能性があります。`);
            } else if (totalWinners < activeCastCount) {
                warnings.push(`出勤キャスト数（${activeCastCount}名）が当選者数（${totalWinners}名）を上回っています。待機状態となるキャストが発生する可能性があります。`);
            }
        }

        return { errors, warnings };
    }, [
        matchingTypeCode, totalWinners, totalTables,
        activeCastCount, castsPerRotation, usersPerTable, allowM003EmptySeats
    ]);
}
