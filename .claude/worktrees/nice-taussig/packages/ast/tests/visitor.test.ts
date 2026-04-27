import { describe, it, expect } from 'vitest';
import { parseTs } from '../src/parsers/ts.js';
import { walkProgram } from '../src/visitor.js';

describe('visitor', () => {
    it('visits every node in the AST', () => {
        const source = 'const x = 1 + 2;';
        const result = parseTs(source, 'test.ts');
        
        const nodeTypes: string[] = [];
        walkProgram(result.program, (node) => {
            if (node.type) {
                nodeTypes.push(node.type);
            }
        });

        expect(nodeTypes).toContain('Program');
        expect(nodeTypes).toContain('VariableDeclaration');
        expect(nodeTypes).toContain('VariableDeclarator');
        expect(nodeTypes).toContain('BinaryExpression');
        expect(nodeTypes).toContain('Literal');
    });

    it('skips children when visitor returns false', () => {
        const source = 'const x = 1 + 2;';
        const result = parseTs(source, 'test.ts');
        
        let binaryExpressionSeen = false;
        let numericLiteralSeen = false;

        walkProgram(result.program, (node) => {
            if (node.type === 'BinaryExpression') {
                binaryExpressionSeen = true;
                return false; // Skip traversing into the 1 + 2
            }
            if (node.type === 'Literal') {
                numericLiteralSeen = true;
            }
        });

        expect(binaryExpressionSeen).toBe(true);
        expect(numericLiteralSeen).toBe(false); // Should not have visited the children
    });
});
