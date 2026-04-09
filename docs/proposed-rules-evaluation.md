# Proposed Angular Linter Rules for Evaluation

Based on common pain points for Angular developers (specifically around forms, dependency injection, routing, template performance, DOM manipulation, and testing), the following rules are proposed for evaluation and potential implementation in `ngcompass`.

## 1. Reactive Forms (Safety & Typing)
Forms are notoriously tricky in Angular. The goal is to enforce strict typing and prevent leaky or unpredictable state.

*   **`forms-require-typed-controls`**:
    *   *Description*: Prevents the use of `UntypedFormControl`, `UntypedFormGroup`, etc.
    *   *Objective*: Forces developers to use strictly typed forms (e.g., `FormControl<string>`), eliminating a major source of runtime errors and `any` types.
*   **`forms-prefer-non-nullable`**:
    *   *Description*: Encourages the use of `NonNullableFormBuilder` or `{nonNullable: true}`.
    *   *Objective*: Reduces boiler-plate null checks. A huge pain point is dealing with `null` values in form flows when they aren't actually expected to be null upon reset.
*   **`forms-no-snapshot-validation`**:
    *   *Description*: Flags validators that rely on external mutable component state instead of taking inputs directly via arguments or closure state.
    *   *Objective*: Prevents race conditions and difficult-to-test form logic.

## 2. Dependency Injection & Architecture
Circular dependencies and bloated providers lead to spaghetti code in enterprise Angular applications.

*   **`di-no-forward-ref`**:
    *   *Description*: Flags the use of `forwardRef()`.
    *   *Objective*: Enforces better architectural design. Needing `forwardRef()` is almost always a sign of tight coupling or circular dependencies between components/services that should be extracted.
*   **`di-prefer-provided-in-root`**:
    *   *Description*: Flags services that are provided in an `@NgModule` or `@Component` providers array unless strictly necessary.
    *   *Objective*: Promotes the use of `providedIn: 'root'`, which enables tree-shaking and singleton enforcement.
*   **`architecture-no-cross-feature-imports`**:
    *   *Description*: Flags when a feature module imports deep inside another feature module.
    *   *Objective*: Enforces the use of public API/index barrel files, creating clear boundaries between feature slices.

## 3. Routing (Memory Leaks & Stale Data)
The router is powerful but easy to misuse, leading to UI that doesn't update when the URL changes.

*   **`router-avoid-snapshot-in-component`**:
    *   *Description*: Flags reading `ActivatedRoute.snapshot.paramMap` inside components if they use `routerLink` to navigate to the same component structure.
    *   *Objective*: Prevents the classic bug where a URL changes but the component data doesn't update. Developers should use the `.paramMap` Observable or Angular 16+ `@Input()` router bindings instead.
*   **`router-prefer-load-component`**:
    *   *Description*: Encourages `loadComponent` over `loadChildren` for lazy loading routes.
    *   *Objective*: Pushes teams towards modern Standalone component routing architectures and away from heavy `NgModules`.

## 4. Template Performance & Safety (The Silent Killers)
These issues are hard to spot manually and can severely degrade rendering performance.

*   **`template-no-getters-in-binding`**:
    *   *Description*: Flags the use of property getters in template bindings (e.g., `{{ myGetter }}` where `get myGetter() { ... }`).
    *   *Objective*: Just like method calls, getters run on every change detection cycle. This rule complements existing rules against template function calls.
*   **`security-no-bypass-security-trust`**:
    *   *Description*: Flags the use of `DomSanitizer.bypassSecurityTrustHtml` (and related methods).
    *   *Objective*: Audits and strictly limits potential Cross-Site Scripting (XSS) vulnerabilities.
*   **`template-prefer-control-flow`**:
    *   *Description*: Suggests replacing `*ngIf`, `*ngFor`, and `*ngSwitch` with modern `@if`, `@for`, `@switch` syntax.
    *   *Objective*: Improves template compilation performance, reduces directive imports, and prepares the codebase for the future.

## 5. Host Elements & DOM Manipulation
Direct DOM manipulation fights with Angular's view engine, reducing flexibility (like server-side rendering).

*   **`dom-no-native-element-mutation`**:
    *   *Description*: Flags direct modification of `ElementRef.nativeElement` (e.g., `this.el.nativeElement.style.color = 'red'`).
    *   *Objective*: Encourages the use of `@HostBinding`, signals, or `Renderer2` to maintain framework synchronization and server-side rendering compatibility.
*   **`dom-avoid-window-host-listener`**:
    *   *Description*: Flags `@HostListener('window:scroll')` or `@HostListener('document:mousemove')`.
    *   *Objective*: These listeners trigger global Change Detection cycles constantly and destroy performance. They should usually be wrapped in `NgZone.runOutsideAngular` via an RxJS `fromEvent`.

## 6. Testing (Brittle Suites)
Angular tests are notoriously brittle. Lints here can save hours of maintenance.

*   **`test-prefer-harnesses`**:
    *   *Description*: Flags the use of raw DOM querying (e.g., `fixture.debugElement.query(By.css('.my-btn'))`) when an Angular Material/CDK Test Harness could be used instead.
    *   *Objective*: Makes tests significantly more resilient to underlying component DOM changes.
*   **`test-no-fake-async-with-done`**:
    *   *Description*: Flags mixing `fakeAsync` with a `done()` callback in Jasmine/Jest.
    *   *Objective*: Prevents a common developer error that causes silent test failures, false positives, or timeouts.

---

### Priority Implementation Recommendations

Based on developer impact, the following three rules are recommended to be implemented first:

1.  **`template-no-getters-in-binding`**: A "silent performance killer" that perfectly complements the existing `no-call-expression` rule.
2.  **`router-avoid-snapshot-in-component`**: Targets one of the most frequently encountered bugs and most asked questions on StackOverflow regarding stale component data on route changes.
3.  **`dom-avoid-window-host-listener`**: Instantly improves the scroll and interaction performance of the app by identifying the source of change-detection spam.
