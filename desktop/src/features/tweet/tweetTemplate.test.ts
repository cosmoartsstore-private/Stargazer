import { describe, expect, it } from 'vitest';
import { buildTweetPreview, DEFAULT_TWEET_TEMPLATE, resolveTweetTemplate } from './tweetTemplate';

describe('resolveTweetTemplate', () => {
  it('未保存の場合は既定テンプレートを返す', () => {
    expect(resolveTweetTemplate(null)).toBe(DEFAULT_TWEET_TEMPLATE);
  });

  it('保存済みテンプレートを返す', () => {
    expect(resolveTweetTemplate('本日の出席\n{casts}')).toBe('本日の出席\n{casts}');
  });

  it('空文字は保存済みテンプレートとして返す', () => {
    expect(resolveTweetTemplate('')).toBe('');
  });
});

describe('buildTweetPreview', () => {
  it('キャスト一覧とイベント名を置換する', () => {
    const preview = buildTweetPreview(
      '{event_name}\n{casts}',
      ['Cast A', '', 'Cast B'],
      'Sample Event',
    );

    expect(preview).toBe('Sample Event\nCast A\nCast B');
  });

  it('キャスト未登録時は案内文を表示し、イベント名未指定時は既定値を使う', () => {
    const preview = buildTweetPreview('{event_name}\n{casts}', [], '');

    expect(preview).toBe('イベント\n（キャスト未登録）');
  });

  it('未使用プレースホルダーは空文字に置換する', () => {
    const preview = buildTweetPreview('{date}|{cast_count}|{tags}', ['Cast A'], 'Sample Event');

    expect(preview).toBe('||');
  });
});
