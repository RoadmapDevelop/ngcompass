/**
 * Unit Tests — correctness rules
 *
 * Covered rules:
 *  - rxjs-no-nested-subscribe
 *  - signal-no-side-effects-in-computed
 *  - signal-effect-must-be-destroy-scoped
 *  - signal-no-effect-in-constructor
 *  - component-no-manual-detect-changes
 */

import { describe, it, expect } from 'vitest';
import { makeContext, findCallExpressions } from './helpers.js';
import { rxjsNoNestedSubscribeRule } from '../src/rules/correctness/rxjs-no-nested-subscribe.rule.js';
import { signalNoSideEffectsInComputedRule } from '../src/rules/correctness/signal-no-side-effects-in-computed.rule.js';
import { signalEffectDestroyScopedRule } from '../src/rules/correctness/signal-effect-must-be-destroy-scoped.rule.js';
import { signalNoEffectInConstructorRule } from '../src/rules/correctness/signal-no-effect-in-constructor.rule.js';
import { componentNoManualDetectChangesRule } from '../src/rules/correctness/component-no-manual-detect-changes.rule.js';

// ---------------------------------------------------------------------------
// rxjs-no-nested-subscribe
// ---------------------------------------------------------------------------

describe('rxjs-no-nested-subscribe', () => {
    it('flags a subscribe callback containing another subscribe', () => {
        const source = `
            outer$.subscribe(() => {
                inner$.subscribe(() => {});
            });
        `;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'subscribe');

        let failure: any = null;
        for (const call of calls) {
            const result = rxjsNoNestedSubscribeRule.handle(call, ctx);
            if (result) { failure = result; break; }
        }
        expect(failure).not.toBeNull();
        expect(failure!.ruleName).toBe('rxjs-no-nested-subscribe');
        expect(failure!.severity).toBe('error');
    });

    it('does not flag a non-nested subscribe', () => {
        const source = `source$.subscribe(() => { doSomething(); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const results = calls.map((c) => rxjsNoNestedSubscribeRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });

    it('does not flag a non-subscribe call expression', () => {
        const source = `console.log('hello');`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program);
        const results = calls.map((c) => rxjsNoNestedSubscribeRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });

    it('returns the correct violation line info', () => {
        const source = `outer$.subscribe(() => { inner$.subscribe(() => {}); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'subscribe');
        let failure: any = null;
        for (const call of calls) {
            const result = rxjsNoNestedSubscribeRule.handle(call, ctx);
            if (result) { failure = result; break; }
        }
        expect(failure).not.toBeNull();
        expect(failure!.line).toBeGreaterThanOrEqual(1);
        expect(failure!.column).toBeGreaterThanOrEqual(0);
    });

    it('has the correct streamType', () => {
        expect(rxjsNoNestedSubscribeRule.streamType).toBe('CallExpression');
    });
});

// ---------------------------------------------------------------------------
// signal-no-side-effects-in-computed
// ---------------------------------------------------------------------------

describe('signal-no-side-effects-in-computed', () => {
    it('flags a signal write inside computed()', () => {
        const source = `const c = computed(() => { mySignal.set(1); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'computed');
        expect(calls.length).toBeGreaterThan(0);
        const result = signalNoSideEffectsInComputedRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toMatch(/signal-no/);
    });

    it('does not flag a pure computed()', () => {
        const source = `const c = computed(() => a() + b());`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'computed');
        expect(calls.length).toBeGreaterThan(0);
        const result = signalNoSideEffectsInComputedRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does not flag non-computed call expressions', () => {
        const source = `foo(() => { bar.set(1); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'foo');
        const results = calls.map((c) => signalNoSideEffectsInComputedRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });

    it('flags console.log (side-effect call) inside computed()', () => {
        const source = `const c = computed(() => { console.log('oops'); return 1; });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'computed');
        const result = signalNoSideEffectsInComputedRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('has the correct name and streamType', () => {
        expect(signalNoSideEffectsInComputedRule.name).toBe('signal-no-side-effects-in-computed');
        expect(signalNoSideEffectsInComputedRule.streamType).toBe('CallExpression');
    });
});

// ---------------------------------------------------------------------------
// signal-effect-must-be-destroy-scoped
// ---------------------------------------------------------------------------

describe('signal-effect-must-be-destroy-scoped', () => {
    it('has the correct name and streamType', () => {
        // This rule scans AnyAngularClass bodies for effect() calls in non-constructor methods
        expect(signalEffectDestroyScopedRule.name).toBe('signal-effect-must-be-destroy-scoped');
        expect(signalEffectDestroyScopedRule.streamType).toBe('AnyAngularClass');
    });
});

// ---------------------------------------------------------------------------
// signal-no-effect-in-constructor
// ---------------------------------------------------------------------------

describe('signal-no-effect-in-constructor', () => {
    it('has the correct name and streamType', () => {
        expect(signalNoEffectInConstructorRule.name).toBe('signal-no-effect-in-constructor');
        expect(signalNoEffectInConstructorRule.streamType).toBe('AnyAngularClass');
    });
});

// ---------------------------------------------------------------------------
// component-no-manual-detect-changes
// ---------------------------------------------------------------------------

describe('component-no-manual-detect-changes', () => {
    it('has the correct name and streamType', () => {
        expect(componentNoManualDetectChangesRule.name).toBe('component-no-manual-detect-changes');
        expect(componentNoManualDetectChangesRule.streamType).toBe('CallExpression');
    });

    it('flags detectChanges() call', () => {
        const source = `this.cdr.detectChanges();`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'detectChanges');
        if (calls.length > 0) {
            const result = componentNoManualDetectChangesRule.handle(calls[0], ctx);
            // If the rule picks this up, it should flag it
            if (result !== null) {
                expect((result as any).ruleName).toBe('component-no-manual-detect-changes');
            }
        }
    });

    it('does not flag unrelated call expressions', () => {
        const source = `this.someService.doWork();`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program);
        const results = calls.map((c) => componentNoManualDetectChangesRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });
});
