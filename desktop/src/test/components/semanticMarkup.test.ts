// @ts-expect-error VitestはNode環境で実行するが、Frontendの型設定へNode APIを公開しない。
import fs from 'node:fs';
// @ts-expect-error VitestはNode環境で実行するが、Frontendの型設定へNode APIを公開しない。
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

declare const process: { cwd: () => string };

const SOURCE_ROOT = path.resolve(process.cwd(), 'src');
const RUST_SOURCE_ROOT = path.resolve(process.cwd(), 'src-tauri', 'src');
const CLICKABLE_GENERIC_TAGS = new Set(['div', 'span', 'tr', 'td', 'li', 'section', 'article']);
const INVALID_BUTTON_DESCENDANTS = new Set([
  'a',
  'article',
  'aside',
  'button',
  'div',
  'footer',
  'header',
  'input',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'select',
  'table',
  'textarea',
  'ul',
]);

function collectFiles(root: string, extensions: ReadonlySet<string>): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'test' || entry.name === 'coverage') continue;
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (extensions.has(path.extname(entry.name))) {
        files.push(filePath);
      }
    }
  };
  visit(root);
  return files;
}

function getOpeningElement(node: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxOpeningLikeElement {
  return ts.isJsxElement(node) ? node.openingElement : node;
}

function getTagName(node: ts.JsxElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile): string {
  return getOpeningElement(node).tagName.getText(sourceFile);
}

function getAttributeNames(opening: ts.JsxOpeningLikeElement): ReadonlySet<string> {
  return new Set(
    opening.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => attribute.name.getText()),
  );
}

function hasJsxAncestor(node: ts.Node, tagName: string, sourceFile: ts.SourceFile): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent))
      && getTagName(parent, sourceFile) === tagName
    ) return true;
  }
  return false;
}

function containsIntrinsicDescendant(
  node: ts.Node,
  tagNames: ReadonlySet<string>,
  sourceFile: ts.SourceFile,
): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (
      (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
      && tagNames.has(getTagName(child, sourceFile))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function formatLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  return `${path.relative(process.cwd(), sourceFile.fileName)}:${line}`;
}

function auditSemanticMarkup(): string[] {
  const issues: string[] = [];
  const files = collectFiles(SOURCE_ROOT, new Set(['.tsx']));

  for (const file of files) {
    const sourceFile = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = getOpeningElement(node);
        const tagName = getTagName(node, sourceFile);
        const attributes = getAttributeNames(opening);
        const location = formatLocation(sourceFile, opening);

        if (tagName === 'button' && !attributes.has('type')) {
          issues.push(`${location} buttonにtypeがありません。`);
        }
        if (tagName === 'input' && !attributes.has('type')) {
          issues.push(`${location} inputにtypeがありません。`);
        }
        if (CLICKABLE_GENERIC_TAGS.has(tagName) && attributes.has('onClick')) {
          issues.push(`${location} クリック操作に汎用要素${tagName}を使用しています。`);
        }
        if (
          tagName === 'AppSelect'
          && !attributes.has('ariaLabel')
          && !attributes.has('ariaLabelledBy')
        ) {
          issues.push(`${location} AppSelectにアクセシブル名がありません。`);
        }
        if (tagName === 'main' && hasJsxAncestor(node, 'main', sourceFile)) {
          issues.push(`${location} mainが入れ子になっています。`);
        }
        if (
          tagName === 'button'
          && ts.isJsxElement(node)
          && containsIntrinsicDescendant(node, INVALID_BUTTON_DESCENDANTS, sourceFile)
        ) {
          issues.push(`${location} buttonに構造要素または別の操作要素が含まれています。`);
        }

        const role = opening.attributes.properties.find(
          (attribute): attribute is ts.JsxAttribute => (
            ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'role'
          ),
        );
        if (
          role?.initializer?.getText(sourceFile) === '"tablist"'
          && !attributes.has('aria-label')
          && !attributes.has('aria-labelledby')
        ) {
          issues.push(`${location} tablistにアクセシブル名がありません。`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return issues;
}

describe('production source invariants', () => {
  it('操作と文書構造に対応するHTML・ARIA契約を維持する', () => {
    expect(auditSemanticMarkup()).toEqual([]);
  });

  it('開発者向け標準出力をproduction sourceへ追加しない', () => {
    const files = [
      ...collectFiles(SOURCE_ROOT, new Set(['.ts', '.tsx'])),
      ...collectFiles(RUST_SOURCE_ROOT, new Set(['.rs'])),
    ];
    const outputPattern = /console\.(?:log|error|warn|info|debug)|\breportDiagnosticError\b|\b(?:println|eprintln|dbg)!/;
    const violations = files
      .filter((file) => outputPattern.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(process.cwd(), file));

    expect(violations).toEqual([]);
  });
});
