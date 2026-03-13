# ngcompass Rules Roadmap — Modern Angular Issues

## Senior Architect Review — March 2026

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Already implemented |
| 🟢 | Fully supported by current base — implement now |
| 🟡 | Supported with minor additions (< 1 day work) |
| 🟠 | Needs one unimplemented CTX ticket first |
| 🔴 | Needs multiple CTX tickets or TypeScript Program depth |

**Current infrastructure available to rules:**
- OXC TypeScript AST (per-file)
- Angular template AST (per-file)
- CSS/SCSS AST (per-file)
- `ts.TypeChecker` (full semantic analysis)
- `ProjectContext.importGraph` / `reverseImportGraph` (CTX-002 ✅)
- `ProjectContext.componentGraph` / `templateToComponent` (CTX-003 ✅)
- `ProjectContext.ngModuleMap` / `standaloneComponents` / `classToFile` (CTX-004 ✅)
- `ComponentCrossRef.publicMembers` / `templateReferences` (CTX-003 ✅)
- Post-analysis phase (CTX-005 — not yet implemented)

---

## Existing Rules (Do Not Duplicate)

| Rule | Category |
|------|----------|
| `prefer-on-push` | Architecture |
| `prefer-inject` | Architecture |
| `component-no-manual-detect-changes` | Architecture |
| `signal-prefer-computed-over-sync-effect` | Signals |
| `signal-no-side-effects-in-computed` | Signals |
| `signal-effect-must-be-destroy-scoped` | Signals |
| `signal-no-effect-in-constructor` | Signals |
| `signal-avoid-untracked-overuse` | Signals |
| `rxjs-no-subscribe-in-component` | RxJS |
| `rxjs-require-takeUntilDestroyed` | RxJS |
| `rxjs-avoid-behaviorsubject-for-local-state` | RxJS |
| `rxjs-avoid-subject-as-event-bus` | RxJS |
| `rxjs-prefer-toSignal-for-template-state` | RxJS |
| `to-signal-require-initial-value` | RxJS |
| `template-no-call-expression` | Template |
| `template-no-async-pipe-duplication` | Template |
| `template-no-array-literal-binding` | Template |
| `template-no-object-literal-binding` | Template |
| `template-trackby-required` | Template |

---

## TIER 1 — Critical / Highest Impact
*Modern Angular pain points with the most developer impact. Implement next.*

---

### RULE-NEW-001: `template-prefer-control-flow`
**Priority:** Critical | **Effort:** S | **Support:** 🟢 Template AST

**Problem:** Angular 17 introduced `@if`, `@for`, `@switch` as built-in control flow, replacing `*ngIf`, `*ngFor`, `*ngSwitch`. The old structural directives are deprecated and will be removed. Teams migrating to Angular 17+ frequently mix old and new syntax.

**What it flags:**
```html
<!-- ❌ flagged -->
<div *ngIf="isLoggedIn">Hello</div>
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>
<div [ngSwitch]="status">...</div>

<!-- ✅ correct -->
@if (isLoggedIn) { <div>Hello</div> }
@for (item of items; track item.id) { <li>{{ item.name }}</li> }
@switch (status) { ... }
```

**Why developers struggle:** Angular's schematic migrates `*ngIf` but leaves edge cases (nested `ng-template`, `else` branches, `as` syntax). Manual review requires knowing every syntax variant.

**Implementation notes:**
- Walk template AST for `BoundAttribute` nodes with `name === 'ngIf'`, `ngFor`, `ngSwitch`
- Also flag `TemplateElement` nodes with `*ngIf` / `*ngFor` structural directive markers
- Severity: `warn` (migration advisory, not a hard error)

**Requires:** `{ htmlAst: true }`

---

### RULE-NEW-002: `signal-prefer-input-signal`
**Priority:** Critical | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** Angular 17.1 introduced `input()` / `input.required()` as signal-based replacements for `@Input()`. Signal inputs enable computed values, fine-grained reactivity, and better type safety. Teams default to `@Input()` out of habit.

**What it flags:**
```typescript
// ❌ flagged
@Input() title: string = '';
@Input() set items(val: Item[]) { ... }

// ✅ correct
title = input<string>('');
items = input.required<Item[]>();
```

**Edge cases to handle:**
- `@Input({ alias: '...' })` — flag but note alias migration needed
- `@Input({ transform: booleanAttribute })` — flag, suggest `input(false, { transform: booleanAttribute })`
- Skip if class is not a `@Component` or `@Directive`

**Requires:** TypeScript AST only (no TypeChecker needed)

---

### RULE-NEW-003: `signal-prefer-output-function`
**Priority:** Critical | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** Angular 17.3 introduced `output()` as a replacement for `@Output() EventEmitter`. Signal outputs have better type inference and integrate with the signal graph. `EventEmitter` is now legacy.

**What it flags:**
```typescript
// ❌ flagged
@Output() clicked = new EventEmitter<void>();
@Output('alias') valueChanged = new EventEmitter<string>();

// ✅ correct
clicked = output<void>();
valueChanged = output<string>({ alias: 'alias' });
```

**Implementation notes:**
- Walk class body for `PropertyDefinition` with `@Output()` decorator
- Check initializer is `new EventEmitter<...>()`
- Severity: `warn`

**Requires:** TypeScript AST only

---

### RULE-NEW-004: `signal-prefer-model`
**Priority:** High | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** Angular 17.2 introduced `model()` for two-way data binding signals, replacing the `@Input()` + `@Output() nameChange` pattern. The manual pair pattern is verbose and error-prone (easy to forget the `Change` suffix).

**What it flags:**
```typescript
// ❌ flagged — paired Input/Output pattern
@Input() value: string = '';
@Output() valueChange = new EventEmitter<string>();

// ✅ correct
value = model<string>('');
```

**Implementation notes:**
- Detect when a class has both `@Input() x` and `@Output() xChange` (or signal `input` + `output`) where the output name is exactly `${inputName}Change`
- This requires scanning the full class body — AnyAngularClass stream works
- Severity: `warn`

**Requires:** TypeScript AST, class-body scan

---

### RULE-NEW-005: `component-prefer-pure-pipe`
**Priority:** High | **Effort:** M | **Support:** 🟢 CrossRef available

**Problem:** Developers call component methods in templates for data transformation (filtering, formatting, sorting). These calls execute on every change detection cycle. A pure pipe executes only when its input reference changes — orders of magnitude faster under OnPush.

**What it flags:**
```html
<!-- ❌ flagged — method call with args in property binding/interpolation -->
{{ formatDate(user.birthDate) }}
[class.active]="isItemSelected(item.id)"

<!-- ✅ correct — pure pipe -->
{{ user.birthDate | dateFormat }}
[class.active]="item.id | isSelected"
```

**Implementation notes:**
- Improve `template-no-call-expression`: detect when the callee is in `crossRef.publicMembers` and the call has args (confirmed component method call, not a signal read)
- This is an enhancement to an existing rule, or a separate rule with different messaging
- Skip calls inside `(event)` bindings — event handlers with `$event` are expected
- Severity: `warn`

**Requires:** `{ htmlAst: true, projectContext: true }` (for crossRef)

---

### RULE-NEW-006: `no-document-access`
**Priority:** High | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** Direct `document` / `window` / `navigator` access breaks Server-Side Rendering (SSR). Angular Universal and the new `@angular/ssr` require using `DOCUMENT` token or `isPlatformBrowser()` guards. This is one of the most frequent SSR migration failures.

**What it flags:**
```typescript
// ❌ flagged
document.getElementById('modal');
window.scrollTo(0, 0);
localStorage.setItem('key', value);
navigator.clipboard.writeText(text);

// ✅ correct
constructor(@Inject(DOCUMENT) private doc: Document) {}
this.doc.getElementById('modal');
```

**Edge cases:**
- Inside `afterNextRender()` or `afterRender()` callbacks — browser-only safe zone → skip or downgrade
- Inside `isPlatformBrowser(platformId)` guard — already handled → skip
- Inside `*.spec.ts` files → skip

**Requires:** TypeScript AST only (CallExpression + MemberExpression patterns)

---

### RULE-NEW-007: `rxjs-no-nested-subscribe`
**Priority:** High | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** Nesting `.subscribe()` inside another `.subscribe()` callback creates callback hell, makes unsubscription nearly impossible, and is the RxJS equivalent of nested Promises. Should use `switchMap`, `mergeMap`, `concatMap`, or `exhaustMap`.

**What it flags:**
```typescript
// ❌ flagged
this.userService.getUser().subscribe(user => {
    this.postService.getPosts(user.id).subscribe(posts => {  // ← flagged
        this.posts = posts;
    });
});

// ✅ correct
this.userService.getUser().pipe(
    switchMap(user => this.postService.getPosts(user.id))
).subscribe(posts => this.posts = posts);
```

**Implementation notes:**
- `CallExpression` rule: fire on `.subscribe()` calls
- Walk callback argument body for nested `.subscribe()` calls
- Severity: `error`

**Requires:** TypeScript AST, recursive callback body scan

---

### RULE-NEW-008: `no-bypass-sanitization`
**Priority:** High | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** `DomSanitizer.bypassSecurityTrust*()` methods disable Angular's XSS protection. They are almost always misused — the correct fix is to sanitize the source data, not bypass the output sanitizer.

**What it flags:**
```typescript
// ❌ flagged
this.sanitizer.bypassSecurityTrustHtml(userInput);
this.sanitizer.bypassSecurityTrustScript(code);
this.sanitizer.bypassSecurityTrustResourceUrl(url);
this.sanitizer.bypassSecurityTrustStyle(css);

// ✅ correct — sanitize at source, not at output
```

**Implementation notes:**
- `CallExpression` rule matching `bypassSecurityTrust` prefix
- Also flag `[innerHTML]` bindings in templates without a `| sanitize` pipe (separate template rule)
- Severity: `error` (security rule, no exceptions)

**Requires:** TypeScript AST + template AST (two sub-rules)

---

### RULE-NEW-009: `template-no-unsafe-bindings`
**Priority:** High | **Effort:** S | **Support:** 🟢 Template AST

**Problem:** `[innerHTML]`, `[outerHTML]`, `[srcdoc]` bindings bypass Angular's template safety if the value is not explicitly sanitized. A missing `async pipe` or unsanitized API response can silently open XSS vectors.

**What it flags:**
```html
<!-- ❌ flagged -->
<div [innerHTML]="userContent"></div>
<iframe [srcdoc]="template"></iframe>

<!-- ✅ acceptable (pipe signals intent) -->
<div [innerHTML]="userContent | sanitizeHtml"></div>
```

**Requires:** `{ htmlAst: true }`

---

### RULE-NEW-010: `signal-no-effect-with-subscription`
**Priority:** High | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** Creating a `.subscribe()` call inside `effect()` creates a subscription that is never cleaned up (effect's cleanup mechanism doesn't unsubscribe RxJS). The correct pattern is `toSignal()` or manual cleanup via `effect`'s `onCleanup`.

**What it flags:**
```typescript
// ❌ flagged
effect(() => {
    this.someObservable$.subscribe(val => {  // ← unmanaged subscription
        this.data = val;
    });
});

// ✅ correct
data = toSignal(this.someObservable$);
```

**Requires:** TypeScript AST, nested call detection

---

## TIER 2 — High Impact, Project-Context Powered
*These rules use the already-built CTX-002 / CTX-003 / CTX-004 context. Implement after Tier 1.*

---

### RULE-NEW-011: `template-no-undefined-member`
**Priority:** High | **Effort:** M | **Support:** 🟡 CrossRef `publicMembers` available

**Problem:** Methods and properties used in templates that don't exist in the component class fail at runtime with `TypeError: ... is not a function` or silently produce `undefined`. Angular's `strictTemplates` catches some of these but only with full TypeScript compilation.

**What it flags:**
```html
<!-- ❌ flagged when 'handleSubmit' not in crossRef.publicMembers -->
(click)="handleSubmit()"
{{ nonExistentProperty }}
```

**Implementation notes:**
- `createTemplateExpressionRule` with `{ htmlAst: true, projectContext: true }`
- From `context.crossRef.publicMembers`, verify each `ImplicitReceiver` call/property
- Only flag when `publicMembers` is populated (fallback: skip when unavailable)
- Severity: `error` when TypeChecker confirms; `warn` otherwise

**Requires:** `{ htmlAst: true, projectContext: true }` — crossRef.publicMembers

---

### RULE-NEW-012: `enforce-standalone-migration`
**Priority:** High | **Effort:** M | **Support:** 🟡 CTX-004 `ngModuleMap` available

**Problem:** Angular 19 made standalone the default. NgModule-based applications must migrate. Teams need a rule that flags non-standalone components and provides actionable migration guidance.

**What it flags:**
```typescript
// ❌ flagged — @Component without standalone: true, declared in an NgModule
@Component({ selector: 'app-user', templateUrl: '...' })
export class UserComponent {}

// ✅ correct
@Component({ selector: 'app-user', standalone: true, imports: [...], templateUrl: '...' })
export class UserComponent {}
```

**Implementation notes:**
- `createAnyAngularClassRule` with `{ requires: { projectContext: true } }`
- Check `context.project.standaloneComponents` — if this file's component isn't in the set → flag
- Check `context.project.ngModuleMap` — if class is in a module's `declarations` → include in message
- Severity: `warn` (migration advisory)

**Requires:** CTX-004 `standaloneComponents` / `ngModuleMap` ✅

---

### RULE-NEW-013: `standalone-no-missing-import`
**Priority:** High | **Effort:** M | **Support:** 🟡 CTX-003 + CTX-004

**Problem:** Standalone components must declare every dependency in their `imports` array. Missing imports produce `NG0303: Can't bind to '...'` or render nothing silently, making this one of the most frustrating runtime errors for Angular developers adopting standalone.

**What it flags:**
```typescript
// ❌ flagged when RouterLink is used in template but not in imports[]
@Component({
    standalone: true,
    imports: [CommonModule],  // RouterLink missing
    template: `<a [routerLink]="['/home']">Home</a>`
})
```

**Implementation notes:**
- Cross-reference template AST (directives/pipes used) vs `imports[]` in decorator
- Use `ngModuleMap` to resolve which imports provide which selectors
- Severity: `error`

**Requires:** `{ htmlAst: true, projectContext: true }` — CTX-003 + CTX-004 ✅

---

### RULE-NEW-014: `service-no-component-import`
**Priority:** High | **Effort:** S | **Support:** 🟡 CTX-002 `importGraph` available

**Problem:** Services importing components creates an architecture inversion — services should not depend on UI layer. This causes circular dependency risks and makes services untestable without rendering infrastructure.

**What it flags:**
- Service file (`*.service.ts`) that imports from a `*.component.ts` file
- Detected via `context.project.importGraph`

**Implementation notes:**
- Post-analysis or per-file rule checking `context.project.importGraph.get(filePath)`
- If file ends with `.service.ts`, scan its forward imports for `.component.ts` paths
- Severity: `error` (architecture rule)

**Requires:** CTX-002 `importGraph` ✅

---

### RULE-NEW-015: `component-no-unused-public-member`
**Priority:** Medium | **Effort:** M | **Support:** 🟡 CrossRef both sides available

**Problem:** Public component members that are never referenced in the template and never imported by other files are dead code. They pollute the public API, increase bundle size, and mislead readers about the component's contract.

**What it flags:**
```typescript
// ❌ flagged — public method not in templateReferences, file not imported anywhere
public formatLabel(item: Item): string { ... }

// ✅ not flagged — used in template
public isSelected(id: string): boolean { ... }  // appears in templateReferences
```

**Implementation notes:**
- `createAnyAngularClassRule` with `{ requires: { projectContext: true } }`
- Cross-reference `publicMembers` vs `templateReferences` + `reverseImportGraph`
- If member not in `templateReferences` AND file has no dependents in `reverseImportGraph` → flag
- Skip `ngOnInit`, `ngOnDestroy`, `ngOnChanges`, Angular lifecycle hooks
- Severity: `warn`

**Requires:** CTX-002 `reverseImportGraph` ✅ + CTX-003 crossRef ✅

---

### RULE-NEW-016: `prefer-after-render-over-after-view-init`
**Priority:** Medium | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** `ngAfterViewInit` runs server-side during SSR, causing DOM access errors. `afterNextRender()` (Angular 17+) is browser-guaranteed and SSR-safe. It's also more idiomatic in standalone/signal components.

**What it flags:**
```typescript
// ❌ flagged
ngAfterViewInit() {
    this.chart = new Chart(this.canvas.nativeElement);  // fails during SSR
}

// ✅ correct
constructor() {
    afterNextRender(() => {
        this.chart = new Chart(this.canvas.nativeElement);
    });
}
```

**Implementation notes:**
- Flag `ngAfterViewInit` method that contains DOM access patterns (`.nativeElement`, `document.`, `window.`)
- Severity: `warn`

**Requires:** TypeScript AST only

---

### RULE-NEW-017: `no-ngonchanges-for-derived-state`
**Priority:** Medium | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** `ngOnChanges()` used to compute derived values from inputs is the imperative equivalent of `computed()`. With signal inputs, it becomes completely unnecessary. This is explicitly in the Angular migration guides.

**What it flags:**
```typescript
// ❌ flagged — ngOnChanges writing to another property
ngOnChanges(changes: SimpleChanges) {
    if (changes['items']) {
        this.filteredItems = this.items.filter(i => i.active);
    }
}

// ✅ correct
filteredItems = computed(() => this.items().filter(i => i.active));
```

**Implementation notes:**
- Flag `ngOnChanges` methods that only perform assignments to `this.x = f(this.y)` (derived state pattern)
- Skip methods that have side effects (HTTP calls, DOM operations)
- Severity: `warn`

**Requires:** TypeScript AST only

---

## TIER 3 — Architecture & Code Quality
*Rules that enforce Angular project structure and long-term maintainability.*

---

### RULE-NEW-018: `no-circular-dependency`
**Priority:** High | **Effort:** M | **Support:** 🟠 Needs CTX-005 post-analysis

**Problem:** Circular imports are silent TypeScript runtime errors that manifest as `undefined` values at import time. They are nearly impossible to debug. Angular's lazy loading makes them especially dangerous at module boundaries.

**What it flags:**
```
// ❌ flagged
user.service.ts → auth.service.ts → user.service.ts  (cycle detected)
```

**Implementation notes:**
- Post-analysis rule (CTX-005) — DFS/BFS over `importGraph` to detect cycles
- Report the full cycle path in the message
- Severity: `error`

**Requires:** CTX-005 post-analysis phase ❌ (not yet implemented)

---

### RULE-NEW-019: `module-no-unused-declaration`
**Priority:** High | **Effort:** M | **Support:** 🟠 Needs CTX-005 post-analysis

**Problem:** Components declared in `@NgModule.declarations` that are never used in any template in the module's scope are dead code. They inflate bundle size and confuse readers about what the module provides.

**Requires:** CTX-004 `ngModuleMap` ✅ + CTX-005 aggregation for cross-file template scan ❌

---

### RULE-NEW-020: `di-no-provided-in-root-with-state`
**Priority:** Medium | **Effort:** M | **Support:** 🟠 Needs CTX-006 DI tree

**Problem:** `providedIn: 'root'` services are singletons — they must not hold state specific to a single component's lifecycle (selected items, form state, UI-level flags). This is a common architecture mistake in large Angular apps.

**Requires:** CTX-006 DI tree ❌ (not yet implemented)

---

### RULE-NEW-021: `prefer-facade-for-complex-components`
**Priority:** Medium | **Effort:** M | **Support:** 🟡 TypeChecker + `inject()` scan

**Problem:** Components injecting more than N services (e.g., > 5) are doing too much. The Facade pattern encapsulates multiple service interactions into a single component-specific service, keeping components lean.

**What it flags:**
```typescript
// ❌ flagged — 7 injected dependencies
constructor(
    private userSvc: UserService,
    private authSvc: AuthService,
    private routerSvc: RouterService,
    private notifSvc: NotificationService,
    private permSvc: PermissionService,
    private analyticsService: AnalyticsService,
    private featureFlags: FeatureFlagService,
) {}
```

**Implementation notes:**
- Walk constructor parameters or `inject()` calls in class fields
- Count distinct service injections; flag when > configurable threshold (default: 5)
- Severity: `warn`
- Configurable via rule options: `{ maxDependencies: 5 }`

**Requires:** TypeScript AST only

---

### RULE-NEW-022: `spec-no-focused-test`
**Priority:** Medium | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** `fdescribe()` and `fit()` (focused tests) prevent all other tests from running. Accidentally committed focused tests silently cause CI to pass with only a subset of tests executing.

**What it flags:**
```typescript
fdescribe('UserComponent', () => { ... });  // ❌
fit('should render', () => { ... });        // ❌
describe.only('...', () => { ... });        // ❌
```

**Requires:** TypeScript AST, `.spec.ts` files only — `CallExpression` rule

---

### RULE-NEW-023: `spec-no-any-cast-in-tests`
**Priority:** Low | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** Casting to `any` in tests (`(component as any).privateMethod()`) hides type errors and breaks when the implementation changes. Signal-based testing should use the public API only.

**Requires:** TypeScript AST only

---

## TIER 4 — Accessibility & UX Quality
*Rules for teams with accessibility requirements (WCAG 2.1+).*

---

### RULE-NEW-024: `template-img-requires-alt`
**Priority:** High | **Effort:** S | **Support:** 🟢 Template AST

**Problem:** `<img>` elements without `alt` attributes fail WCAG 2.1 Success Criterion 1.1.1. Screen readers read the file path aloud, creating a terrible experience for visually impaired users.

**What it flags:**
```html
<img src="logo.png" />         <!-- ❌ missing alt -->
<img src="logo.png" alt="" />  <!-- ✅ decorative (empty alt is valid) -->
<img src="profile.jpg" [alt]="user.name" />  <!-- ✅ dynamic alt -->
```

**Requires:** `{ htmlAst: true }` — template AST element node walk

---

### RULE-NEW-025: `template-interactive-requires-role`
**Priority:** Medium | **Effort:** M | **Support:** 🟢 Template AST

**Problem:** Non-semantic interactive elements (`<div (click)="...">`  without `role` and keyboard support) are inaccessible to keyboard and assistive technology users. Angular apps are particularly prone to this because `(click)` is easy to add to any element.

**What it flags:**
```html
<!-- ❌ flagged — div/span with click handler, no role/tabindex -->
<div (click)="doAction()">Click me</div>

<!-- ✅ correct -->
<button (click)="doAction()">Click me</button>
<div (click)="doAction()" role="button" tabindex="0" (keydown.enter)="doAction()">...</div>
```

**Requires:** `{ htmlAst: true }`

---

### RULE-NEW-026: `template-no-positive-tabindex`
**Priority:** Low | **Effort:** S | **Support:** 🟢 Template AST

**Problem:** Positive `tabindex` values (`tabindex="2"`) override the natural tab order, creating a confusing navigation sequence for keyboard users. Only `tabindex="0"` (natural order) and `tabindex="-1"` (programmatic focus) should be used.

**Requires:** `{ htmlAst: true }`

---

## TIER 5 — Performance Deep Dives
*Rules targeting runtime performance bottlenecks.*

---

### RULE-NEW-027: `component-no-subscription-leak-in-template`
**Priority:** Medium | **Effort:** M | **Support:** 🟢 Template AST + TypeScript AST

**Problem:** Using `| async` pipe on a cold observable that creates side effects on subscription will trigger those side effects multiple times if the pipe is bound in multiple places in the template. This is a subtle performance and correctness issue.

**What it flags:**
```html
<!-- ❌ flagged — same observable piped twice (two subscriptions) -->
<p>Name: {{ user$ | async }}</p>
<p>Email: {{ (user$ | async)?.email }}</p>

<!-- ✅ correct — single subscription via *ngLet or @let -->
@let user = user$ | async;
<p>Name: {{ user?.name }}</p>
<p>Email: {{ user?.email }}</p>
```

**Note:** This overlaps with the existing `template-no-async-pipe-duplication` rule but adds the angular `@let` syntax suggestion.

---

### RULE-NEW-028: `signal-no-write-in-template`
**Priority:** Medium | **Effort:** S | **Support:** 🟢 Template AST + CrossRef

**Problem:** Calling `signal.set()` or `signal.update()` in template event handlers creates untrackable state mutations. Signal writes should happen in component methods, not inline in templates.

**What it flags:**
```html
<!-- ❌ flagged — signal write in template -->
(click)="count.set(count() + 1)"
(change)="selected.update(s => [...s, item])"

<!-- ✅ correct -->
(click)="incrementCount()"
```

**Requires:** `{ htmlAst: true }` — detect `.set(` / `.update(` / `.mutate(` call patterns in event handlers

---

### RULE-NEW-029: `rxjs-no-subject-value-access`
**Priority:** Medium | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** `BehaviorSubject.value` and `.getValue()` access the current value synchronously, breaking the reactive paradigm. If you need to read the current value, you should be using a Signal instead. Accessing `.value` is also not reactive — changes won't trigger updates.

**What it flags:**
```typescript
// ❌ flagged
const current = this.items$.value;
const current = this.items$.getValue();
```

**Requires:** TypeScript AST, `MemberExpression` / `CallExpression` patterns

---

## TIER 6 — Code Style & Conventions
*Lower urgency but important for large-team consistency.*

---

### RULE-NEW-030: `enforce-class-suffix`
**Priority:** Low | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** Angular style guide requires class suffixes: `Component`, `Service`, `Pipe`, `Directive`, `Guard`, `Resolver`, `Interceptor`. Inconsistent naming makes the codebase harder to navigate.

**What it flags:**
```typescript
@Injectable() export class UserData {}      // ❌ should be UserDataService
@Component(...) export class User {}         // ❌ should be UserComponent
@Pipe(...) export class FormatDate {}        // ❌ should be FormatDatePipe
```

**Requires:** TypeScript AST, decorator + class name check

---

### RULE-NEW-031: `prefer-signal-queries`
**Priority:** Low | **Effort:** S | **Support:** 🟢 TypeScript AST

**Problem:** Angular 17.2 introduced `viewChild()`, `viewChildren()`, `contentChild()`, `contentChildren()` as signal-based replacements for `@ViewChild`, `@ViewChildren`, `@ContentChild`, `@ContentChildren`. Signal queries are lazily evaluated and don't require `ngAfterViewInit`.

**What it flags:**
```typescript
// ❌ flagged
@ViewChild('canvas') canvas!: ElementRef;
@ContentChildren(TabComponent) tabs!: QueryList<TabComponent>;

// ✅ correct
canvas = viewChild<ElementRef>('canvas');
tabs = contentChildren(TabComponent);
```

**Requires:** TypeScript AST only

---

## Implementation Priority Summary

```
IMPLEMENT NOW (Tier 1 — current base fully supports):
  RULE-NEW-001  template-prefer-control-flow        🟢 Quick win — huge Angular 17+ impact
  RULE-NEW-002  signal-prefer-input-signal           🟢 Quick win — Angular 17.1+
  RULE-NEW-003  signal-prefer-output-function        🟢 Quick win — Angular 17.3+
  RULE-NEW-004  signal-prefer-model                  🟢 Angular 17.2+
  RULE-NEW-006  no-document-access                   🟢 SSR safety — very common pain
  RULE-NEW-007  rxjs-no-nested-subscribe             🟢 Classic RxJS mistake
  RULE-NEW-008  no-bypass-sanitization               🟢 Security — no excuses
  RULE-NEW-009  template-no-unsafe-bindings          🟢 Security — template-level
  RULE-NEW-010  signal-no-effect-with-subscription   🟢 Signal+RxJS interop mistake
  RULE-NEW-022  spec-no-focused-test                 🟢 CI safety — trivial to implement

IMPLEMENT NEXT (Tier 2 — minor wiring to existing context):
  RULE-NEW-011  template-no-undefined-member         🟡 crossRef.publicMembers available
  RULE-NEW-012  enforce-standalone-migration         🟡 ngModuleMap available
  RULE-NEW-013  standalone-no-missing-import         🟡 CTX-003 + CTX-004 available
  RULE-NEW-014  service-no-component-import          🟡 importGraph available
  RULE-NEW-016  prefer-after-render-over-after-view-init  🟢 TypeScript AST only
  RULE-NEW-017  no-ngonchanges-for-derived-state     🟢 TypeScript AST only
  RULE-NEW-031  prefer-signal-queries                🟢 TypeScript AST only

IMPLEMENT AFTER CTX-005:
  RULE-NEW-018  no-circular-dependency               🟠 Post-analysis phase
  RULE-NEW-019  module-no-unused-declaration         🟠 Post-analysis phase

IMPLEMENT AFTER CTX-006:
  RULE-NEW-020  di-no-provided-in-root-with-state    🔴 DI tree needed

ACCESSIBILITY (implement when targeting enterprise/govt):
  RULE-NEW-024  template-img-requires-alt            🟢 Ready now
  RULE-NEW-025  template-interactive-requires-role   🟢 Ready now
  RULE-NEW-026  template-no-positive-tabindex        🟢 Ready now
```

---

## Rule Count Projection

| Phase | Rules Added | Total Rules | Market Position |
|-------|-------------|-------------|-----------------|
| Current | 0 | 19 | Developer preview |
| After Tier 1 | +10 | 29 | Credible beta |
| After Tier 2 | +7 | 36 | Strong v1.0 candidate |
| After Accessibility | +3 | 39 | Enterprise-ready |
| After Tier 3 (CTX-005/006) | +4 | 43 | Full v1.0 |

---

*Last updated: March 2026*
