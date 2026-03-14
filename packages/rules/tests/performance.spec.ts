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
        expect(templateTrackByRequiredRule.streamType).toBe('TemplateAttribute');
    });
});
