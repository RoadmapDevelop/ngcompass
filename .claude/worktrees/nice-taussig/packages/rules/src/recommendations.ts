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
        'For reactive data streams (state derived from observables), use `toSignal()` or the `async` pipe. For imperative user-triggered actions (save, dialog, navigation), a subscription is acceptable — add `takeUntilDestroyed()` for long-lived streams.',
    'template-trackby-required-for-ngfor':
        'Add a `trackBy` function to `*ngFor` to help Angular identify which items have changed and avoid unnecessary DOM recreations.',
    'template-no-object-literal-binding':
        'Avoid binding object literals directly in templates as they create new instances on every change detection cycle. Use a signal or state property instead.',
    'template-no-array-literal-binding':
        'Avoid binding array literals directly in templates as they create new instances on every change detection cycle. Use a signal or state property instead.',
    'toSignal-require-initialValue':
        'Provide an `initialValue` to `toSignal()` to ensure the signal has a valid state before the observable emits and to avoid unnecessary `undefined` types.',
    'rxjs-avoid-subject-as-event-bus':
        'For component UI state, replace `Subject` with a `signal()`. For complex async pipelines (debounce, switchMap), move the Subject and its pipeline into a dedicated service. `@Input()` setter bridges are intentionally excluded from this rule.',
    'signal-no-side-effects-in-computed':
        'Computed signals must be pure. Move side effects like HTTP calls or state mutations to an `effect()` or a method.',
    'signal-no-writes-in-computed':
        'Avoid writing to other signals (e.g., via .set() or .update()) inside a computed signal to prevent reactive cycles.',
    'prefer-inject-over-constructor-di':
        'Use the `inject()` function instead of constructor parameters for dependency injection to improve compatibility with Signals and functional patterns.',
    'component-no-manual-detect-changes':
        'Avoid manual change detection calls like `detectChanges()` or `markForCheck()`. Use Signals to drive UI updates automatically and reliably.',
    'rxjs-require-takeUntilDestroyed':
        'Add `takeUntilDestroyed()` to long-lived subscriptions (WebSocket streams, polling, event buses) to prevent memory leaks. One-shot HTTP calls that auto-complete are exempt — they carry no leak risk.',
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
    'template-prefer-control-flow':
        'Replace legacy structural directives (*ngIf, *ngFor, *ngSwitch) with Angular 17+ built-in control flow blocks (@if, @for, @switch) for better performance, type-narrowing, and tree-shaking.',
    'signal-prefer-input-signal':
        'Replace `@Input()` decorators with the `input()` / `input.required()` signal function (Angular 17.1+) for reactive, type-safe component inputs that integrate seamlessly with the signal graph.',
    'signal-prefer-output-function':
        'Replace `@Output() EventEmitter` with the `output()` function (Angular 17.3+) to align with the signal-based API and remove the need for `EventEmitter` boilerplate.',
    'no-bypass-sanitization':
        'Avoid `bypassSecurityTrust*` methods. Use Angular\'s built-in sanitization or a trusted server-side pipeline instead. If you must bypass, ensure the value is provably safe and document why.',
    'rxjs-no-nested-subscribe':
        'Replace nested `.subscribe()` calls with a flattening operator: `switchMap` (cancel on new emission), `mergeMap` (concurrent), or `concatMap` (sequential) to compose streams declaratively.',
    'no-document-access':
        'Inject `DOCUMENT` from `@angular/common` for DOM access, or wrap browser-only code in `afterNextRender()` / `isPlatformBrowser()` / `!isPlatformServer()` to ensure compatibility with Angular SSR.',
    'template-no-unsafe-bindings':
        'Avoid binding unsanitized values to `[innerHTML]`, `[outerHTML]`, or `[srcdoc]`. Use Angular\'s DomSanitizer with a SafeHtml pipe, or restructure the template to avoid raw HTML injection.',
    'signal-prefer-model':
        'Replace the `@Input() x` + `@Output() xChange` two-way binding pair with the `model()` signal (Angular 17.2+) for concise, type-safe two-way data flow.',
    'prefer-after-render-over-after-view-init':
        'Move DOM access from `ngAfterViewInit` / `ngAfterContentInit` into `afterNextRender()` so the code only runs in the browser and remains safe in Angular SSR environments.',
    'spec-no-focused-test':
        'Remove focused (`fdescribe`, `fit`, `describe.only`, `it.only`) and disabled (`xdescribe`, `xit`) test helpers before committing. Focused tests silently exclude the rest of the suite; disabled tests are easily forgotten.',
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

    'rxjs-no-subscribe-in-component': `// Reactive state (data derived from a stream) → use toSignal() or async pipe:
// Before:
ngOnInit() { this.data$.subscribe(val => this.value = val); }
// After:
value = toSignal(this.data$, { initialValue: defaultVal });

// Imperative action (user-triggered, one-shot) → subscription is fine, add teardown:
// Before:
onSave() { this.api.save(this.form.value).subscribe(res => this.notify(res)); }
// After (HTTP auto-completes — takeUntilDestroyed optional but harmless):
onSave() {
  this.api.save(this.form.value)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(res => this.notify(res));
}`,

    'rxjs-avoid-subject-as-event-bus': `// Case A — UI state: replace with signal()
// Before:
private loading$ = new Subject<boolean>();
// After:
loading = signal(false);

// Case B — complex async pipeline: move to a service
// Before (in component):
private search$ = new Subject<string>();
ngOnInit() { this.search$.pipe(debounceTime(300), switchMap(...)).subscribe(...); }
// After:
// SearchService owns search$ and the pipeline; component calls searchSvc.search(term)

// Note: @Input() setter bridges are intentionally exempt:
// @Input() set query(v: string) { this.search$.next(v); }  ← allowed`,

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

    'template-prefer-control-flow': `// Before:
<div *ngIf="isLoggedIn">Welcome</div>
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>

// After:
@if (isLoggedIn) { <div>Welcome</div> }
@for (item of items; track item.id) { <li>{{ item.name }}</li> }`,

    'signal-prefer-input-signal': `// Before:
@Input() title: string = '';
@Input() required count!: number;

// After:
title = input('');
count = input.required<number>();`,

    'signal-prefer-output-function': `// Before:
@Output() selected = new EventEmitter<Item>();

// After:
selected = output<Item>();`,

    'rxjs-no-nested-subscribe': `// Before:
this.user$.subscribe(user => {
  this.posts$.subscribe(posts => {
    this.render(user, posts);
  });
});

// After:
this.user$.pipe(
  switchMap(user => this.posts$.pipe(map(posts => ({ user, posts }))))
).subscribe(({ user, posts }) => this.render(user, posts));`,

    'no-document-access': `// Before:
ngOnInit() {
  document.title = this.title;
}

// After (inject DOCUMENT):
private doc = inject(DOCUMENT);
ngOnInit() { this.doc.title = this.title; }

// Or (SSR-safe browser-only block):
afterNextRenderEffect = afterNextRender(() => {
  document.title = this.title;
});`,

    'signal-prefer-model': `// Before:
@Input() value: string = '';
@Output() valueChange = new EventEmitter<string>();

// After:
value = model('');
// Parent template: <app-input [(value)]="parentValue" />`,

    'prefer-after-render-over-after-view-init': `// Before:
ngAfterViewInit() {
  this.el.nativeElement.focus();
}

// After:
constructor() {
  afterNextRender(() => {
    this.el.nativeElement.focus();
  });
}`,

    'spec-no-focused-test': `// Before (focused — skips all other tests):
fdescribe('MyComponent', () => {
  fit('should render', () => { ... });
});

// Before (disabled — easily forgotten):
xdescribe('MyComponent', () => {
  xit('should render', () => { ... });
});

// After:
describe('MyComponent', () => {
  it('should render', () => { ... });
});`,
};
