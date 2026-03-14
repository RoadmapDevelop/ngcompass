/**
 * Unit Tests — modern-api rules
 *
 * Covered rules:
 *  - prefer-inject (constructor DI → inject())
 *  - signal-prefer-input-signal
 *  - signal-prefer-output-function
 *  - signal-prefer-model
 */

import { describe, it, expect } from 'vitest';
import { signalPreferInputSignalRule } from '../src/rules/modern-api/signal-prefer-input-signal.rule.js';
import { signalPreferOutputFunctionRule } from '../src/rules/modern-api/signal-prefer-output-function.rule.js';
import { signalPreferModelRule } from '../src/rules/modern-api/signal-prefer-model.rule.js';
import { preferInjectRule } from '../src/rules/modern-api/prefer-inject.rule.js';

// ---------------------------------------------------------------------------
// prefer-inject
// ---------------------------------------------------------------------------

describe('prefer-inject', () => {
    it('has correct name and streamType', () => {
        expect(preferInjectRule.name).toBe('prefer-inject-over-constructor-di');
        expect(preferInjectRule.streamType).toBe('AnyAngularClass');
    });
});

// ---------------------------------------------------------------------------
// signal-prefer-input-signal
// ---------------------------------------------------------------------------

describe('signal-prefer-input-signal', () => {
    it('has correct name and streamType', () => {
        expect(signalPreferInputSignalRule.name).toBe('signal-prefer-input-signal');
        expect(signalPreferInputSignalRule.streamType).toBe('AnyAngularClass');
    });
});

// ---------------------------------------------------------------------------
// signal-prefer-output-function
// ---------------------------------------------------------------------------

describe('signal-prefer-output-function', () => {
    it('has correct name and streamType', () => {
        expect(signalPreferOutputFunctionRule.name).toBe('signal-prefer-output-function');
        expect(signalPreferOutputFunctionRule.streamType).toBe('AnyAngularClass');
    });
});

// ---------------------------------------------------------------------------
// signal-prefer-model
// ---------------------------------------------------------------------------

describe('signal-prefer-model', () => {
    it('has correct name and streamType', () => {
        expect(signalPreferModelRule.name).toBe('signal-prefer-model');
        expect(signalPreferModelRule.streamType).toBe('AnyAngularClass');
    });
});
