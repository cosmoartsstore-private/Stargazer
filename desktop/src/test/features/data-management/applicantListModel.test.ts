import { describe, expect, it } from 'vitest';
import type { CastBean, CautionUser, UserBean } from '@/common/types/entities';
import {
  EMPTY_APPLICANT_ROW_DATA,
  buildApplicantListViewModel,
} from '@/features/data-management/applicantListModel';

function user(overrides: Partial<UserBean> = {}): UserBean {
  return {
    name: 'Alice',
    x_id: '@alice',
    casts: ['Cast A'],
    cast_ids: [1],
    raw_extra: [],
    ...overrides,
  };
}

const casts: CastBean[] = [
  {
    id: 1,
    name: 'Cast A',
    is_present: true,
    ng_entries: [{ accountId: '@alice' }, { accountId: '@carol' }],
  },
  {
    id: 2,
    name: 'Cast B',
    is_present: true,
    ng_entries: [{ accountId: 'alice' }],
  },
];

describe('EMPTY_APPLICANT_ROW_DATA', () => {
  it('行情報がない場合の警告なし状態を表す', () => {
    expect(EMPTY_APPLICANT_ROW_DATA).toEqual({
      isCaution: false,
      hasIdentityIssue: false,
      ngCastNames: [],
      unavailablePreferenceIndexes: [],
    });
  });
});

describe('buildApplicantListViewModel', () => {
  it('自動候補と固定登録を集約し、全行の表示情報と列構造を一度に構築する', () => {
    const alice = user();
    const bob = user({ name: 'Bob', x_id: '@bob', casts: [], cast_ids: [], preference_mode: 'ranked' });
    const carol = user({
      name: 'Carol',
      x_id: '@carol',
      casts: ['Cast A', 'Cast B', 'Cast C'],
      cast_ids: [1, 2, null],
      preference_mode: 'flat',
    });
    const cautionUsers: CautionUser[] = [{ username: 'Bob', accountId: '@bob' }];

    const viewModel = buildApplicantListViewModel(
      [alice, bob, carol],
      casts,
      'all',
      cautionUsers,
      2,
    );

    expect(viewModel.rowDataMap.get(alice)).toEqual({
      isCaution: true,
      hasIdentityIssue: false,
      ngCastNames: ['Cast A', 'Cast B'],
      unavailablePreferenceIndexes: [],
    });
    expect(viewModel.rowDataMap.get(bob)).toEqual({
      isCaution: true,
      hasIdentityIssue: false,
      ngCastNames: [],
      unavailablePreferenceIndexes: [],
    });
    expect(viewModel.rowDataMap.get(carol)).toEqual({
      isCaution: false,
      hasIdentityIssue: false,
      ngCastNames: ['Cast A'],
      unavailablePreferenceIndexes: [2],
    });
    expect(viewModel.cautionCount).toBe(2);
    expect(viewModel.castIssueCount).toBe(1);
    expect(viewModel.filteredUsers).toEqual([alice, bob, carol]);
    expect(viewModel.isFlatList).toBe(true);
    expect(viewModel.flatCastColumnIndexes).toEqual([0, 1, 2]);
  });

  it('要注意フィルターでも全応募者の行情報と希望列数を保持する', () => {
    const alice = user();
    const regular = user({
      name: 'Regular',
      x_id: '@regular',
      casts: ['A', 'B', 'C', 'D'],
      cast_ids: [null, null, null, null],
      preference_mode: 'flat',
    });

    const viewModel = buildApplicantListViewModel(
      [alice, regular],
      casts,
      'caution',
      [],
      2,
    );

    expect(viewModel.filteredUsers).toEqual([alice]);
    expect(viewModel.rowDataMap.size).toBe(2);
    expect(viewModel.rowDataMap.has(regular)).toBe(true);
    expect(viewModel.isFlatList).toBe(true);
    expect(viewModel.flatCastColumnIndexes).toEqual([0, 1, 2, 3]);
  });

  it('希望キャストに不備がある応募者だけを絞り込む', () => {
    const available = user({ casts: ['Cast A'], cast_ids: [1] });
    const unresolved = user({ name: 'Bob', x_id: 'bob', casts: ['Unknown'], cast_ids: [null] });

    const viewModel = buildApplicantListViewModel(
      [available, unresolved],
      casts,
      'castIssue',
      [],
      2,
    );

    expect(viewModel.filteredUsers).toEqual([unresolved]);
    expect(viewModel.castIssueCount).toBe(1);
    expect(viewModel.rowDataMap.get(unresolved)?.unavailablePreferenceIndexes).toEqual([0]);
  });

  it('空欄と大文字小文字だけが異なる重複X IDを各行の問題として記録する', () => {
    const first = user({ name: 'First', x_id: ' Duplicate ' });
    const second = user({ name: 'Second', x_id: 'duplicate' });
    const empty = user({ name: 'Empty', x_id: '   ' });

    const viewModel = buildApplicantListViewModel(
      [first, second, empty],
      [],
      'all',
      [],
      2,
    );

    expect(viewModel.rowDataMap.get(first)?.hasIdentityIssue).toBe(true);
    expect(viewModel.rowDataMap.get(second)?.hasIdentityIssue).toBe(true);
    expect(viewModel.rowDataMap.get(empty)?.hasIdentityIssue).toBe(true);
    expect(viewModel.cautionCount).toBe(0);
  });

  it('応募者が0件でも最低1列の希望列構造を返す', () => {
    const viewModel = buildApplicantListViewModel([], casts, 'caution', [], 2);

    expect(viewModel.rowDataMap.size).toBe(0);
    expect(viewModel.filteredUsers).toEqual([]);
    expect(viewModel.cautionCount).toBe(0);
    expect(viewModel.castIssueCount).toBe(0);
    expect(viewModel.isFlatList).toBe(false);
    expect(viewModel.flatCastColumnIndexes).toEqual([0]);
  });
});
