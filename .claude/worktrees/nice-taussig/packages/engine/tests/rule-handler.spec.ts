/**
 * Unit Tests — rule-handler.ts
 *
 * Verifies that all factory helpers create correctly-shaped RuleHandler objects
 * with the right streamType, name, meta, and handle delegation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    createComponentRule,
    createAnyAngularClassRule,
    createDecoratedPropertyRule,
    createTemplateExpressionRule,
    createTemplateAttributeRule,
    createCallExpressionRule,
    createNewExpressionRule,
} from '../src/rule-handler.js';

// ---------------------------------------------------------------------------
// createComponentRule
// ---------------------------------------------------------------------------

describe('createComponentRule', () => {
    it('creates a handler with streamType "AngularClass"', () => {
        const handler = createComponentRule('rule-a', () => null);
        expect(handler.streamType).toBe('AngularClass');
    });

    it('stores the provided name', () => {
        const handler = createComponentRule('my-component-rule', () => null);
        expect(handler.name).toBe('my-component-rule');
    });

    it('delegates handle() to the provided function', () => {
        const fn = vi.fn().mockReturnValue(null);
        const handler = createComponentRule('r', fn);
        handler.handle({} as any, {} as any);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('forwards the optional meta field', () => {
        const meta = { description: 'desc', category: 'best-practices' };
        const handler = createComponentRule('r', () => null, meta as any);
        expect(handler.meta).toBe(meta);
    });

    it('meta is undefined when not provided', () => {
        const handler = createComponentRule('r', () => null);
        expect(handler.meta).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// createAnyAngularClassRule
// ---------------------------------------------------------------------------

describe('createAnyAngularClassRule', () => {
    it('creates a handler with streamType "AnyAngularClass"', () => {
        const handler = createAnyAngularClassRule('rule-b', () => null);
        expect(handler.streamType).toBe('AnyAngularClass');
    });

    it('stores the provided name', () => {
        const handler = createAnyAngularClassRule('any-class', () => null);
        expect(handler.name).toBe('any-class');
    });

    it('delegates handle() to the provided function', () => {
        const fn = vi.fn().mockReturnValue(null);
        const handler = createAnyAngularClassRule('r', fn);
        handler.handle({} as any, {} as any);
        expect(fn).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// createDecoratedPropertyRule
// ---------------------------------------------------------------------------

describe('createDecoratedPropertyRule', () => {
    it('creates a handler with streamType "DecoratedProperty"', () => {
        const handler = createDecoratedPropertyRule('rule-c', () => null);
        expect(handler.streamType).toBe('DecoratedProperty');
    });

    it('stores the provided name', () => {
        const handler = createDecoratedPropertyRule('prop-rule', () => null);
        expect(handler.name).toBe('prop-rule');
    });

    it('delegates handle() to the provided function', () => {
        const fn = vi.fn().mockReturnValue(null);
        const handler = createDecoratedPropertyRule('r', fn);
        handler.handle({} as any, {} as any);
        expect(fn).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// createTemplateExpressionRule
// ---------------------------------------------------------------------------

describe('createTemplateExpressionRule', () => {
    it('creates a handler with streamType "TemplateExpression"', () => {
        const handler = createTemplateExpressionRule('rule-d', () => null);
        expect(handler.streamType).toBe('TemplateExpression');
    });

    it('stores the provided name', () => {
        const handler = createTemplateExpressionRule('tmpl-expr', () => null);
        expect(handler.name).toBe('tmpl-expr');
    });

    it('forwards the optional meta field', () => {
        const meta = { category: 'template' };
        const handler = createTemplateExpressionRule('r', () => null, meta as any);
        expect(handler.meta).toBe(meta);
    });

    it('returns handler whose handle() forwards the return value', () => {
        const failure = { filePath: '/a.ts', message: 'm', line: 1, column: 1, severity: 'error' as const, ruleName: 'r' };
        const handler = createTemplateExpressionRule('r', () => failure);
        const result = handler.handle({} as any, {} as any);
        expect(result).toBe(failure);
    });
});

// ---------------------------------------------------------------------------
// createTemplateAttributeRule
// ---------------------------------------------------------------------------

describe('createTemplateAttributeRule', () => {
    it('creates a handler with streamType "TemplateAttribute"', () => {
        const handler = createTemplateAttributeRule('rule-e', () => null);
        expect(handler.streamType).toBe('TemplateAttribute');
    });

    it('stores the provided name', () => {
        const handler = createTemplateAttributeRule('tmpl-attr', () => null);
        expect(handler.name).toBe('tmpl-attr');
    });
});

// ---------------------------------------------------------------------------
// createCallExpressionRule
// ---------------------------------------------------------------------------

describe('createCallExpressionRule', () => {
    it('creates a handler with streamType "CallExpression"', () => {
        const handler = createCallExpressionRule('rule-f', () => null);
        expect(handler.streamType).toBe('CallExpression');
    });

    it('stores the provided name', () => {
        const handler = createCallExpressionRule('call-rule', () => null);
        expect(handler.name).toBe('call-rule');
    });

    it('forwards the optional meta field', () => {
        const meta = { description: 'call rule' };
        const handler = createCallExpressionRule('r', () => null, meta as any);
        expect(handler.meta).toBe(meta);
    });

    it('delegates handle() to the provided function', () => {
        const fn = vi.fn().mockReturnValue(null);
        const handler = createCallExpressionRule('r', fn);
        handler.handle({} as any, {} as any);
        expect(fn).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// createNewExpressionRule
// ---------------------------------------------------------------------------

describe('createNewExpressionRule', () => {
    it('creates a handler with streamType "NewExpression"', () => {
        const handler = createNewExpressionRule('rule-g', () => null);
        expect(handler.streamType).toBe('NewExpression');
    });

    it('stores the provided name', () => {
        const handler = createNewExpressionRule('new-rule', () => null);
        expect(handler.name).toBe('new-rule');
    });

    it('forwards the optional meta field', () => {
        const meta = { category: 'security' };
        const handler = createNewExpressionRule('r', () => null, meta as any);
        expect(handler.meta).toBe(meta);
    });

    it('delegates handle() to the provided function', () => {
        const fn = vi.fn().mockReturnValue(null);
        const handler = createNewExpressionRule('r', fn);
        handler.handle({} as any, {} as any);
        expect(fn).toHaveBeenCalledOnce();
    });
});
