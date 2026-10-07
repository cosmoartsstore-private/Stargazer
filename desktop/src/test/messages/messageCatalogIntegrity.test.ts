import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(process.cwd(), 'src');
const CATALOG_PATH = join(SOURCE_ROOT, 'messages', 'messages.ja.properties');
const MESSAGE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/;

function listProductSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' || entry.name === 'coverage'
        ? []
        : listProductSourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function readCatalogKeys(): string[] {
  return readFileSync(CATALOG_PATH, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trimStart())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('!'))
    .map((line) => line.slice(0, line.search(/[=:]/)).trim());
}

describe('message catalog integrity', () => {
  const sourceFiles = listProductSourceFiles(SOURCE_ROOT);
  const productSource = sourceFiles.map((path) => ({
    path: relative(SOURCE_ROOT, path),
    content: readFileSync(path, 'utf8'),
  }));
  const catalogKeys = readCatalogKeys();
  const catalogKeySet = new Set(catalogKeys);

  it('用途別のcatalogキーを重複定義しない', () => {
    // 静的な文字列検索は動的参照を判定できないため、未参照候補の削除条件にはしない。
    expect(catalogKeySet.size).toBe(catalogKeys.length);
  });

  it('getMsgへ直接渡すキーをすべてcatalogに定義する', () => {
    const undefinedReferences: string[] = [];
    const directGetMsgPattern = /\bgetMsg\(\s*(['"])([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+)\1/g;

    productSource.forEach(({ path, content }) => {
      for (const match of content.matchAll(directGetMsgPattern)) {
        const key = match[2];
        if (MESSAGE_KEY_PATTERN.test(key) && !catalogKeySet.has(key)) {
          undefinedReferences.push(`${path}: ${key}`);
        }
      }
    });

    expect(undefinedReferences).toEqual([]);
  });
});
