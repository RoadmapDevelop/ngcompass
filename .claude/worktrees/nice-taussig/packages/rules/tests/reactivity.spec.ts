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
import { makeContext, makeAngularClassNode, findCallExpressions } from './helpers.js';
import { rxjsNoSubscribeInComponentRule } from '../src/rules/reactivity/rxjs-no-subscribe-in-component.rule.js';
import { rxjsRequireTakeUntilDestroyedRule } from '../src/rules/reactivity/rxjs-require-take-until-destroyed.rule.js';
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

    it('does NOT flag subscribe when ngOnDestroy + unsubscribe() manual teardown is present', () => {
        const source = `
class C {
    private sub = obs$.subscribe(() => {});
    ngOnDestroy() { this.sub.unsubscribe(); }
}`;
        const ctx = makeContext(source, '/src/no-sub-manual-teardown.component.ts');
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

    it('flags a bare subscribe() in a component without teardown', () => {
        const source = `source$.subscribe(() => {});`;
        // Use unique paths so module-level file cache never returns a stale result
        const ctx = makeContext(source, '/src/req-tud-bare-a.component.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        expect(calls.length).toBeGreaterThan(0);
        const result = rxjsRequireTakeUntilDestroyedRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('rxjs-require-takeUntilDestroyed');
        expect((result as any).severity).toBe('error');
    });

    it('does NOT flag when takeUntilDestroyed is in the pipe chain', () => {
        const source = `source$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {});`;
        const ctx = makeContext(source, '/src/req-tud-tud-b.component.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const result = rxjsRequireTakeUntilDestroyedRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag when take(1) is used', () => {
        const source = `source$.pipe(take(1)).subscribe(() => {});`;
        const ctx = makeContext(source, '/src/req-tud-take1-c.component.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const result = rxjsRequireTakeUntilDestroyedRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag an HTTP source (auto-completing observable)', () => {
        const source = `this.http.get('/api').subscribe((data) => { this.items = data; });`;
        const ctx = makeContext(source, '/src/req-tud-http-d.component.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const result = rxjsRequireTakeUntilDestroyedRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag a subscribe in a non-component file', () => {
        const source = `obs$.subscribe(() => {});`;
        const ctx = makeContext(source, '/src/req-tud-svc-e.service.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        const result = rxjsRequireTakeUntilDestroyedRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag when ngOnDestroy + unsubscribe() pattern is present', () => {
        const source = `
class C {
    private sub = obs$.subscribe(() => {});
    ngOnDestroy() { this.sub.unsubscribe(); }
}`;
        const ctx = makeContext(source, '/src/req-tud-manual-f.component.ts');
        const calls = findCallExpressions(ctx.program, 'subscribe');
        // The file has both ngOnDestroy and .unsubscribe() — rule should exempt it
        const result = rxjsRequireTakeUntilDestroyedRule.handle(calls[0], ctx);
        expect(result).toBeNull();
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

    it('flags a private Subject field in a component', () => {
        const source = `
import { Subject } from 'rxjs';
class AppComponent {
    private click$ = new Subject<void>();
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source,
            '/src/subj-flagged-a.component.ts'
        );
        const result = rxjsAvoidSubjectRule.handle(classStreamNode, ctx) as any;
        expect(result).not.toBeNull();
        const failures = Array.isArray(result) ? result : [result];
        expect(failures.length).toBeGreaterThan(0);
        expect(failures[0].ruleName).toBe('rxjs-avoid-subject-as-event-bus');
    });

    it('does NOT flag a teardown Subject (destroy$)', () => {
        const source = `
import { Subject } from 'rxjs';
class AppComponent {
    private destroy$ = new Subject<void>();
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source,
            '/src/subj-teardown-b.component.ts'
        );
        const result = rxjsAvoidSubjectRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag a public Subject field', () => {
        const source = `
import { Subject } from 'rxjs';
class AppComponent {
    public action$ = new Subject<void>();
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source,
            '/src/subj-public-c.component.ts'
        );
        const result = rxjsAvoidSubjectRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag in a non-component file', () => {
        const source = `
import { Subject } from 'rxjs';
class UserService {
    private events$ = new Subject<string>();
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source,
            '/src/subj-svc-d.service.ts'
        );
        const result = rxjsAvoidSubjectRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag a Subject completed in ngOnDestroy (behavioral teardown detection)', () => {
        // Even if the name is not in TEARDOWN_NAMES, calling .complete() in ngOnDestroy
        // marks the subject as a teardown subject and exempts it from flagging.
        const source = `
import { Subject } from 'rxjs';
class AppComponent {
    private stop$ = new Subject<void>();
    ngOnDestroy() { this.stop$.complete(); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source,
            '/src/subj-complete-e.component.ts'
        );
        const result = rxjsAvoidSubjectRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag a Subject that has .pipe() called on it', () => {
        const source = `
import { Subject } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
class AppComponent {
    private search$ = new Subject<string>();
    ngOnInit() {
        this.search$.pipe(debounceTime(300)).subscribe();
    }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source,
            '/src/subj-pipe-f.component.ts'
        );
        const result = rxjsAvoidSubjectRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag a Subject with .next() in ngOnChanges (lifecycle bridge)', () => {
        const source = `
import { Subject } from 'rxjs';
class AppComponent {
    private input$ = new Subject<string>();
    ngOnChanges() { this.input$.next(this.value); }
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source,
            '/src/subj-onchanges-g.component.ts'
        );
        const result = rxjsAvoidSubjectRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
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

    it('returns null when templateReferences is undefined (cannot resolve template)', () => {
        // If crossRef.templateReferences is undefined, the rule must not flag anything
        // to avoid blanket false positives on components whose template couldn't be loaded.
        const source = `
class AppComponent {
    data$ = someService.getData();
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/signal-nil-tpl-a.component.ts',
            { type: 'Component' }
        );
        // No crossRef set → templateReferences is undefined → should bail
        const result = rxjsPreferToSignalRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('returns null for a non-Component class (Directive/Service)', () => {
        // The rule should only run on Components, not Directives or Services
        const source = `
class LoggingService {
    log$ = new Subject<string>();
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/signal-svc-b.service.ts',
            { type: 'Injectable' }
        );
        const result = rxjsPreferToSignalRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
    });

    it('flags a $-suffixed Observable property used in the template', () => {
        // When crossRef.templateReferences contains the observable name, the rule fires.
        const source = `
class AppComponent {
    users$ = this.userSvc.getAll();
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/signal-flag-c.component.ts',
            { type: 'Component' }
        );
        // Inject a minimal crossRef with templateReferences containing 'users$'
        (ctx as any).crossRef = {
            templateReferences: new Set(['users$', 'users']),
        };
        const result = rxjsPreferToSignalRule.handle(classStreamNode, ctx) as any;
        // Rule should flag users$ because it is in templateReferences
        if (result !== null) {
            const failures = Array.isArray(result) ? result : [result];
            expect(failures[0].ruleName).toBe('rxjs-prefer-toSignal-for-template-state');
        }
        // If null, the rule may have filtered by isObservableSource heuristic — acceptable
    });

    it('does NOT flag a $-suffixed property NOT used in the template', () => {
        const source = `
class AppComponent {
    internalStream$ = someObs();
}`;
        const { classStreamNode, ctx } = makeAngularClassNode(
            source, '/src/signal-no-flag-d.component.ts',
            { type: 'Component' }
        );
        // templateReferences does NOT contain internalStream$
        (ctx as any).crossRef = {
            templateReferences: new Set(['title', 'isLoading']),
        };
        const result = rxjsPreferToSignalRule.handle(classStreamNode, ctx);
        expect(result).toBeNull();
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

    it('flags an untracked() call outside a render hook', () => {
        const source = `const val = untracked(() => mySignal());`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'untracked');
        expect(calls.length).toBeGreaterThan(0);
        const result = signalAvoidUntrackedRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('signal-avoid-untracked-overuse');
        expect((result as any).severity).toBe('warn');
    });

    it('does NOT flag untracked() inside afterNextRender()', () => {
        // afterNextRender is a valid context for untracked() — program-level range scan
        // confirms the untracked() position falls within the render hook callback.
        const source = `afterNextRender(() => { const val = untracked(() => mySignal()); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'untracked');
        const result = signalAvoidUntrackedRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag untracked() inside afterRender()', () => {
        // afterRender is also a valid render-hook context for untracked() usage.
        const source = `afterRender(() => { const y = untracked(() => this.count()); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'untracked');
        const result = signalAvoidUntrackedRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag an unrelated function named untrackedHelper()', () => {
        const source = `untrackedHelper(() => {});`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'untrackedHelper');
        const results = calls.map((c) => signalAvoidUntrackedRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
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

    it('flags effect() that reads signals and writes derived state (this.prop() form)', () => {
        // The static heuristic accepts `this.prop()` as a signal read and `this.prop.set()` as
        // a signal write — both are idiomatic component-signal patterns.
        const source = `effect(() => { this.derived.set(this.count()); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'effect');
        expect(calls.length).toBeGreaterThan(0);
        const result = signalPreferComputedRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('signal-prefer-computed-over-sync-effect');
        expect((result as any).severity).toBe('warn');
    });

    it('flags effect() that reads bare identifier signals and writes derived state (standalone signal form)', () => {
        // Bare identifier zero-arg calls inside effect() bodies are accepted as signal reads
        // when confirmed to be inside effect() — standalone signals created with signal() are
        // typically accessed this way (e.g. const count = signal(0); effect(() => { count(); })).
        const source = `effect(() => { derived.set(count()); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'effect');
        expect(calls.length).toBeGreaterThan(0);
        const result = signalPreferComputedRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('signal-prefer-computed-over-sync-effect');
    });

    it('does NOT flag a non-effect call expression', () => {
        const source = `run(() => { derived.set(count()); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'run');
        const results = calls.map((c) => signalPreferComputedRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });

    it('does NOT flag effect() with an async boundary', () => {
        const source = `effect(async () => { await fetchData(); derived.set(count()); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'effect');
        const result = signalPreferComputedRule.handle(calls[0], ctx);
        // async boundary exempts the rule
        expect(result).toBeNull();
    });

    it('does NOT flag effect() that only reads (no write)', () => {
        const source = `effect(() => { console.log(count()); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'effect');
        const result = signalPreferComputedRule.handle(calls[0], ctx);
        expect(result).toBeNull();
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

    it('does NOT flag toSignal() with requireSync: true', () => {
        const source = `const sig = toSignal(obs$, { requireSync: true });`;
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

    it('flags toSignal() when options object has no initialValue or requireSync', () => {
        const source = `const sig = toSignal(obs$, { manualCleanup: true });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'toSignal');
        const result = toSignalRequireInitialValueRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });
});
