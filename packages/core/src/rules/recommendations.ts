/**
 * Rule Recommendations
 *
 * Actionable, one-sentence fix recommendations surfaced in --verbose output.
 * Keys must match the ruleName field on RuleFailure exactly.
 */
export const RECOMMENDATIONS: Readonly<Record<string, string>> = {
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
};
