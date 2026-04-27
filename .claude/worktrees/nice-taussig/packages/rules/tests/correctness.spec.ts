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
import { makeContext, makeAngularClassNode, findCallExpressions } from './helpers.js';
import { rxjsNoNestedSubscribeRule } from '../src/rules/correctness/rxjs-no-nested-subscribe.rule.js';
import { signalNoSideEffectsInComputedRule } from '../src/rules/correctness/signal-no-side-effects-in-computed.rule.js';
import { signalEffectDestroyScopedRule } from '../src/rules/correctness/signal-effect-must-be-destroy-scoped.rule.js';
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

    // Observer-object form — added to close the false-negative gap
    it('flags a nested subscribe inside the observer-object { next } property', () => {
        const source = `
            outer$.subscribe({
                next: () => { inner$.subscribe(() => {}); },
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
    });

    it('does NOT flag a clean observer-object subscribe with no nesting', () => {
        const source = `source$.subscribe({ next: (v) => { handle(v); } });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const results = calls.map((c) => rxjsNoNestedSubscribeRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
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

    it('flags subscribe() side-effect call inside computed()', () => {
        const source = `const c = computed(() => { obs$.subscribe(() => {}); return 1; });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'computed');
        const result = signalNoSideEffectsInComputedRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('does NOT flag console.log() inside computed() — removed from SIDE_EFFECT_METHODS', () => {
        const source = `const c = computed(() => { console.log('trace'); return val(); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'computed');
        const result = signalNoSideEffectsInComputedRule.handle(calls[0], ctx);
        // console.log is no longer in SIDE_EFFECT_METHODS — should not flag
        expect(result).toBeNull();
    });

    it('does NOT flag Set.clear() inside computed() — too generic a method name', () => {
        const source = `const c = computed(() => { seen.clear(); return items(); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'computed');
        const result = signalNoSideEffectsInComputedRule.handle(calls[0], ctx);
        // .clear() removed from SIDE_EFFECT_METHODS — should not flag
        expect(result).toBeNull();
    });

    it('flags an assignment inside computed()', () => {
        const source = `const c = computed(() => { someObj.value = 42; return 1; });`;
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
        expect(signalEffectDestroyScopedRule.name).toBe('signal-effect-must-be-destroy-scoped');
        expect(signalEffectDestroyScopedRule.streamType).toBe('AnyAngularClass');
    });

    it('flags effect() called inside a non-constructor method', () => {
        const source = `
class AppComponent {
    ngOnInit() {
        effect(() => { console.log(this.count()); });
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source);
        const result = signalEffectDestroyScopedRule.handle(classStreamNode, ctx) as any;
        expect(result).not.toBeNull();
        expect(Array.isArray(result) ? result.length : 1).toBeGreaterThan(0);
        const failure = Array.isArray(result) ? result[0] : result;
        expect(failure.ruleName).toBe('signal-effect-must-be-destroy-scoped');
        expect(failure.severity).toBe('error');
        expect(failure.message).toContain('ngOnInit');
    });

    it('does NOT flag effect() called in a non-Angular class', () => {
        // The rule only fires on classes the engine streams as Angular classes;
        // here we test that a class body with no constructor and only field effects
        // in a regular method still gets picked up but effect in constructor is exempt.
        const source = `
class AppComponent {
    constructor() {
        effect(() => { console.log('safe'); });
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source);
        // Constructor effects are handled by a different rule; this rule skips them.
        const result = signalEffectDestroyScopedRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag effect() with { injector } escape hatch in a method', () => {
        const source = `
class AppComponent {
    setup() {
        effect(() => {}, { injector: this.injector });
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source);
        const result = signalEffectDestroyScopedRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag effect() with { manualCleanup: true } in a method', () => {
        const source = `
class AppComponent {
    onStart() {
        effect(() => {}, { manualCleanup: true });
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source);
        const result = signalEffectDestroyScopedRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('flags multiple effect() calls in different methods', () => {
        const source = `
class AppComponent {
    ngOnInit() { effect(() => {}); }
    ngAfterViewInit() { effect(() => {}); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source);
        const result = signalEffectDestroyScopedRule.handle(classStreamNode, ctx) as any;
        expect(Array.isArray(result) ? result.length : 0).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// component-no-manual-detect-changes
// ---------------------------------------------------------------------------

describe('component-no-manual-detect-changes', () => {
    it('has the correct name and streamType', () => {
        expect(componentNoManualDetectChangesRule.name).toBe('component-no-manual-detect-changes');
        expect(componentNoManualDetectChangesRule.streamType).toBe('AnyAngularClass');
    });

    it('flags this.cdr.detectChanges() in a component file', () => {
        const source = `
import { ChangeDetectorRef, Component } from '@angular/core';
@Component({ selector: 'app-root', template: '' })
class AppComponent {
    constructor(private cdr: ChangeDetectorRef) {}
    update() { this.cdr.detectChanges(); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/unit-detect-changes-a.component.ts');
        const results = componentNoManualDetectChangesRule.handle(classStreamNode, ctx) as any[];
        expect(results).not.toBeNull();
        expect(results.length).toBe(1);
        expect(results[0].ruleName).toBe('component-no-manual-detect-changes');
    });

    it('does NOT flag unrelated method calls in a component', () => {
        const source = `
import { Component } from '@angular/core';
@Component({ template: '' })
class AppComponent {
    update() { this.someService.doWork(); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/unit-unrelated-b.component.ts');
        const results = componentNoManualDetectChangesRule.handle(classStreamNode, ctx);
        expect(results).toBeNull();
    });

    it('does NOT flag detectChanges() in a non-component class', () => {
        const source = `
class SomeService {
    update() { this.cdr.detectChanges(); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/some.service.ts');
        const results = componentNoManualDetectChangesRule.handle(classStreamNode, ctx);
        expect(results).toBeNull();
    });

    it('does NOT flag markForCheck() when component uses OnPush', () => {
        const source = `
import { ChangeDetectionStrategy, Component, ChangeDetectorRef } from '@angular/core';
@Component({
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush
})
class AppComponent {
    constructor(private cdr: ChangeDetectorRef) {}
    update() { this.cdr.markForCheck(); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/unit-onpush-c.component.ts');
        const results = componentNoManualDetectChangesRule.handle(classStreamNode, ctx);
        expect(results).toBeNull();
    });

    it('downgrades detectChanges() to warn when component uses OnPush', () => {
        const source = `
import { ChangeDetectionStrategy, Component, ChangeDetectorRef } from '@angular/core';
@Component({
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush
})
class AppComponent {
    constructor(private cdr: ChangeDetectorRef) {}
    update() { this.cdr.detectChanges(); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(source, '/src/unit-onpush-detect-d.component.ts');
        const results = componentNoManualDetectChangesRule.handle(classStreamNode, ctx) as any[];
        expect(results).not.toBeNull();
        expect(results[0].severity).toBe('warn');
    });
});
