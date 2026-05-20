export function parseMentionIds(raw) {
  if (!raw) return [];
  const ids = new Set();
  for (const m of raw.matchAll(/<@!?(\d+)>/g)) ids.add(m[1]);
  for (const m of raw.matchAll(/(?<![<\d])(\d{15,25})(?![\d>])/g)) ids.add(m[1]);
  return [...ids];
}

const MESSAGE_URL_RE =
  /^https?:\/\/(?:\w+\.)?discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/;

export function parseMessageUrl(url) {
  const m = MESSAGE_URL_RE.exec(url.trim());
  if (!m) return null;
  return { guildId: m[1], channelId: m[2], messageId: m[3] };
}
