/**
 * Rule Recommendations
 *
 * Actionable, one-sentence fix recommendations surfaced in reporter output.
 * Keys must match the ruleName field on RuleFailure exactly.
 */
export const RECOMMENDATIONS: Readonly<Record<string, string>> = {

    // ── Phase 0: P0 — Migration Blockers ────────────────────────────────────

    'prefer-on-push-component-change-detection':
        'Enable `ChangeDetectionStrategy.OnPush` to minimize re-renders and rely on explicit input changes or async signals.',

    'prefer-standalone':
        'Add `standalone: true` and move imports to component metadata for a tree-shakable, NgModule-free architecture.',

    'prefer-signal-inputs':
        'Replace `@Input()` with `input<T>()` signals for type-safe, reactive, and lazily-evaluated bindings.',

    'template-no-call-expression':
        'Move function calls to memoized getters, pure pipes, or `computed()` signals to prevent re-execution on every change cycle.',

    'template-prefer-control-flow':
        'Migrate `*ngIf`, `*ngFor`, and `*ngSwitch` to built-in `@if`, `@for`, and `@switch` blocks for better type-narrowing and smaller bundles.',

    // ── Phase 0: P1 — High-ROI Quick Wins ───────────────────────────────────

    'rxjs-no-nested-subscribe':
        'Use flattening operators like `switchMap` or `concatMap` instead of nested `subscribe` calls to prevent leaks.',

    'template-use-track-by-function':
        'Add `track item.id` (in `@for`) or `trackBy` function (in `*ngFor`) to optimize list reconciliation.',

    'no-input-rename':
        'Remove aliases from `@Input` and match property names to binding attributes for clarity and safer refactoring.',

    'component-selector':
        'Rename selector to use the configured prefix and kebab-case (e.g., `app-my-component`) to prevent collisions.',

    'directive-selector':
        'Rename selector to use configured camelCase prefix (e.g., `[appMyDirective]`) for consistency.',

    'rxjs-prefer-takeuntil':
        'Use `takeUntil(destroy$)` or `takeUntilDestroyed()` to automatically close subscriptions and prevent memory leaks.',

    // ── Phase 1: P2 — Migration Support ─────────────────────────────────────

    'prefer-signal-queries':
        'Replace `@ViewChild()` / `@ContentChild()` with signal-based `viewChild()` / `contentChild()` for lazy, reactive queries (Angular 17+).',

    'use-inject':
        'Replace constructor parameter injection with the `inject()` function for cleaner, inheritance-friendly, and more testable dependency injection.',

    'no-attribute-decorator':
        'Replace `@Attribute()` with `@Input()` or `input()` signals — they participate in change detection and the reactive graph.',

    'template-no-negated-async':
        'Replace `!(obs$ | async)` with an explicit null check like `(obs$ | async) === null` to avoid false positives before the observable emits.',

    'rxjs-no-create':
        'Replace `Observable.create(fn)` (removed in RxJS 7) with `new Observable(fn)` — identical semantics, modern syntax.',

    // ── Phase 1: P3 — Code Quality & Safety ─────────────────────────────────

    'implements-on-destroy':
        'Add `implements OnDestroy` to the class declaration so TypeScript enforces the correct method signature and tooling recognises the lifecycle hook.',

    'no-output-native':
        'Rename the output to avoid colliding with the native DOM event — prefix it with the component name (e.g., `buttonClick` instead of `click`).',

    'no-conflicting-lifecycle':
        'Choose one lifecycle hook for each concern: use `ngOnChanges` for input reactions or `ngDoCheck` for custom dirty-checking, not both.',

    'template-no-duplicate-attributes':
        'Remove the duplicate attribute — the browser silently ignores all but the first occurrence, making the second binding dead code.',

    'no-empty-lifecycle-method':
        'Remove the empty lifecycle method — Angular handles absent hooks gracefully and the empty body adds noise without effect.',

    // ── Phase 1: P4 — Naming & Conventions ──────────────────────────────────

    'component-class-suffix':
        'Rename the class to end with `Component` (e.g., `UserProfileComponent`) following Angular Style Guide rule 02-03.',

    'directive-class-suffix':
        'Rename the class to end with `Directive` (e.g., `HighlightDirective`) following Angular Style Guide rule 02-03.',

    'no-output-on-prefix':
        'Remove the `on` prefix from the output name (e.g., rename `onSave` → `save`) — template consumers add their own `on` prefix in handlers.',

    'no-output-rename':
        'Remove the alias from `@Output()` so the binding name matches the property name, keeping the API predictable and refactoring-safe.',
};
