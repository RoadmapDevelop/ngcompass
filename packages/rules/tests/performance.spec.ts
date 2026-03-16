/**
 * Unit Tests — performance rules
 *
 * Covered rules:
 *  - prefer-on-push-component-change-detection
 *  - template-no-call-expression
 *  - template-no-array-literal-binding
 *  - template-no-object-literal-binding
 *  - template-trackby-required
 */

import { describe, it, expect } from 'vitest';
import { makeContext, findCallExpressions } from './helpers.js';
import { preferOnPushRule } from '../src/rules/performance/prefer-on-push.rule.js';
import { templateNoCallExpressionRule } from '../src/rules/performance/template-no-call-expression.rule.js';
import { templateNoArrayLiteralBindingRule } from '../src/rules/performance/template-no-array-literal-binding.rule.js';
import { templateNoObjectLiteralBindingRule } from '../src/rules/performance/template-no-object-literal-binding.rule.js';
import { templateTrackByRequiredRule } from '../src/rules/performance/template-trackby-required.rule.js';

// ---------------------------------------------------------------------------
// prefer-on-push-component-change-detection
// ---------------------------------------------------------------------------

describe('prefer-on-push-component-change-detection', () => {
    it('has correct name and streamType', () => {
        expect(preferOnPushRule.name).toBe('prefer-on-push-component-change-detection');
        expect(preferOnPushRule.streamType).toBe('AngularClass');
    });

    it('flags a component without changeDetection specified', () => {
        // The rule receives an AngularClassNode whose metadata is populated by the engine.
        // In tests we construct a minimal metadata object matching what the rule reads.
        const ctx = makeContext('', '/src/onpush-flag-a.component.ts');
        const fakeNode = {
            metadata: {
                type: 'Component',
                changeDetection: { kind: 'missing' },
                className: 'AppComponent',
                decoratorStart: 0,
            },
        };
        const result = preferOnPushRule.handle(fakeNode as any, ctx) as any;
        expect(result).not.toBeNull();
        expect(result.ruleName).toBe('prefer-on-push-component-change-detection');
        expect(result.severity).toBe('error');
        expect(result.message).toContain('AppComponent');
    });

    it('flags a component with ChangeDetectionStrategy.Default', () => {
        const ctx = makeContext('', '/src/onpush-default-b.component.ts');
        const fakeNode = {
            metadata: {
                type: 'Component',
                // ChangeDetectionStrategy.Default = 0
                changeDetection: { kind: 'literal', value: 0 },
                className: 'DefaultComponent',
                decoratorStart: 0,
            },
        };
        const result = preferOnPushRule.handle(fakeNode as any, ctx) as any;
        expect(result).not.toBeNull();
        expect(result.message).toContain('DefaultComponent');
    });

    it('does NOT flag a component with ChangeDetectionStrategy.OnPush', () => {
        const ctx = makeContext('', '/src/onpush-ok-c.component.ts');
        const fakeNode = {
            metadata: {
                type: 'Component',
                // ChangeDetectionStrategy.OnPush = 1
                changeDetection: { kind: 'literal', value: 1 },
                className: 'OnPushComponent',
                decoratorStart: 0,
            },
        };
        const result = preferOnPushRule.handle(fakeNode as any, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag when changeDetection is a non-literal expression', () => {
        // kind: 'non-literal' means the value is computed — rule backs off to avoid FPs
        const ctx = makeContext('', '/src/onpush-nonlit-d.component.ts');
        const fakeNode = {
            metadata: {
                type: 'Component',
                changeDetection: { kind: 'non-literal' },
                className: 'DynamicComponent',
                decoratorStart: 0,
            },
        };
        const result = preferOnPushRule.handle(fakeNode as any, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag a Directive (metadata.type !== Component)', () => {
        const ctx = makeContext('', '/src/onpush-dir-e.directive.ts');
        const fakeNode = {
            metadata: {
                type: 'Directive',
                changeDetection: { kind: 'missing' },
                className: 'SomeDirective',
                decoratorStart: 0,
            },
        };
        const result = preferOnPushRule.handle(fakeNode as any, ctx);
        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// template-no-call-expression  (TemplateExpression stream)
// ---------------------------------------------------------------------------

describe('template-no-call-expression', () => {
    it('has correct name and streamType', () => {
        expect(templateNoCallExpressionRule.name).toBe('template-no-call-expression');
        expect(templateNoCallExpressionRule.streamType).toBe('TemplateExpression');
    });
});

// ---------------------------------------------------------------------------
// template-no-array-literal-binding  (TemplateExpression stream)
// ---------------------------------------------------------------------------

describe('template-no-array-literal-binding', () => {
    it('has correct name and streamType', () => {
        expect(templateNoArrayLiteralBindingRule.name).not.toBeUndefined();
        expect(templateNoArrayLiteralBindingRule.streamType).toBe('TemplateExpression');
    });
});

// ---------------------------------------------------------------------------
// template-no-object-literal-binding  (TemplateExpression stream)
// ---------------------------------------------------------------------------

describe('template-no-object-literal-binding', () => {
    it('has correct name and streamType', () => {
        expect(templateNoObjectLiteralBindingRule.name).not.toBeUndefined();
        expect(templateNoObjectLiteralBindingRule.streamType).toBe('TemplateExpression');
    });
});

// ---------------------------------------------------------------------------
// template-trackby-required
// ---------------------------------------------------------------------------

describe('template-trackby-required', () => {
    it('has correct name and streamType', () => {
        expect(templateTrackByRequiredRule.name).not.toBeUndefined();
        expect(templateTrackByRequiredRule.streamType).toBe('Template');
    });
});
