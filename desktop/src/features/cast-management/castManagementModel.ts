import { findCastNameUsages } from '@/common/castReferences';
import type { CastBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';

export type ContactMarkerKind = 'externalChat' | 'vrchat' | 'x' | 'https' | 'text' | 'empty';
export type EventMutationResult = 'saved' | 'failed' | 'stale';

export interface ContactSiteLink {
  key: 'externalChat' | 'x' | 'vrchat';
  label: string;
  marker: string;
  url: string;
}

// 連絡先欄から直接開けるサービスと、入力値の表示分類を一つの定義に揃える。
export const CONTACT_SITE_LINKS: readonly ContactSiteLink[] = [
  {
    key: 'externalChat',
    label: getMsg('CastManagementPage.discordLabel'),
    marker: getMsg('CastManagementPage.discordMarker'),
    url: 'https://discord.com/channels/@me',
  },
  {
    key: 'x',
    label: getMsg('CastManagementPage.xLabel'),
    marker: getMsg('CastManagementPage.xMarker'),
    url: 'https://x.com/i/chat',
  },
  {
    key: 'vrchat',
    label: getMsg('CastManagementPage.vrchatLabel'),
    marker: getMsg('CastManagementPage.vrchatMarker'),
    url: 'https://vrchat.com/home',
  },
];

function isHttpsContactUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith('https://');
}

function getXProfileUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith('@')) return null;
  const username = trimmed.replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) return null;
  return `https://x.com/${username}`;
}

export function getOpenableContactUrl(url: string): string | null {
  const trimmed = url.trim();
  if (isHttpsContactUrl(trimmed)) return trimmed;
  return getXProfileUrl(trimmed);
}

export function getContactMarker(url: string): { label: string; kind: ContactMarkerKind } {
  const trimmed = url.trim();
  const lowerUrl = trimmed.toLowerCase();
  const matched = CONTACT_SITE_LINKS.find((item) => lowerUrl.startsWith(item.url.toLowerCase()));
  if (matched) return { label: matched.marker, kind: matched.key };
  if (!trimmed) return { label: getMsg('CastManagementPage.urlMarker'), kind: 'empty' };
  if (lowerUrl.startsWith('https://vrchat.com/')) {
    return { label: getMsg('CastManagementPage.vrchatMarker'), kind: 'vrchat' };
  }
  if (
    lowerUrl.startsWith('https://x.com/')
    || lowerUrl.startsWith('https://twitter.com/')
    || getXProfileUrl(trimmed)
  ) {
    return { label: getMsg('CastManagementPage.xMarker'), kind: 'x' };
  }
  if (isHttpsContactUrl(trimmed)) {
    return { label: getMsg('CastManagementPage.httpsMarker'), kind: 'https' };
  }
  return { label: getMsg('CastManagementPage.textMarker'), kind: 'text' };
}

export function getFormalNameConflictMessage(name: string, casts: CastBean[]): string | null {
  const usage = findCastNameUsages(name, casts)[0];
  if (!usage) return null;
  if (usage.source === 'name') {
    return getMsg('CastManagementPage.formalNameInUse', { name });
  }
  return getMsg('CastManagementPage.formalNameUsedAsAlias', { name, castName: usage.castName });
}

export function getAliasConflictMessage(
  alias: string,
  casts: CastBean[],
  owner: CastBean,
  editingAliasIndex?: number,
): string | null {
  const usage = findCastNameUsages(alias, casts).find((item) => !(
    item.castId === owner.id
    && item.source === 'alias'
    && item.aliasIndex === editingAliasIndex
  ));
  if (!usage) return null;
  if (usage.castId === owner.id && usage.source === 'name') {
    return getMsg('CastManagementPage.aliasMatchesFormalName', { alias });
  }
  if (usage.castId === owner.id) {
    return getMsg('CastManagementPage.aliasAlreadyRegistered', { alias });
  }
  if (usage.source === 'name') {
    return getMsg('CastManagementPage.aliasUsedAsFormalName', { alias, castName: usage.castName });
  }
  return getMsg('CastManagementPage.aliasUsedByOtherCast', { alias, castName: usage.castName });
}

export function filterCasts(casts: CastBean[], searchQuery: string): CastBean[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return casts;
  return casts.filter((cast) => (
    cast.name.toLowerCase().includes(query)
    || cast.aliases?.some((alias) => alias.toLowerCase().includes(query))
  ));
}

export function getEditableContactUrls(cast: CastBean): string[] {
  return cast.contact_urls && cast.contact_urls.length > 0 ? cast.contact_urls : [''];
}
