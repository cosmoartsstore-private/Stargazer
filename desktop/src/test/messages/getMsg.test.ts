import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMsg } from '@/messages/getMsg';

async function importCatalog(source: string) {
  vi.resetModules();
  vi.doMock('@/messages/messages.ja.properties?raw', () => ({ default: source }));
  return import('@/messages/getMsg');
}

afterEach(() => {
  vi.doUnmock('@/messages/messages.ja.properties?raw');
  vi.resetModules();
});

describe('getMsg', () => {
  it('通常の文言キーを解決する', () => {
    expect(getMsg('common.confirm')).toBe('確認');
  });

  it('名前付き変数を文言へ埋め込む', () => {
    expect(getMsg('CounterControl.increase', { label: '参加人数' })).toBe('参加人数を増やす');
  });

  it('利用者向けエラーへ内部の原因詳細を表示しない', () => {
    const message = getMsg('EventManagementPage.createFailed', { detail: 'already exists' });

    expect(message).toBe('イベントを作成できませんでした。一覧に追加されていないことを確認してから、もう一度お試しください。');
    expect(message).not.toContain('already exists');
  });

  it('二重波括弧をプレースホルダー表記として出力する', () => {
    expect(getMsg('tweetTemplate.defaultTemplate')).toBe('【出席キャスト】\n{casts}');
  });

  it('必要な変数が指定されていない場合はエラーにする', () => {
    expect(() => getMsg('CounterControl.increase')).toThrow(
      '文言キー「CounterControl.increase」の変数「label」が指定されていません。',
    );
  });

  it('未定義の文言キーはエラーにする', () => {
    expect(() => getMsg('unknown.missing')).toThrow(
      '文言キー「unknown.missing」が定義されていません。',
    );
  });

  it('properties形式のコメント、区切り文字、エスケープを解釈する', async () => {
    const catalog = await importCatalog(String.raw`
# コメント
! コメント
sample.escaped=改行\n復帰\rタブ\t円記号\\等号\=コロン\:
sample.colon:値
`);

    expect(catalog.getMsg('sample.escaped')).toBe('改行\n復帰\rタブ\t円記号\\等号=コロン:');
    expect(catalog.getMsg('sample.colon')).toBe('値');
  });

  it.each([
    ['区切り文字がない行', 'sample.invalid', 'messages.ja.properties:1 の形式が不正です。'],
    ['不正なキー', 'invalid=value', 'messages.ja.properties:1 のキー「invalid」が不正です。'],
    [
      '重複したキー',
      'sample.duplicate=1\nsample.duplicate=2',
      'messages.ja.properties:2 のキー「sample.duplicate」が重複しています。',
    ],
  ])('%sはcatalog読込時にエラーにする', async (_, source, expected) => {
    await expect(importCatalog(source)).rejects.toThrow(expected);
  });
});
