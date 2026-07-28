import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTsv } from '@/common/downloadTsv';

interface FakeAnchor {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
}

function createDocumentStub(anchor: FakeAnchor): Pick<Document, 'createElement'> {
  return {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== 'a') {
        throw new Error(`unexpected element: ${tagName}`);
      }
      return anchor as unknown as HTMLAnchorElement;
    }),
  };
}

function installDownloadStubs(anchor: FakeAnchor): {
  createObjectURL: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
} {
  const createObjectURL = vi.fn(() => 'blob:stargazer-tsv');
  const revokeObjectURL = vi.fn();

  vi.stubGlobal('document', createDocumentStub(anchor));
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

  return { createObjectURL, revokeObjectURL };
}

async function getDownloadedBody(
  rows: Array<Array<string | number | null | undefined>>,
): Promise<string> {
  const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
  const { createObjectURL } = installDownloadStubs(anchor);
  downloadTsv(rows, 'test');
  const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
  return blob.text();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('downloadTsv の内容生成', () => {
  it('セルをタブで連結し、行を CRLF で連結する', async () => {
    await expect(getDownloadedBody([
      ['name', 'x_id'],
      ['応募者A', 'x_id_a'],
      ['応募者B', 'x_id_b'],
    ])).resolves.toBe('name\tx_id\r\n応募者A\tx_id_a\r\n応募者B\tx_id_b');
  });

  it('セル内のタブと改行を半角スペースに置換し、前後空白を取り除く', async () => {
    await expect(getDownloadedBody([['  応募者\tA  ', 'line1\r\nline2\nline3']])).resolves.toBe(
      '応募者 A\tline1 line2 line3',
    );
  });

  it('数値セルを文字列化する', async () => {
    await expect(getDownloadedBody([['count', 0], ['score', 42]]))
      .resolves.toBe('count\t0\r\nscore\t42');
  });

  it('null と undefined のセルを空セルとして扱う', async () => {
    await expect(getDownloadedBody([['name', null, undefined, 'memo']]))
      .resolves.toBe('name\t\t\tmemo');
  });

  it('空の行配列は空文字に変換する', async () => {
    await expect(getDownloadedBody([])).resolves.toBe('');
  });
});

describe('downloadTsv', () => {
  it('TSV Blob を作成し、拡張子を補完したファイル名でダウンロードする', async () => {
    const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
    const { createObjectURL, revokeObjectURL } = installDownloadStubs(anchor);

    downloadTsv([['name', 'x_id'], ['応募者A', 'x_id_a']], 'applicants');

    expect(anchor.href).toBe('blob:stargazer-tsv');
    expect(anchor.download).toBe('applicants.tsv');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stargazer-tsv');

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('text/tab-separated-values;charset=utf-8');
    await expect(blob.text()).resolves.toBe('name\tx_id\r\n応募者A\tx_id_a');
  });

  it('リンク要素の作成に失敗しても Object URL を解放する', () => {
    const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
    const { revokeObjectURL } = installDownloadStubs(anchor);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        throw new Error('document blocked');
      }),
    });

    expect(() => downloadTsv([['name']], 'applicants')).toThrow('document blocked');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stargazer-tsv');
  });

  it('既に TSV 拡張子があるファイル名は変更しない', () => {
    const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
    installDownloadStubs(anchor);

    downloadTsv([['name']], 'applicants.tsv');

    expect(anchor.download).toBe('applicants.tsv');
  });

  it('大文字の TSV 拡張子も既存拡張子として扱う', () => {
    const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
    installDownloadStubs(anchor);

    downloadTsv([['name']], 'applicants.TSV');

    expect(anchor.download).toBe('applicants.TSV');
  });

  it('クリック処理が失敗しても Object URL を解放する', () => {
    const clickError = new Error('download blocked');
    const anchor: FakeAnchor = {
      href: '',
      download: '',
      click: vi.fn(() => {
        throw clickError;
      }),
    };
    const { revokeObjectURL } = installDownloadStubs(anchor);

    expect(() => downloadTsv([['name']], 'applicants')).toThrow(clickError);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stargazer-tsv');
  });
});
