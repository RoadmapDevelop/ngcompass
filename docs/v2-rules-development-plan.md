# ngcompass v2 — Rules Development Plan

> **Phase objective:** Expand from the 29-rule v1 foundation to a comprehensive 60+ rule linter that
> covers every critical area of production Angular development. By the end of v2, ngcompass should be
> the obvious default linter for any serious Angular team.

---

## Current State (v1 baseline — 29 rules)

| Category | Rules | Count |
|----------|-------|-------|
| `correctness` | `component-no-manual-detect-changes`, `rxjs-no-nested-subscribe`, `signal-effect-must-be-destroy-scoped`, `signal-no-effect-in-constructor`, `signal-no-side-effects-in-computed` | 5 |
| `performance` | `prefer-on-push`, `template-no-call-expression`, `template-trackby-required`, `template-no-object-literal-binding`, `template-no-array-literal-binding` | 5 |
| `security` | `no-bypass-sanitization`, `template-no-unsafe-bindings` | 2 |
| `ssr` | `no-document-access`, `prefer-after-render-over-after-view-init` | 2 |
| `reactivity` | `rxjs-no-subscribe-in-component`, `rxjs-require-take-until-destroyed`, `rxjs-avoid-behaviorsubject-for-local-state`, `rxjs-avoid-subject-as-event-bus`, `rxjs-prefer-to-signal-for-template-state`, `to-signal-require-initial-value`, `signal-prefer-computed-over-sync-effect`, `signal-avoid-untracked-overuse` | 8 |
| `modern-api` | `prefer-inject`, `signal-prefer-input-signal`, `signal-prefer-output-function`, `signal-prefer-model` | 4 |
| `template` | `template-prefer-control-flow`, `template-no-async-pipe-duplication` | 2 |
| `testing` | `spec-no-focused-test` | 1 |

**Total: 29 rules**

---

## v2 New Rules by Category

### `correctness/` — Bugs, Memory Leaks, Lifecycle Violations

| Rule | Severity | What it catches |
|------|----------|----------------|
| `no-lifecycle-in-arrow-function` | `error` | `const ngOnInit = () => {}` — arrow functions break Angular's lifecycle hook dispatch because the runtime looks for a named method on the prototype |
| `component-must-call-super-lifecycle` | `error` | Extending a base class without calling `super.ngOnDestroy()` silently skips all teardown logic in the parent |
| `signal-read-inside-subscribe` | `warn` | Reading a `signal()` inside `.subscribe()` breaks the reactivity graph — the value is captured at subscribe time, not tracked reactively |
| `no-settimeout-in-component` | `warn` | Raw `setTimeout` / `setInterval` calls that are never cleared in `ngOnDestroy` — timer leak on every component mount |
| `component-no-direct-renderer-style` | `warn` | `renderer.setStyle` called on the host element in `ngOnInit` races with SSR hydration and bypasses Angular's style encapsulation |

**Category total after v2: 10 rules**

---

### `performance/` — Change Detection, Rendering, Template Efficiency

| Rule | Severity | What it catches |
|------|----------|----------------|
| `prefer-signal-over-zone-trigger` | `warn` | Components that could be fully signal-based still trigger Zone.js change detection cycles unnecessarily |
| `template-no-deep-optional-chain` | `warn` | `a?.b?.c?.d?.e` in templates forces Angular to re-evaluate the full chain on every change detection cycle |
| `no-impure-pipe-in-binding` | `warn` | Custom impure pipes used in `[attr]` property bindings re-run on every render pass |
| `ngfor-avoid-index-as-key` | `warn` | `trackBy` implementations that return the loop `index` defeat the entire purpose — Angular still re-renders every item |
| `defer-large-component-trees` | `warn` | Components larger than a configurable threshold (default ~300 lines) that are not wrapped in `@defer` blocks and are not in the initial viewport |

**Category total after v2: 10 rules**

---

### `security/` — XSS, Injection, Sanitization

| Rule | Severity | What it catches |
|------|----------|----------------|
| `no-eval-in-component` | `error` | `eval()`, `new Function(string)`, `setTimeout(string)` — runtime script injection vectors in component/service files |
| `no-inner-html-assignment` | `error` | Direct `element.innerHTML = value` assignment in component class bypasses Angular's built-in HTML sanitization |
| `no-unsafe-href` | `error` | `[href]="userValue"` without explicit sanitization allows `javascript:` protocol injection attacks |
| `no-unsafe-style-binding` | `warn` | `[style.cssText]="userValue"` passes raw CSS text from a potentially untrusted source, enabling CSS injection |
| `http-require-typed-response` | `warn` | `HttpClient.get<any>()` — untyped HTTP responses hide the injection surface from TypeScript's type analysis |
| `no-sensitive-data-in-local-storage` | `warn` | `localStorage.setItem` calls where the key name suggests sensitive data (`token`, `password`, `secret`, `auth`, `credential`) |

**Category total after v2: 8 rules**

---

### `ssr/` — Platform Safety for Angular Universal / @angular/ssr

| Rule | Severity | What it catches |
|------|----------|----------------|
| `no-window-access` | `error` | Direct `window.*` access crashes in Node.js SSR — companion rule to the existing `no-document-access` |
| `no-localstorage-in-constructor` | `error` | `localStorage` / `sessionStorage` accessed in constructors or field initializers before the browser platform is confirmed |
| `no-navigator-access` | `warn` | `navigator.userAgent`, `navigator.geolocation`, etc. — undefined in Node.js SSR context |
| `prefer-platform-id-check` | `warn` | Browser-only APIs accessed without an `isPlatformBrowser(platformId)` guard — the canonical Angular SSR safety pattern |
| `no-dom-query-in-service` | `error` | `document.querySelector()` or similar DOM queries inside an `@Injectable` service — services are instantiated on the server |

**Category total after v2: 7 rules**

---

### `reactivity/` — RxJS Patterns, Signal Reactivity, Observable Lifecycle

| Rule | Severity | What it catches |
|------|----------|----------------|
| `rxjs-no-subject-value` | `warn` | `.value` accessed directly on a `BehaviorSubject` — synchronous pull breaks the reactive contract, use `asObservable()` |
| `rxjs-no-manual-error-catch-swallow` | `warn` | `.pipe(catchError(() => EMPTY))` silently swallows errors with no logging — hides production bugs |
| `signal-no-write-in-template` | `error` | `signal.set()` or `signal.update()` called inside a template expression — causes infinite update loops |
| `rxjs-prefer-async-pipe` | `warn` | `subscribe()` in a component that stores the result in a local property variable — use `async` pipe or `toSignal()` instead |
| `signal-effect-no-async` | `error` | `effect(async () => { ... })` — async effects are not awaited by Angular's reactive scheduler, creating race conditions |
| `computed-no-mutation` | `error` | Writing to an external variable or calling a setter from inside `computed()` — side effects violate the pure computation contract |

**Category total after v2: 14 rules**

---

### `modern-api/` — Idiomatic Angular 17+ APIs

| Rule | Severity | What it catches |
|------|----------|----------------|
| `prefer-view-child-signal` | `warn` | `@ViewChild()` decorator usage → `viewChild()` signal API (Angular 17.3+) for reactive DOM queries |
| `prefer-content-child-signal` | `warn` | `@ContentChild()` decorator usage → `contentChild()` signal API for reactive content projection queries |
| `prefer-take-until-destroyed` | `warn` | Manual `Subject` + `takeUntil(this.destroy$)` teardown pattern → `takeUntilDestroyed()` operator |
| `prefer-destroy-ref` | `warn` | Manual `ngOnDestroy` + `Subject.next()` teardown boilerplate → `DestroyRef.onDestroy()` |
| `prefer-new-http-client` | `warn` | `HttpClientModule` import in `@NgModule` → `provideHttpClient()` functional API |
| `prefer-functional-guards` | `warn` | Class-based route guards implementing `CanActivate` / `CanDeactivate` → functional guard with `inject()` |
| `prefer-functional-resolvers` | `warn` | Class-based route resolvers implementing `Resolve` → functional resolver |

**Category total after v2: 11 rules**

---

### `template/` — Structure, Syntax, Template Patterns

| Rule | Severity | What it catches |
|------|----------|----------------|
| `template-no-negated-async` | `warn` | `*ngIf="!(obs$ | async)"` creates a double subscription and is unreadable — use `@if` with an `as` alias |
| `template-require-alt-on-img` | `warn` | `<img [src]="...">` without an `alt` attribute — accessibility requirement and SEO impact |
| `template-no-autofocus` | `warn` | `autofocus` attribute is broken in Angular SPA routing — focus resets on every client-side navigation |
| `template-no-native-anchor-navigate` | `warn` | `<a href="/route">` bypasses the Angular router entirely — breaks SPA navigation, preloading, and guards |
| `template-require-defer-fallbacks` | `warn` | `@defer` blocks without both `@error` and `@loading` fallback blocks — silently blank on failure |
| `template-no-console-call` | `error` | `(click)="console.log($event)"` in templates — debug leftover that will run in production |
| `template-no-empty-callback` | `warn` | `(click)="$event.preventDefault()"` with no meaningful handler — logic belongs in the component class |

**Category total after v2: 9 rules**

---

### `testing/` — Spec Quality, CI Blind Spots

| Rule | Severity | What it catches |
|------|----------|----------------|
| `spec-no-skipped-test` | `warn` | `xdescribe`, `xit`, `describe.skip`, `it.skip` — skipped tests that permanently hide regressions |
| `spec-require-fixture-destroy` | `warn` | `fixture.destroy()` not called in `afterEach` — component teardown side effects leak between test cases |
| `spec-no-expect-in-beforeeach` | `warn` | `expect()` assertions inside a `beforeEach` block — violates setup/assertion separation |
| `spec-require-change-detection-run` | `warn` | `fixture.detectChanges()` not called after a state mutation — test passes on a stale DOM snapshot |
| `spec-no-hardcoded-env` | `warn` | Hardcoded environment URLs or access tokens in spec files — should use test doubles or environment mocks |
| `spec-avoid-real-http` | `error` | `HttpClient` used in a spec without `HttpClientTestingModule` / `provideHttpClientTesting()` — real network calls in tests |

**Category total after v2: 7 rules**

---

## v2 Summary Table

| Category | v1 Count | New in v2 | v2 Total |
|----------|----------|-----------|----------|
| `correctness` | 5 | 5 | **10** |
| `performance` | 5 | 5 | **10** |
| `security` | 2 | 6 | **8** |
| `ssr` | 2 | 5 | **7** |
| `reactivity` | 8 | 6 | **14** |
| `modern-api` | 4 | 7 | **11** |
| `template` | 2 | 7 | **9** |
| `testing` | 1 | 6 | **7** |
| **Total** | **29** | **47** | **76** |

---

## Implementation Priority

### Wave 1 — High impact, low complexity (ship first, ~1 week)

These rules follow patterns already established in v1 and require minimal new AST work:

1. `spec-no-skipped-test` — single-line companion to the existing `spec-no-focused-test`
2. `no-window-access` — identical pattern to `no-document-access`, add `window` to the global list
3. `rxjs-no-subject-value` — detect `.value` property access on a `BehaviorSubject` instance
4. `template-require-alt-on-img` — template AST: `<img>` element without `alt` attribute
5. `prefer-view-child-signal` — mirrors `signal-prefer-input-signal` pattern for `@ViewChild`
6. `template-no-console-call` — template AST: call expression where callee is `console.*`
7. `no-eval-in-component` — call expression rule detecting `eval`, `new Function`, `setTimeout(string)`

### Wave 2 — High impact, medium complexity (~2 weeks)

8. `prefer-functional-guards` — class detection + `CanActivate` interface check
9. `no-settimeout-in-component` — timer leak detection with `ngOnDestroy` cross-check
10. `spec-require-fixture-destroy` — cross-method analysis within spec `describe` blocks
11. `template-require-defer-fallbacks` — template AST: `@defer` without `@error`/`@loading`
12. `prefer-destroy-ref` — pairs with existing `rxjs-require-take-until-destroyed`
13. `no-localstorage-in-constructor` — constructor body + field initializer scan
14. `signal-effect-no-async` — detect `async` arrow in `effect()` callback

### Wave 3 — Strategic differentiators, enterprise value (~3 weeks)

15. `signal-no-write-in-template` — only tool that catches infinite signal loops in templates
16. `no-sensitive-data-in-local-storage` — keyword-based key analysis, security teams pay for this
17. `spec-avoid-real-http` — import graph analysis for test files without testing providers
18. `component-must-call-super-lifecycle` — class hierarchy traversal to find missing `super` calls
19. `computed-no-mutation` — data-flow analysis inside `computed()` callbacks
20. `signal-read-inside-subscribe` — cross-callback signal access detection

---

## Notes for Implementation

- All new rules follow the same creator pattern as v1: `createCallExpressionRule`, `createAnyAngularClassRule`, or `createTemplateExpressionRule`
- Every new rule must have an entry in `recommendations.ts` (`RECOMMENDATIONS` + optional `CODE_EXAMPLES`)
- Every new rule must be registered in `registry/register-all.ts` under its category comment block
- Severity defaults: `error` for correctness/security issues, `warn` for style/migration suggestions
- Rules with cross-file or cross-method analysis should document their `ProjectContext` usage
- Each wave should ship as a minor version (`v2.1`, `v2.2`, `v2.3`) to give users incremental adoption
