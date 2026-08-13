import ts from 'typescript';
import type { LocationMap } from '../models/source-location.js';

const DEFAULT_SOURCE_FILE_NAME = 'config.ts';

const getPropertyName = (name: ts.PropertyName): string | null => {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name)) {
    return name.text;
  }
  return null;
};

export const parseSourceFile = (
  content: string,
  fileName: string
): ts.SourceFile =>
  ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);

export const generateLocationMap = (sourceFile: ts.SourceFile): LocationMap => {
  const map: LocationMap = {};

  const record = (node: ts.Node, path: readonly string[]): void => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart()
    );
    map[path.join('.')] = { line: line + 1, column: character + 1 };
  };

  const visit = (node: ts.Node, currentPath: string[]): void => {
    if (ts.isPropertyAssignment(node) && node.name) {
      const name = getPropertyName(node.name);
      if (name) {
        const newPath = [...currentPath, name];
        record(node.name, newPath);
        visit(node.initializer, newPath);
        return;
      }
    }

    if (ts.isObjectLiteralExpression(node)) {
      node.properties.forEach((prop) => visit(prop, currentPath));
      return;
    }

    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((elem, idx) => {
        const newPath = [...currentPath, String(idx)];
        record(elem, newPath);
        visit(elem, newPath);
      });
      return;
    }

    if (ts.isExportAssignment(node)) {
      visit(node.expression, currentPath);
      return;
    }

    if (ts.isExpressionStatement(node)) {
      if (ts.isParenthesizedExpression(node.expression)) {
        visit(node.expression.expression, currentPath);
      } else {
        visit(node.expression, currentPath);
      }
      return;
    }

    ts.forEachChild(node, (child) => visit(child, currentPath));
  };

  visit(sourceFile, []);
  return map;
};

export const ASTUtils = {
  parse: (
    content: string,
    fileName: string = DEFAULT_SOURCE_FILE_NAME
  ): ts.SourceFile => parseSourceFile(content, fileName),
  generateLocationMap,
};
