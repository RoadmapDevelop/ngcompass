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

/**
 * Optional before/after code examples for rules that have no auto-fix.
 *
 * Keys must match the ruleName field on RuleFailure exactly.
 * Values are plain multi-line TypeScript strings — no ANSI codes.
 * The reporter renders them in a styled block below the fix recommendation.
 */
export const CODE_EXAMPLES: Readonly<Record<string, string>> = {
    'prefer-on-push-component-change-detection': `// Before:
@Component({ selector: 'app-foo', template: '...' })
export class FooComponent { }

// After:
@Component({
  selector: 'app-foo',
  template: '...',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooComponent { }`,

    'rxjs-no-subscribe-in-component': `// Before:
ngOnInit() {
  this.data$.subscribe(val => this.value = val);
}

// After (option A - toSignal):
value = toSignal(this.data$, { initialValue: defaultVal });

// After (option B - async pipe):
// In template: {{ data$ | async }}`,

    'rxjs-avoid-behaviorsubject-for-local-state': `// Before:
private count$ = new BehaviorSubject<number>(0);

// After:
count = signal(0);`,

    'rxjs-avoid-subject-as-event-bus': `// Before:
private click$ = new Subject<void>();

// After:
onClick() { /* handle directly */ }`,

    'prefer-inject-over-constructor-di': `// Before:
constructor(private http: HttpClient, private router: Router) { }

// After:
private http = inject(HttpClient);
private router = inject(Router);`,

    'component-no-manual-detect-changes': `// Before:
this.cdr.detectChanges();
this.cdr.markForCheck();

// After:
// Use signals for reactive state:
count = signal(0);
// Template automatically updates when signal changes`,

    'rxjs-require-takeUntilDestroyed': `// Before:
this.data$.subscribe(val => this.process(val));

// After:
this.data$.pipe(
  takeUntilDestroyed(this.destroyRef)
).subscribe(val => this.process(val));`,

    'template-no-async-pipe-duplication': `// Before:
<div>{{ user$ | async }}</div>
<span>{{ user$ | async }}</span>

// After:
@if (user$ | async; as user) {
  <div>{{ user }}</div>
  <span>{{ user }}</span>
}`,

    'signal-no-side-effects-in-computed': `// Before:
total = computed(() => {
  this.logger.log('computing');  // side effect!
  return this.price() * this.qty();
});

// After:
total = computed(() => this.price() * this.qty());`,

    'signal-no-writes-in-computed': `// Before:
derived = computed(() => {
  const val = this.source();
  this.other.set(val * 2);  // write inside computed!
  return val;
});

// After:
derived = computed(() => this.source());
// Use effect() for the write:
syncEffect = effect(() => this.other.set(this.source() * 2));`,

    'signal-effect-must-be-destroy-scoped': `// Before:
ngAfterViewInit() {
  effect(() => console.log(this.count()));  // no injection context!
}

// After (option A - field initializer):
logEffect = effect(() => console.log(this.count()));

// After (option B - explicit injector):
ngAfterViewInit() {
  effect(() => console.log(this.count()), { injector: this.injector });
}`,

    'signal-no-effect-in-constructor': `// Before:
constructor() {
  effect(() => console.log(this.count()));
}

// After:
logEffect = effect(() => console.log(this.count()));`,

    'signal-prefer-computed-over-sync-effect': `// Before:
logEffect = effect(() => {
  const total = this.price() * this.qty();
  this.total.set(total);
});

// After:
total = computed(() => this.price() * this.qty());`,

    'toSignal-require-initialValue': `// Before:
data = toSignal(this.data$);  // Signal<T | undefined>

// After:
data = toSignal(this.data$, { initialValue: [] });  // Signal<T>`,

    'template-no-call-expression': `// Before:
<div>{{ getLabel(item) }}</div>

// After (option A - pipe):
<div>{{ item | labelPipe }}</div>

// After (option B - signal):
label = computed(() => this.getLabel(this.item()));`,

    'template-no-object-literal-binding': `// Before:
<app-child [config]="{ color: 'red', size: 10 }"></app-child>

// After:
childConfig = signal({ color: 'red', size: 10 });
// template: <app-child [config]="childConfig()"></app-child>`,

    'template-no-array-literal-binding': `// Before:
<app-child [items]="[1, 2, 3]"></app-child>

// After:
items = signal([1, 2, 3]);
// template: <app-child [items]="items()"></app-child>`,

    'template-trackby-required-for-ngfor': `// Before:
<div *ngFor="let item of items">{{ item.name }}</div>

// After:
<div *ngFor="let item of items; trackBy: trackById">{{ item.name }}</div>

// Or with @for (Angular 17+):
@for (item of items; track item.id) {
  <div>{{ item.name }}</div>
}`,

    'rxjs-prefer-toSignal-for-template-state': `// Before:
data$ = this.http.get('/api/data').pipe(shareReplay(1));
// template: {{ data$ | async }}

// After:
data = toSignal(this.http.get('/api/data'), { initialValue: null });
// template: {{ data() }}`,

    'signal-avoid-untracked-overuse': `// Acceptable:
effect(() => {
  const value = this.count();
  untracked(() => this.analytics.track(value));
});

// Questionable (review if untracked is needed):
const val = untracked(() => this.count());`,
};
