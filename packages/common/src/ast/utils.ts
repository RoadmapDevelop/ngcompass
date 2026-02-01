import ts from 'typescript';

export interface Location {
    line: number;
    column: number;
}

export type LocationMap = Record<string, Location>;

export class ASTUtils {
    /**
     * Parses content into a TypeScript SourceFile.
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
