/**
 * Unit Tests — template rules
 *
 * Covered rules:
 *  - template-prefer-control-flow
 *  - template-no-async-pipe-duplication
 */

import { describe, it, expect } from 'vitest';
import { templatePreferControlFlowRule } from '../src/rules/template/template-prefer-control-flow.rule.js';
import { templateNoAsyncPipeDuplicationRule } from '../src/rules/template/template-no-async-pipe-duplication.rule.js';
import { makeContext } from './helpers.js';

// ---------------------------------------------------------------------------
// template-prefer-control-flow  (TemplateAttribute stream)
// ---------------------------------------------------------------------------

describe('template-prefer-control-flow', () => {
    it('has correct name and streamType', () => {
        expect(templatePreferControlFlowRule.name).toBe('template-prefer-control-flow');
        expect(templatePreferControlFlowRule.streamType).toBe('TemplateAttribute');
    });

    it('flags *ngIf attribute', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '*ngIf',
            sourceSpan: { start: 0, end: 5 },
        } as any;
        const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('template-prefer-control-flow');
        expect((result as any).message).toContain('@if');
        expect((result as any).severity).toBe('error');
    });

    it('flags *ngFor attribute', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = { name: '*ngFor', sourceSpan: { start: 0, end: 6 } } as any;
        const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('@for');
    });

    it('flags *ngSwitch attribute', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = { name: '*ngSwitch', sourceSpan: { start: 0, end: 9 } } as any;
        const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('@switch');
    });

    it('flags [ngSwitch] attribute', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = { name: '[ngSwitch]', sourceSpan: { start: 0, end: 9 } } as any;
        const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
    });

    it('flags *ngSwitchCase attribute', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = { name: '*ngSwitchCase', sourceSpan: { start: 0, end: 12 } } as any;
        const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
    });

    it('does NOT flag a modern @if element', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = { name: 'class', sourceSpan: { start: 0, end: 5 } } as any;
        const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag arbitrary non-directive attributes', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = { name: 'id', sourceSpan: { start: 0, end: 2 } } as any;
        const result = templatePreferControlFlowRule.handle(fakeNode, ctx);
        expect(result).toBeNull();
    });

    it('contains a fix recommendation', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = { name: '*ngIf', sourceSpan: { start: 0, end: 5 } } as any;
        const result = templatePreferControlFlowRule.handle(fakeNode, ctx) as any;
        expect(result?.fix).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// template-no-async-pipe-duplication  (TemplateExpression stream)
// ---------------------------------------------------------------------------

describe('template-no-async-pipe-duplication', () => {
    it('has correct name and streamType', () => {
        expect(templateNoAsyncPipeDuplicationRule.name).toBe('template-no-async-pipe-duplication');
        expect(templateNoAsyncPipeDuplicationRule.streamType).toBe('TemplateExpression');
    });
});
