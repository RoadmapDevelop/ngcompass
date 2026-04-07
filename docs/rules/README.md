# NgCompass Rules — Documentation Index

> Complete reference for all 27 static analysis rules. Each rule links to its own detailed page with rationale, code examples, and exemption guide.

---

## Categories at a Glance

| Category | Rules | Purpose |
|---|---|---|
| [Correctness](#correctness) | 4 | Prevent bugs and incorrect Angular patterns |
| [Modern API](#modern-api) | 4 | Migrate to Angular 17+ APIs |
| [Performance](#performance) | 5 | Eliminate avoidable re-renders and allocations |
| [Reactivity](#reactivity) | 7 | Safe, leak-free signal and RxJS usage |
| [Security](#security) | 2 | Prevent XSS and sanitization bypasses |
| [SSR](#ssr) | 2 | Angular Universal / server-side rendering safety |
| [Template](#template) | 2 | Template quality and correctness |
| [Testing](#testing) | 1 | Keep the CI test suite reliable |

---

## Severity Reference

| Badge | Meaning |
|---|---|
| `error` | Blocks CI; must be fixed before merging |
| `warn` | Advisory; should be addressed but won't block |

---

## Correctness

Rules that catch outright bugs or patterns that silently break Angular's reactivity model.

| Rule | Severity | Description |
|---|---|---|
| [component-no-manual-detect-changes](./correctness/component-no-manual-detect-changes.md) | `error` | Ban `detectChanges()` / `markForCheck()` |
| [rxjs-no-nested-subscribe](./correctness/rxjs-no-nested-subscribe.md) | `error` | Forbid `.subscribe()` inside `.subscribe()` |
| [signal-effect-must-be-destroy-scoped](./correctness/signal-effect-must-be-destroy-scoped.md) | `error` | Ensure `effect()` has cleanup ownership |
| [signal-no-side-effects-in-computed](./correctness/signal-no-side-effects-in-computed.md) | `error` | Keep `computed()` pure — no side effects |

---

## Modern API

Rules that guide migration from legacy Angular patterns to the Angular 17+ API surface.

| Rule | Severity | Description |
|---|---|---|
| [prefer-inject-over-constructor-di](./modern-api/prefer-inject-over-constructor-di.md) | `warn` | Prefer `inject()` over constructor parameters |
| [signal-prefer-input-signal](./modern-api/signal-prefer-input-signal.md) | `error` / `warn` | Replace `@Input()` with `input()` signal |
| [signal-prefer-model](./modern-api/signal-prefer-model.md) | `warn` | Replace Input+Output pairs with `model()` |
| [signal-prefer-output-function](./modern-api/signal-prefer-output-function.md) | `warn` | Replace `@Output() EventEmitter` with `output()` |

---

## Performance

Rules that eliminate unnecessary re-renders, allocations, and change-detection pressure.

| Rule | Severity | Description |
|---|---|---|
| [prefer-on-push-component-change-detection](./performance/prefer-on-push-component-change-detection.md) | `error` | Require `ChangeDetectionStrategy.OnPush` |
| [template-no-array-literal-binding](./performance/template-no-array-literal-binding.md) | `warn` | Forbid array literals in template bindings |
| [template-no-call-expression](./performance/template-no-call-expression.md) | `error` | Forbid function calls in template expressions |
| [template-no-object-literal-binding](./performance/template-no-object-literal-binding.md) | `warn` | Forbid object literals in template bindings |
| [template-trackby-required](./performance/template-trackby-required.md) | `error` | Require `trackBy` / `track` on list directives |

---

## Reactivity

Rules for correct, leak-free usage of Signals and RxJS in Angular components.

| Rule | Severity | Description |
|---|---|---|
| [rxjs-avoid-subject-as-event-bus](./reactivity/rxjs-avoid-subject-as-event-bus.md) | `warn` | Avoid Subject as local event bus or state |
| [rxjs-no-subscribe-in-component](./reactivity/rxjs-no-subscribe-in-component.md) | `error` | Prevent unmanaged subscriptions |
| [rxjs-prefer-to-signal-for-template-state](./reactivity/rxjs-prefer-to-signal-for-template-state.md) | `warn` | Use `toSignal()` for template-bound observables |
| [rxjs-require-take-until-destroyed](./reactivity/rxjs-require-take-until-destroyed.md) | `error` | Require teardown on long-lived subscriptions |
| [signal-avoid-untracked-overuse](./reactivity/signal-avoid-untracked-overuse.md) | `warn` | Use `untracked()` sparingly |
| [signal-prefer-computed-over-sync-effect](./reactivity/signal-prefer-computed-over-sync-effect.md) | `warn` | Replace sync `effect()` derivations with `computed()` |
| [to-signal-require-initial-value](./reactivity/to-signal-require-initial-value.md) | `warn` | Require `initialValue` on `toSignal()` |

---

## Security

Rules that prevent XSS vulnerabilities and sanitization bypasses.

| Rule | Severity | Description |
|---|---|---|
| [no-bypass-sanitization](./security/no-bypass-sanitization.md) | `error` | Forbid `bypassSecurityTrust*` calls |
| [template-no-unsafe-bindings](./security/template-no-unsafe-bindings.md) | `error` / `warn` | Prevent unsafe `[innerHTML]`, `[outerHTML]`, `[srcdoc]`, `[style]` bindings |

---

## SSR

Rules that ensure Angular components are safe for server-side rendering (Angular Universal).

| Rule | Severity | Description |
|---|---|---|
| [no-document-access](./ssr/no-document-access.md) | `error` | Prevent direct browser global access |
| [prefer-after-render-over-after-view-init](./ssr/prefer-after-render-over-after-view-init.md) | `warn` | Move DOM code out of `ngAfterViewInit` |

---

## Template

Rules for template quality, correctness, and modern syntax.

| Rule | Severity | Description |
|---|---|---|
| [template-no-async-pipe-duplication](./template/template-no-async-pipe-duplication.md) | `warn` | Prevent duplicate `async` pipe subscriptions |
| [template-prefer-control-flow](./template/template-prefer-control-flow.md) | `error` | Replace `*ngIf`/`*ngFor`/`*ngSwitch` with `@if`/`@for`/`@switch` |

---

## Testing

Rules for test suite reliability and CI hygiene.

| Rule | Severity | Description |
|---|---|---|
| [spec-no-focused-test](./testing/spec-no-focused-test.md) | `error` | Forbid focused/disabled test helpers |

---

## Rule Count by Severity

```
error  ██████████████████  18 rules
warn   █████████           9 rules
```
