import { getMsg } from '@/messages/getMsg';

export const TWEET_TEMPLATE_KEY = 'tweet_template';

export const DEFAULT_TWEET_TEMPLATE = getMsg('tweetTemplate.defaultTemplate');

/**
 * DB から取得した投稿テンプレートを画面初期値へ変換する。
 * 空文字は利用者が保存した値として扱い、未保存の場合だけ既定テンプレートを使う。
 */
export function resolveTweetTemplate(saved: string | null): string {
  return saved ?? DEFAULT_TWEET_TEMPLATE;
}

/** 投稿テンプレートのプレースホルダーを現在のイベント情報で置換する。 */
export function buildTweetPreview(template: string, casts: string[], eventName: string): string {
  const attendingCasts = casts.filter(Boolean);
  return template
    .replace(
      /{casts}/g,
      attendingCasts.length > 0
        ? attendingCasts.join('\n')
        : getMsg('tweetTemplate.castsNotRegistered'),
    )
    .replace(/{event_name}/g, eventName || getMsg('tweetTemplate.defaultEventName'));
}
