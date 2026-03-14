/**
 * Unit Tests — reactivity rules
 *
 * Covered rules:
 *  - rxjs-no-subscribe-in-component
 *  - rxjs-require-take-until-destroyed
 *  - rxjs-avoid-behaviorsubject-for-local-state
 *  - rxjs-avoid-subject-as-event-bus
 *  - rxjs-prefer-to-signal-for-template-state
 *  - signal-avoid-untracked-overuse
 *  - signal-prefer-computed-over-sync-effect
 *  - to-signal-require-initial-value
 */

import { describe, it, expect } from 'vitest';
import { makeContext, findCallExpressions } from './helpers.js';
import { rxjsNoSubscribeInComponentRule } from '../src/rules/reactivity/rxjs-no-subscribe-in-component.rule.js';
import { rxjsRequireTakeUntilDestroyedRule } from '../src/rules/reactivity/rxjs-require-take-until-destroyed.rule.js';
import { rxjsAvoidBehaviorSubjectRule } from '../src/rules/reactivity/rxjs-avoid-behaviorsubject-for-local-state.rule.js';
import { rxjsAvoidSubjectRule } from '../src/rules/reactivity/rxjs-avoid-subject-as-event-bus.rule.js';
import { rxjsPreferToSignalRule } from '../src/rules/reactivity/rxjs-prefer-to-signal-for-template-state.rule.js';
import { signalAvoidUntrackedRule } from '../src/rules/reactivity/signal-avoid-untracked-overuse.rule.js';
import { signalPreferComputedRule } from '../src/rules/reactivity/signal-prefer-computed-over-sync-effect.rule.js';
import { toSignalRequireInitialValueRule } from '../src/rules/reactivity/to-signal-require-initial-value.rule.js';

// ---------------------------------------------------------------------------
// rxjs-no-subscribe-in-component
// ---------------------------------------------------------------------------

describe('rxjs-no-subscribe-in-component', () => {
    it('has correct name and streamType', () => {
        expect(rxjsNoSubscribeInComponentRule.name).toBe('rxjs-no-subscribe-in-component');
        expect(rxjsNoSubscribeInComponentRule.streamType).toBe('CallExpression');
    });

    it('flags a bare .subscribe() call in a .component.ts file', () => {
        const source = `source$.subscribe(() => { this.value = x; });`;
        const ctx = makeContext(source, '/src/app.component.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        expect(calls.length).toBeGreaterThan(0);
        const result = rxjsNoSubscribeInComponentRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('rxjs-no-subscribe-in-component');
    });

    it('does NOT flag subscribe in a non-component file', () => {
        const source = `source$.subscribe(() => {});`;
        const ctx = makeContext(source, '/src/my.service.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const results = calls.map((c) => rxjsNoSubscribeInComponentRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });

    it('does NOT flag subscribe guarded by take(1)', () => {
        const source = `source$.pipe(take(1)).subscribe(() => {});`;
        const ctx = makeContext(source, '/src/app.component.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const result = rxjsNoSubscribeInComponentRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag an HTTP observable source', () => {
        const source = `this.http.get('/api/users').subscribe((users) => { this.users = users; });`;
        const ctx = makeContext(source, '/src/app.component.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const result = rxjsNoSubscribeInComponentRule.handle(calls[0], ctx);
        // HTTP observables auto-complete — should not be flagged
        expect(result).toBeNull();
    });

    it('does NOT flag subscribe when takeUntilDestroyed is present', () => {
        const source = `source$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {});`;
        const ctx = makeContext(source, '/src/app.component.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const result = rxjsNoSubscribeInComponentRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// rxjs-require-take-until-destroyed
// ---------------------------------------------------------------------------

describe('rxjs-require-take-until-destroyed', () => {
    it('has correct name and streamType', () => {
        expect(rxjsRequireTakeUntilDestroyedRule.name).toBe('rxjs-require-takeUntilDestroyed');
        expect(rxjsRequireTakeUntilDestroyedRule.streamType).toBe('CallExpression');
    });
});

// ---------------------------------------------------------------------------
// rxjs-avoid-behaviorsubject-for-local-state
// ---------------------------------------------------------------------------

describe('rxjs-avoid-behaviorsubject-for-local-state', () => {
    it('has correct name and streamType', () => {
        expect(rxjsAvoidBehaviorSubjectRule.name).toBe('rxjs-avoid-behaviorsubject-for-local-state');
        expect(rxjsAvoidBehaviorSubjectRule.streamType).toBe('AnyAngularClass');
    });
});

// ---------------------------------------------------------------------------
// rxjs-avoid-subject-as-event-bus
// ---------------------------------------------------------------------------

describe('rxjs-avoid-subject-as-event-bus', () => {
    it('has correct name and streamType', () => {
        expect(rxjsAvoidSubjectRule.name).toBe('rxjs-avoid-subject-as-event-bus');
        expect(rxjsAvoidSubjectRule.streamType).toBe('AnyAngularClass');
    });
});

// ---------------------------------------------------------------------------
// rxjs-prefer-to-signal-for-template-state
// ---------------------------------------------------------------------------

describe('rxjs-prefer-to-signal-for-template-state', () => {
    it('has correct name and streamType', () => {
        expect(rxjsPreferToSignalRule.name).toBe('rxjs-prefer-toSignal-for-template-state');
        expect(rxjsPreferToSignalRule.streamType).toBe('AnyAngularClass');
    });
});

// ---------------------------------------------------------------------------
// signal-avoid-untracked-overuse
// ---------------------------------------------------------------------------

describe('signal-avoid-untracked-overuse', () => {
    it('has correct name and streamType', () => {
        expect(signalAvoidUntrackedRule.name).toBe('signal-avoid-untracked-overuse');
        expect(signalAvoidUntrackedRule.streamType).toBe('CallExpression');
    });
});

// ---------------------------------------------------------------------------
// signal-prefer-computed-over-sync-effect
// ---------------------------------------------------------------------------

describe('signal-prefer-computed-over-sync-effect', () => {
    it('has correct name and streamType', () => {
        expect(signalPreferComputedRule.name).toBe('signal-prefer-computed-over-sync-effect');
        expect(signalPreferComputedRule.streamType).toBe('CallExpression');
    });
});

// ---------------------------------------------------------------------------
// to-signal-require-initial-value
// ---------------------------------------------------------------------------

describe('to-signal-require-initial-value', () => {
    it('has correct name and streamType', () => {
        expect(toSignalRequireInitialValueRule.name).toBe('toSignal-require-initialValue');
        expect(toSignalRequireInitialValueRule.streamType).toBe('CallExpression');
    });

    it('flags toSignal() called without initialValue', () => {
        const source = `const sig = toSignal(obs$);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'toSignal');
        expect(calls.length).toBeGreaterThan(0);
        const result = toSignalRequireInitialValueRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('toSignal-require-initialValue');
    });

    it('does NOT flag toSignal() with a non-null initialValue option', () => {
        // Note: `null` is considered null/undefined by the rule — use 0 instead
        const source = `const sig = toSignal(obs$, { initialValue: 0 });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'toSignal');
        expect(calls.length).toBeGreaterThan(0);
        const result = toSignalRequireInitialValueRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag other function calls', () => {
        const source = `const x = someFunction(obs$);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'someFunction');
        const results = calls.map((c) => toSignalRequireInitialValueRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });
});
