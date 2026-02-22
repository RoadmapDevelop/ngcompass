/**
 * Rule Recommendations
 *
 * Actionable, one-sentence fix recommendations surfaced in reporter output.
 * Keys must match the ruleName field on RuleFailure exactly.
 */
export const RECOMMENDATIONS: Readonly<Record<string, string>> = {
    'prefer-on-push-component-change-detection':
        'Enable `ChangeDetectionStrategy.OnPush` to minimize re-renders and rely on explicit input changes or async signals.',
    'template-no-call-expression':
        'Function calls in templates are executed on every change detection cycle.',
    'rxjs-no-subscribe-in-component':
        'Replace manual subscriptions with `toSignal()` or the `async` pipe to ensure automatic teardown and Signal compatibility.',
    'rxjs-avoid-behaviorsubject-for-local-state':
        'Replace BehaviorSubject with a Signal for local state to improve performance and simplify reactivity.',
    'template-trackby-required-for-ngfor':
        'Add a `trackBy` function to `*ngFor` to help Angular identify which items have changed and avoid unnecessary DOM recreations.',
    'template-no-object-literal-binding':
        'Avoid binding object literals directly in templates as they create new instances on every change detection cycle. Use a signal or state property instead.',
    'template-no-array-literal-binding':
        'Avoid binding array literals directly in templates as they create new instances on every change detection cycle. Use a signal or state property instead.',
    'toSignal-require-initialValue':
        'Provide an `initialValue` to `toSignal()` to ensure the signal has a valid state before the observable emits and to avoid unnecessary `undefined` types.',
    'rxjs-avoid-subject-as-event-bus':
        'Avoid using `Subject` as a local event bus. Direct event handlers or Signals are preferred for simpler, more performant communication.',
    'signal-no-side-effects-in-computed':
        'Computed signals must be pure. Move side effects like HTTP calls or state mutations to an `effect()` or a method.',
    'signal-no-writes-in-computed':
        'Avoid writing to other signals (e.g., via .set() or .update()) inside a computed signal to prevent reactive cycles.',
    'prefer-inject-over-constructor-di':
        'Use the `inject()` function instead of constructor parameters for dependency injection to improve compatibility with Signals and functional patterns.',
    'component-no-manual-detect-changes':
        'Avoid manual change detection calls like `detectChanges()` or `markForCheck()`. Use Signals to drive UI updates automatically and reliably.',
    'rxjs-require-takeUntilDestroyed':
        'Use `takeUntilDestroyed()` operator to ensure subscriptions are automatically cleaned up when the component is destroyed. Note: If used outside the constructor, you must provide a `DestroyRef`.',
    'template-no-async-pipe-duplication':
        'Avoid multiple `async` pipe subscriptions to the same observable. Use `@if (obs$ | async; as value)` or a view-model signal to share the subscription.',
    'rxjs-prefer-toSignal-for-template-state':
        'Convert template-only Observables to Signals using `toSignal()` to benefit from cleaner syntax and better performance.',
    'signal-effect-must-be-destroy-scoped':
        'Ensure `effect()` is created within an injection context (like a constructor or field initializer) or provided with a `DestroyRef` to ensure proper cleanup.',
    'signal-no-effect-in-constructor':
        'Move `effect()` from the constructor to a field initializer for better readability and consistent lifecycle behavior.',
    'signal-prefer-computed-over-sync-effect':
        'Use `computed()` instead of an `effect()` that manually updates another signal. Computed signals are more efficient and prevent reactive cycles.',
    'signal-avoid-untracked-overuse':
        'Use `untracked()` sparingly. Overusing it can mask reactive dependencies and lead to subtle bugs in signal derivations.',
};
