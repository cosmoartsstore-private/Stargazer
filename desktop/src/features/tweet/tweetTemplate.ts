import { getMsg } from '@/messages/getMsg';

export const TWEET_TEMPLATE_KEY = 'tweet_template';
export const TWEET_TEMPLATE_MAX_LENGTH = 500;

export const DEFAULT_TWEET_TEMPLATE = getMsg('tweetTemplate.defaultTemplate');

/** 投稿テンプレートを画面入力で扱う上限へ切り詰める。 */
export function limitTweetTemplate(value: string): string {
  return value.slice(0, TWEET_TEMPLATE_MAX_LENGTH);
}

/**
 * DB から取得した投稿テンプレートを画面初期値へ変換する。
 * 空文字は利用者が保存した値として扱い、未保存の場合だけ既定テンプレートを使う。
 */
export function resolveTweetTemplate(saved: string | null): string {
  return limitTweetTemplate(saved ?? DEFAULT_TWEET_TEMPLATE);
}

/** 出席キャストの置換値を、プレビューへ入る長さだけ組み立てる。 */
function buildLimitedCastText(attendingCasts: string[]): string {
  if (attendingCasts.length === 0) {
    return limitTweetTemplate(getMsg('tweetTemplate.castsNotRegistered'));
  }

  let castText = '';
  for (let index = 0; index < attendingCasts.length; index += 1) {
    const nextValue = `${index === 0 ? '' : '\n'}${attendingCasts[index]}`;
    castText += nextValue.slice(0, TWEET_TEMPLATE_MAX_LENGTH - castText.length);
    if (castText.length >= TWEET_TEMPLATE_MAX_LENGTH) break;
  }
  return castText;
}

/** 投稿テンプレートのプレースホルダーを現在のイベント情報で置換する。 */
export function buildTweetPreview(template: string, casts: string[], eventName: string): string {
  const attendingCasts = casts.filter(Boolean);
  const castText = buildLimitedCastText(attendingCasts);
  const eventText = eventName || getMsg('tweetTemplate.defaultEventName');
  let preview = '';
  let sourceIndex = 0;

  for (const match of template.matchAll(/{casts}|{event_name}/g)) {
    const matchIndex = match.index ?? sourceIndex;
    preview += template.slice(sourceIndex, matchIndex).slice(0, TWEET_TEMPLATE_MAX_LENGTH - preview.length);
    if (preview.length >= TWEET_TEMPLATE_MAX_LENGTH) return preview;

    const replacement = match[0] === '{casts}' ? castText : eventText;
    preview += replacement.slice(0, TWEET_TEMPLATE_MAX_LENGTH - preview.length);
    if (preview.length >= TWEET_TEMPLATE_MAX_LENGTH) return preview;
    sourceIndex = matchIndex + match[0].length;
  }

  preview += template.slice(sourceIndex, sourceIndex + TWEET_TEMPLATE_MAX_LENGTH - preview.length);
  return preview;
}
