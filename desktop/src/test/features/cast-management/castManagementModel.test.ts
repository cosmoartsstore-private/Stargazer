import { describe, expect, it } from 'vitest';
import type { CastBean } from '@/common/types/entities';
import {
  CONTACT_SITE_LINKS,
  filterCasts,
  getAliasConflictMessage,
  getContactMarker,
  getEditableContactUrls,
  getFormalNameConflictMessage,
  getOpenableContactUrl,
} from '@/features/cast-management/castManagementModel';

function cast(overrides: Partial<CastBean> = {}): CastBean {
  return {
    id: 1,
    name: 'Alice',
    aliases: ['Ally', 'Shared'],
    is_present: true,
    ...overrides,
  };
}

const casts: CastBean[] = [
  cast(),
  cast({ id: 2, name: 'Bob', aliases: ['Bobby', 'Shared'] }),
];

describe('CONTACT_SITE_LINKS', () => {
  it('直接開く外部サービスの表示とURLを同じ順序で定義する', () => {
    expect(CONTACT_SITE_LINKS).toEqual([
      {
        key: 'externalChat',
        label: 'DM(Discord)',
        marker: 'Discord',
        url: 'https://discord.com/channels/@me',
      },
      {
        key: 'x',
        label: 'DM(X)',
        marker: 'X',
        url: 'https://x.com/i/chat',
      },
      {
        key: 'vrchat',
        label: 'VRChat',
        marker: 'VRC',
        url: 'https://vrchat.com/home',
      },
    ]);
  });
});

describe('getOpenableContactUrl', () => {
  it('前後空白を除いたHTTPS URLとX IDを開けるURLへ変換する', () => {
    expect(getOpenableContactUrl('  HTTPS://example.com/Profile  ')).toBe('HTTPS://example.com/Profile');
    expect(getOpenableContactUrl('@sample_user')).toBe('https://x.com/sample_user');
    expect(getOpenableContactUrl('@abcdefghijklmno')).toBe('https://x.com/abcdefghijklmno');
  });

  it('HTTPS以外のURLとX IDの許容範囲外は開けるURLにしない', () => {
    expect(getOpenableContactUrl('http://example.com')).toBeNull();
    expect(getOpenableContactUrl('sample_user')).toBeNull();
    expect(getOpenableContactUrl('@invalid-name')).toBeNull();
    expect(getOpenableContactUrl('@abcdefghijklmnop')).toBeNull();
    expect(getOpenableContactUrl('   ')).toBeNull();
  });
});

describe('getContactMarker', () => {
  it.each([
    ['https://discord.com/channels/@me/123', { label: 'Discord', kind: 'externalChat' }],
    ['https://x.com/i/chat/123', { label: 'X', kind: 'x' }],
    ['https://vrchat.com/home/user/profile', { label: 'VRC', kind: 'vrchat' }],
    ['https://vrchat.com/api/1/file', { label: 'VRC', kind: 'vrchat' }],
    ['https://twitter.com/sample_user', { label: 'X', kind: 'x' }],
    ['@sample_user', { label: 'X', kind: 'x' }],
    ['https://example.com', { label: 'HTTPS', kind: 'https' }],
    ['http://example.com', { label: 'TEXT', kind: 'text' }],
    ['連絡はイベント内でお願いします', { label: 'TEXT', kind: 'text' }],
    ['   ', { label: 'URL', kind: 'empty' }],
  ] as const)('%sを対応する連絡先種別へ分類する', (value, expected) => {
    expect(getContactMarker(value)).toEqual(expected);
  });
});

describe('getFormalNameConflictMessage', () => {
  it('正式名と別名の使用箇所に応じた競合文言を返す', () => {
    expect(getFormalNameConflictMessage('Alice', casts)).toBe(
      '「Alice」はすでにキャスト名として使われています。',
    );
    expect(getFormalNameConflictMessage('Bobby', casts)).toBe(
      '「Bobby」は「Bob」の別名義として登録されています。別のキャスト名を入力してください。',
    );
    expect(getFormalNameConflictMessage('Carol', casts)).toBeNull();
  });
});

describe('getAliasConflictMessage', () => {
  it('所有者と使用種別に応じて別名の競合理由を返す', () => {
    const owner = casts[0];

    expect(getAliasConflictMessage('Alice', casts, owner)).toBe(
      '正式名と同じ「Alice」を別名義として登録する必要はありません。',
    );
    expect(getAliasConflictMessage('Ally', casts, owner)).toBe(
      '「Ally」はこのキャストの別名義として登録済みです。',
    );
    expect(getAliasConflictMessage('Bob', casts, owner)).toBe(
      '「Bob」は「Bob」の正式名として使われているため、別名義には登録できません。',
    );
    expect(getAliasConflictMessage('Bobby', casts, owner)).toBe(
      '「Bobby」は「Bob」の別名義として登録されています。',
    );
  });

  it('編集中の別名だけを競合対象から除外し、他キャストでの使用は検出する', () => {
    const owner = casts[0];

    expect(getAliasConflictMessage('Ally', casts, owner, 0)).toBeNull();
    expect(getAliasConflictMessage('Shared', casts, owner, 1)).toBe(
      '「Shared」は「Bob」の別名義として登録されています。',
    );
    expect(getAliasConflictMessage('New alias', casts, owner)).toBeNull();
  });
});

describe('filterCasts', () => {
  it('正式名と別名を前後空白・大文字小文字を無視した部分一致で絞り込む', () => {
    expect(filterCasts(casts, '  ALI  ')).toEqual([casts[0]]);
    expect(filterCasts(casts, 'bBy')).toEqual([casts[1]]);
    expect(filterCasts(casts, 'unknown')).toEqual([]);
  });

  it('検索語が空なら元の配列をそのまま返す', () => {
    expect(filterCasts(casts, '   ')).toBe(casts);
  });
});

describe('getEditableContactUrls', () => {
  it('登録済み連絡先は同じ配列を返し、未登録時だけ空の入力欄を1件用意する', () => {
    const contacts = ['https://example.com', '@sample_user'];
    const withContacts = cast({ contact_urls: contacts });

    expect(getEditableContactUrls(withContacts)).toBe(contacts);
    expect(getEditableContactUrls(cast({ contact_urls: [] }))).toEqual(['']);
    expect(getEditableContactUrls(cast({ contact_urls: undefined }))).toEqual(['']);
  });
});
