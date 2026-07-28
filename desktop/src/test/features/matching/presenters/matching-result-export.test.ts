import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CastBean, UserBean } from '@/common/types/entities';
import type { MatchedCast } from '@/features/matching/logics/matching-io';
import type { CastResultRow } from '@/features/matching/presenters/matching-result-view';
import { buildCastMatchingTsvRows, exportElementAsPng } from '@/features/matching/presenters/matching-result-export';

const imageMocks = vi.hoisted(() => ({
  toPng: vi.fn(),
}));

vi.mock('html-to-image', () => imageMocks);

interface FakeAnchor {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
}

function installDocumentStub(anchor: FakeAnchor): ReturnType<typeof vi.fn> {
  const createElement = vi.fn((tagName: string) => {
    if (tagName !== 'a') throw new Error(`unexpected element: ${tagName}`);
    return anchor as unknown as HTMLAnchorElement;
  });
  vi.stubGlobal('document', { createElement });
  return createElement;
}

const user: UserBean = { name: 'Alice', x_id: '@alice', casts: ['Cast A'], raw_extra: [] };
const cast: CastBean = { id: 1, name: 'Cast A', is_present: true };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('exportElementAsPng', () => {
  it('対象要素がない場合は画像生成もダウンロードも行わない', async () => {
    await exportElementAsPng(null, 'matching-result');

    expect(imageMocks.toPng).not.toHaveBeenCalled();
  });

  it('高解像度PNGを生成し、拡張子を補完したファイル名でダウンロードする', async () => {
    const node = {} as HTMLElement;
    const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
    const createElement = installDocumentStub(anchor);
    imageMocks.toPng.mockResolvedValue('data:image/png;base64,result');

    await exportElementAsPng(node, 'matching-result');

    expect(imageMocks.toPng).toHaveBeenCalledWith(node, { cacheBust: true, pixelRatio: 2 });
    expect(createElement).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('data:image/png;base64,result');
    expect(anchor.download).toBe('matching-result.png');
    expect(anchor.click).toHaveBeenCalledOnce();
  });

  it('既にPNG拡張子があるファイル名は変更しない', async () => {
    const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
    installDocumentStub(anchor);
    imageMocks.toPng.mockResolvedValue('data:image/png;base64,result');

    await exportElementAsPng({} as HTMLElement, 'matching-result.png');

    expect(anchor.download).toBe('matching-result.png');
  });

  it('画像生成の失敗を呼び出し元へ通知し、ダウンロードを開始しない', async () => {
    const imageError = new Error('image generation failed');
    const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
    const createElement = installDocumentStub(anchor);
    imageMocks.toPng.mockRejectedValue(imageError);

    await expect(exportElementAsPng({} as HTMLElement, 'matching-result')).rejects.toBe(imageError);
    expect(createElement).not.toHaveBeenCalled();
    expect(anchor.click).not.toHaveBeenCalled();
  });

  it('ダウンロード開始の失敗を呼び出し元へ通知する', async () => {
    const clickError = new Error('download blocked');
    const anchor: FakeAnchor = {
      href: '',
      download: '',
      click: vi.fn(() => {
        throw clickError;
      }),
    };
    installDocumentStub(anchor);
    imageMocks.toPng.mockResolvedValue('data:image/png;base64,result');

    await expect(exportElementAsPng({} as HTMLElement, 'matching-result')).rejects.toBe(clickError);
  });
});

describe('buildCastMatchingTsvRows', () => {
  it('キャスト別マッチング結果を TSV 用の行配列へ変換する', () => {
    const match: MatchedCast = { cast, rank: 1, rotationIndex: 0, isNGWarning: true };
    const rows: CastResultRow[] = [
      {
        cast,
        assignments: [{ user, match }],
      },
    ];

    expect(buildCastMatchingTsvRows(rows, [0])).toEqual([
      ['キャスト名', '第1ラウンド'],
      ['Cast A', 'Alice (@alice / 第1希望 / NG)'],
    ]);
  });

  it('該当列に割り当てがない場合は空セルにする', () => {
    const match: MatchedCast = { cast, rank: 1, rotationIndex: 1 };
    const rows: CastResultRow[] = [
      {
        cast,
        assignments: [{ user, match }],
      },
    ];

    expect(buildCastMatchingTsvRows(rows, [0, 1])).toEqual([
      ['キャスト名', '第1ラウンド', '第2ラウンド'],
      ['Cast A', '', 'Alice (@alice / 第1希望)'],
    ]);
  });
});
