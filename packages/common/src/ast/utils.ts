/**
 * @fileoverview
 * TypeScript-AST helpers used by the config-health enricher.
 *
 * Parses a TypeScript source string into a `SourceFile` and produces a
 * `LocationMap` keyed by dot-notation property paths (`rules.my-rule`) so
 * the config validator can attach precise line/column locations to issues
 * it surfaces from a user-authored config file.
 */

import ts from 'typescript';

/** 1-based source location used in config validation reports. */
export interface Location {
    line: number;
    column: number;
}

/** Map from dot-notation config paths to source locations. */
export type LocationMap = Record<string, Location>;

/**
 * Static helpers for extracting source locations from config-like TypeScript.
 *
 * These utilities stay in `common` because config validation and reporter
 * diagnostics both need the same lightweight path-to-location mapping without
 * depending on the analyzer engine.
 */
export class ASTUtils {
    /**
     * Parses content into a TypeScript `SourceFile`.
     *
     * @param content - Source text to parse.
     * @param fileName - Virtual or real file name used in parser diagnostics.
     * @returns A TypeScript source file retaining node positions.
     */
    static parse(content: string, fileName = 'config.ts'): ts.SourceFile {
        return ts.createSourceFile(
            fileName,
            content,
            ts.ScriptTarget.Latest,
            true
        );
    }

    /**
     * Generates a map of all property locations in the object.
     * Keys are dot-notation paths (e.g. "rules.my-rule").
     *
     * @param sourceFile - Parsed source file containing a config object.
     * @returns Dot-path keys mapped to 1-based line and column locations.
     */
    static generateLocationMap(sourceFile: ts.SourceFile): LocationMap {
        const map: LocationMap = {};

        const visit = (node: ts.Node, currentPath: string[]) => {
            if (ts.isPropertyAssignment(node) && node.name) {
                const name = this.getPropertyName(node.name);
                if (name) {
                    const newPath = [...currentPath, name];
                    const pathKey = newPath.join('.');

                    // Store location of the KEY (name node)
                    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.name.getStart());
                    map[pathKey] = {
                        line: line + 1,
                        column: character + 1
                    };

                    // Traverse into initializer (value)
                    visit(node.initializer, newPath);
                    return; // Don't traverse name again
                }
            }

            if (ts.isObjectLiteralExpression(node)) {
                node.properties.forEach(prop => visit(prop, currentPath));
                return;
            }

            // Handle arrays (optional, if we want array index locations)
            if (ts.isArrayLiteralExpression(node)) {
                node.elements.forEach((elem, idx) => {
                    const newPath = [...currentPath, String(idx)];
                    const pathKey = newPath.join('.');

                    // Store location of the ELEMENT itself
                    const { line, character } = sourceFile.getLineAndCharacterOfPosition(elem.getStart());
                    map[pathKey] = {
                        line: line + 1,
                        column: character + 1
                    };

                    visit(elem, newPath);
                });
                return;
            }

            // Handle root export
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

            ts.forEachChild(node, child => visit(child, currentPath));
        };

        visit(sourceFile, []);
        return map;
    }

    private static getPropertyName(name: ts.PropertyName): string | null {
        if (ts.isIdentifier(name)) {
            return name.text;
        }
        if (ts.isStringLiteral(name)) {
            return name.text;
        }
        return null;
    }
}
