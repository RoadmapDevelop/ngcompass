import { afterEach, describe, it, expect } from 'vitest';
import {
  makeContext,
  makeAngularClassNode,
  makeTypeAwareContext,
  makeTypeAwareAngularClassFixture,
  findCallExpressions,
  type TypeAwareFixture,
} from './helpers.js';
import { rxjsNoNestedSubscribeRule } from '../src/rules/correctness/rxjs-no-nested-subscribe.rule.js';
import { signalNoSideEffectsInComputedRule } from '../src/rules/correctness/signal-no-side-effects-in-computed.rule.js';
import { signalEffectDestroyScopedRule } from '../src/rules/correctness/signal-effect-must-be-destroy-scoped.rule.js';
import { componentNoManualDetectChangesRule } from '../src/rules/correctness/component-no-manual-detect-changes.rule.js';

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
      if (result) {
        failure = result;
        break;
      }
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
      if (result) {
        failure = result;
        break;
      }
    }
    expect(failure).not.toBeNull();
    expect(failure!.line).toBeGreaterThanOrEqual(1);
    expect(failure!.column).toBeGreaterThanOrEqual(0);
  });

  it('has the correct streamType', () => {
    expect(rxjsNoNestedSubscribeRule.streamType).toBe('CallExpression');
  });

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
      if (result) {
        failure = result;
        break;
      }
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

describe('signal-no-side-effects-in-computed', () => {
  let fixture: TypeAwareFixture | undefined;
  afterEach(() => {
    fixture?.dispose();
    fixture = undefined;
  });

  const computedCall = (fx: TypeAwareFixture) =>
    findCallExpressions(fx.oxcProgram, 'computed')[0];

  it('flags a WritableSignal.set inside computed()', () => {
    const source = `
import { computed, WritableSignal } from '@angular/core';
declare const mySignal: WritableSignal<number>;
const c = computed(() => { mySignal.set(1); return 0; });`;
    fixture = makeTypeAwareContext(source);
    const result = signalNoSideEffectsInComputedRule.handle(
      computedCall(fixture),
      fixture.ctx
    );
    expect(result).not.toBeNull();
    expect((result as any).ruleName).toBe('signal-no-side-effects-in-computed');
    expect((result as any).message).toMatch(/write/);
  });

  it('does NOT flag Map.set inside computed() — receiver is not a WritableSignal', () => {
    const source = `
import { computed } from '@angular/core';
declare const seen: Map<string, number>;
const c = computed(() => { seen.set('a', 1); return 0; });`;
    fixture = makeTypeAwareContext(source);
    const result = signalNoSideEffectsInComputedRule.handle(
      computedCall(fixture),
      fixture.ctx
    );
    expect(result).toBeNull();
  });

  it('does not flag a pure computed()', () => {
    const source = `
import { computed, Signal } from '@angular/core';
declare const a: Signal<number>;
declare const b: Signal<number>;
const c = computed(() => a() + b());`;
    fixture = makeTypeAwareContext(source);
    const result = signalNoSideEffectsInComputedRule.handle(
      computedCall(fixture),
      fixture.ctx
    );
    expect(result).toBeNull();
  });

  it('does not flag non-computed call expressions', () => {
    const source = `foo(() => { bar.set(1); });`;
    const ctx = makeContext(source);
    const calls = findCallExpressions(ctx.program, 'foo');
    const results = calls.map((c) =>
      signalNoSideEffectsInComputedRule.handle(c, ctx)
    );
    expect(results.every((r) => r === null)).toBe(true);
  });

  it('flags Subject.next() inside computed()', () => {
    const source = `
import { computed } from '@angular/core';
import { Subject } from 'rxjs';
declare const events: Subject<number>;
const c = computed(() => { events.next(1); return 0; });`;
    fixture = makeTypeAwareContext(source);
    const result = signalNoSideEffectsInComputedRule.handle(
      computedCall(fixture),
      fixture.ctx
    );
    expect(result).not.toBeNull();
    expect((result as any).message).toMatch(/side effect/);
  });

  it('flags an HttpClient call inside computed()', () => {
    const source = `
import { computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
declare const http: HttpClient;
const c = computed(() => { http.get('/x'); return 0; });`;
    fixture = makeTypeAwareContext(source);
    const result = signalNoSideEffectsInComputedRule.handle(
      computedCall(fixture),
      fixture.ctx
    );
    expect(result).not.toBeNull();
    expect((result as any).message).toMatch(/side effect/);
  });

  it('does NOT flag console.log() inside computed() — receiver is not Angular/RxJS/HttpClient', () => {
    const source = `const c = computed(() => { console.log('trace'); return 0; });`;
    const ctx = makeContext(source);
    const calls = findCallExpressions(ctx.program, 'computed');
    const result = signalNoSideEffectsInComputedRule.handle(calls[0], ctx);
    expect(result).toBeNull();
  });

  it('does NOT flag Set.clear() inside computed() — receiver is not a tracked type', () => {
    const source = `const c = computed(() => { seen.clear(); return items(); });`;
    const ctx = makeContext(source);
    const calls = findCallExpressions(ctx.program, 'computed');
    const result = signalNoSideEffectsInComputedRule.handle(calls[0], ctx);

    expect(result).toBeNull();
  });

  it('flags an assignment to a property target inside computed()', () => {
    const source = `
import { computed } from '@angular/core';
declare const someObj: { value: number };
const c = computed(() => { someObj.value = 42; return 1; });`;
    fixture = makeTypeAwareContext(source);
    const result = signalNoSideEffectsInComputedRule.handle(
      computedCall(fixture),
      fixture.ctx
    );
    expect(result).not.toBeNull();
    expect((result as any).message).toMatch(/write/);
  });

  it('has the correct name and streamType', () => {
    expect(signalNoSideEffectsInComputedRule.name).toBe(
      'signal-no-side-effects-in-computed'
    );
    expect(signalNoSideEffectsInComputedRule.streamType).toBe('CallExpression');
  });
});

describe('signal-effect-must-be-destroy-scoped', () => {
  it('has the correct name and streamType', () => {
    expect(signalEffectDestroyScopedRule.name).toBe(
      'signal-effect-must-be-destroy-scoped'
    );
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
    const result = signalEffectDestroyScopedRule.handle(
      classStreamNode,
      ctx
    ) as any;
    expect(result).not.toBeNull();
    expect(Array.isArray(result) ? result.length : 1).toBeGreaterThan(0);
    const failure = Array.isArray(result) ? result[0] : result;
    expect(failure.ruleName).toBe('signal-effect-must-be-destroy-scoped');
    expect(failure.severity).toBe('error');
    expect(failure.message).toContain('ngOnInit');
  });

  it('does NOT flag effect() called in a non-Angular class', () => {
    const source = `
class AppComponent {
    constructor() {
        effect(() => { console.log('safe'); });
    }
}`;
    const { classStreamNode, ctx } = makeAngularClassNode(source);

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
    const result = signalEffectDestroyScopedRule.handle(
      classStreamNode,
      ctx
    ) as any;
    expect(Array.isArray(result) ? result.length : 0).toBe(2);
  });
});

describe('component-no-manual-detect-changes', () => {
  it('has the correct name and streamType', () => {
    expect(componentNoManualDetectChangesRule.name).toBe(
      'component-no-manual-detect-changes'
    );
    expect(componentNoManualDetectChangesRule.streamType).toBe(
      'AnyAngularClass'
    );
  });

  it('flags this.cdr.detectChanges() in a component', () => {
    const fx = makeTypeAwareAngularClassFixture(`
            import { ChangeDetectorRef, Component } from '@angular/core';
            @Component({ selector: 'app-root', template: '' })
            class AppComponent {
                constructor(private cdr: ChangeDetectorRef) {}
                update() { this.cdr.detectChanges(); }
            }
        `);
    try {
      const results = componentNoManualDetectChangesRule.handle(
        fx.classStreamNode,
        fx.ctx
      ) as any[];
      expect(results).not.toBeNull();
      expect(results.length).toBe(1);
      expect(results[0].ruleName).toBe('component-no-manual-detect-changes');
    } finally {
      fx.dispose();
    }
  });

  it('does NOT flag a user method named detectChanges on a non-ChangeDetectorRef receiver', () => {
    const fx = makeTypeAwareAngularClassFixture(`
            import { Component } from '@angular/core';
            class CustomDirty { detectChanges() {} }
            @Component({ selector: 'app-root', template: '' })
            class AppComponent {
                custom = new CustomDirty();
                update() { this.custom.detectChanges(); }
            }
        `);
    try {
      const results = componentNoManualDetectChangesRule.handle(
        fx.classStreamNode,
        fx.ctx
      );
      expect(results).toBeNull();
    } finally {
      fx.dispose();
    }
  });

  it('does NOT flag unrelated method calls in a component', () => {
    const source = `
import { Component } from '@angular/core';
@Component({ template: '' })
class AppComponent {
    update() { this.someService.doWork(); }
}`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/unit-unrelated-b.component.ts'
    );
    const results = componentNoManualDetectChangesRule.handle(
      classStreamNode,
      ctx
    );
    expect(results).toBeNull();
  });

  it('does NOT flag detectChanges() in a non-component class', () => {
    const source = `
class SomeService {
    update() { this.cdr.detectChanges(); }
}`;
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/some.service.ts'
    );
    const results = componentNoManualDetectChangesRule.handle(
      classStreamNode,
      ctx
    );
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
    const { classStreamNode, ctx } = makeAngularClassNode(
      source,
      '/src/unit-onpush-c.component.ts'
    );
    const results = componentNoManualDetectChangesRule.handle(
      classStreamNode,
      ctx
    );
    expect(results).toBeNull();
  });

  it('downgrades detectChanges() to warn when component uses OnPush', () => {
    const fx = makeTypeAwareAngularClassFixture(`
            import { ChangeDetectionStrategy, Component, ChangeDetectorRef } from '@angular/core';
            @Component({
                template: '',
                changeDetection: ChangeDetectionStrategy.OnPush
            })
            class AppComponent {
                constructor(private cdr: ChangeDetectorRef) {}
                update() { this.cdr.detectChanges(); }
            }
        `);
    try {
      const results = componentNoManualDetectChangesRule.handle(
        fx.classStreamNode,
        fx.ctx
      ) as any[];
      expect(results).not.toBeNull();
      expect(results[0].severity).toBe('warn');
    } finally {
      fx.dispose();
    }
  });
});
