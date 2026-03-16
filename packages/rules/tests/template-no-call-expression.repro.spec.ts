import { describe, it, expect } from 'vitest';
import { makeContext } from './helpers.js';
import { templateNoCallExpressionRule } from '../src/rules/performance/template-no-call-expression.rule.js';

describe('template-no-call-expression (repro)', () => {
    it('flags a call with arguments', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        // Simulated TemplateExpressionNode
        const fakeNode = {
            expression: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'doSomething' },
                arguments: [{ type: 'Literal', value: 123 }]
            },
            sourceSpan: { start: 10, end: 30 }
        } as any;
        
        const results = templateNoCallExpressionRule.handle(fakeNode, ctx);
        expect(results).not.toBeNull();
        expect(results!.length).toBe(1);
    });

    it('flags a zero-argument call like getTitle()', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            expression: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'getTitle' },
                arguments: []
            },
            sourceSpan: { start: 10, end: 20 }
        } as any;
        
        const results = templateNoCallExpressionRule.handle(fakeNode, ctx);
        expect(results).not.toBeNull();
        expect(results!.length).toBe(1);
    });

    it('does NOT flag a Signal-like call title() (heuristic fallback)', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            expression: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'title' },
                arguments: []
            },
            sourceSpan: { start: 10, end: 17 }
        } as any;
        
        const results = templateNoCallExpressionRule.handle(fakeNode, ctx);
        expect(results).toBeNull();
    });
});
