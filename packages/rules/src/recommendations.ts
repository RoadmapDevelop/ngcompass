export const RECOMMENDATIONS: Readonly<Record<string, string>> = {
  'prefer-on-push-component-change-detection':
    'Add `changeDetection: ChangeDetectionStrategy.OnPush` to the component metadata.',
  'template-no-call-expression':
    'Move the value to a pipe, computed signal, or cached component property.',
  'rxjs-no-subscribe-in-component':
    'Use `toSignal()` or the `async` pipe for view state; add `takeUntilDestroyed()` for long-lived imperative subscriptions.',
  'template-trackby-required':
    'Add `trackBy` to `*ngFor`, or use `track` when migrating to `@for`.',
  'template-trackby-required-for-ngfor':
    'Add `trackBy` to `*ngFor`, or use `track` when migrating to `@for`.',
  'template-no-object-literal-binding':
    'Move the object to a component property, signal, computed value, or pure pipe.',
  'template-no-array-literal-binding':
    'Move the array to a component property, signal, computed value, or pure pipe.',
  'toSignal-require-initialValue':
    'Pass `{ initialValue }` or `{ requireSync: true }` so the signal has a stable type.',
  'rxjs-avoid-subject-as-event-bus':
    'Use `signal()` for component UI state; move complex async pipelines into a service.',
  'signal-no-side-effects-in-computed':
    'Move side effects to an `effect()` or method, and keep `computed()` pure.',
  'signal-no-writes-in-computed':
    'Move `.set()` or `.update()` calls to an `effect()` or event handler.',
  'prefer-inject-over-constructor-di':
    'Replace constructor parameters with field initializers that call `inject()`.',
  'component-no-manual-detect-changes':
    'Use signals, `async` pipe, or input-driven state instead of calling `detectChanges()` or `markForCheck()`.',
  'rxjs-require-takeUntilDestroyed':
    'Add `takeUntilDestroyed()` or another teardown operator before `subscribe()`.',
  'template-no-async-pipe-duplication':
    'Store the async value once with `@if (... | async; as value)` or a view-model signal.',
  'rxjs-prefer-toSignal-for-template-state':
    'Convert template-used observables to `toSignal()` and read them as signals in the template.',
  'signal-effect-must-be-destroy-scoped':
    'Create the effect in an injection context or pass an explicit `{ injector }`.',
  'signal-no-effect-in-constructor':
    'Move the `effect()` call to a field initializer.',
  'signal-prefer-computed-over-sync-effect':
    'Replace the write-producing `effect()` with a `computed()` signal.',
  'signal-avoid-untracked-overuse':
    'Remove `untracked()` unless the dependency must be intentionally ignored.',
  'template-prefer-control-flow':
    'Replace the legacy directive with the matching `@if`, `@for`, or `@switch` block.',
  'signal-prefer-input-signal':
    'Replace `@Input()` with `input()` or `input.required()`.',
  'signal-prefer-output-function':
    'Replace `@Output() EventEmitter` with `output<T>()`.',
  'no-bypass-sanitization':
    'Use Angular sanitization or a trusted server-side sanitizer instead of `bypassSecurityTrust*`.',
  'rxjs-no-nested-subscribe':
    'Flatten the stream with `switchMap`, `mergeMap`, `concatMap`, or `exhaustMap`.',
  'no-document-access':
    'Inject `DOCUMENT` or move browser-only DOM work into `afterNextRender()`.',
  'template-no-unsafe-bindings':
    'Sanitize the value before binding, or replace the raw HTML binding with structured template content.',
  'signal-prefer-model':
    'Replace the `@Input()` / `@Output()Change` pair with `model()`.',
  'prefer-after-render-over-after-view-init':
    'Move browser-only DOM access into `afterNextRender()`.',
  'spec-no-focused-test':
    'Replace focused or disabled test helpers with normal `describe` and `it` calls.',
  'no-ngzone':
    'Remove NgZone injections and runOutsideAngular/run calls.',
  'template-no-async-pipe':
    'Avoid using async pipe in templates for zoneless applications; use toSignal() in component instead.',
  'no-changedetectorref':
    'Remove inject(ChangeDetectorRef); rely on signals to update the UI.',
  'no-content-decorator':
    'Replace @ContentChild()/@ContentChildren() with contentChild()/contentChildren().',
  'no-detectchanges-testing':
    'Replace fixture.detectChanges() with `await fixture.whenStable()`.',
  'no-directive-accessor':
    'Use computed() for UI-bound derived values; mark internal getters/setters private.',
  'no-directive-writable-property':
    'Mark public/protected properties readonly and back them with signal(), or make them private.',
  'no-ngoninit':
    'Remove ngOnInit; initialize state in field initializers or with rxResource()/computed().',
  'no-ngonchanges':
    'Remove ngOnChanges; derive state from input() signals with computed().',
  'no-ngdocheck':
    'Remove ngDoCheck; signals already track changes automatically.',
  'no-ngaftercontentinit':
    'Remove ngAfterContentInit; derive content state with contentChild()/computed().',
  'no-ngaftercontentchecked':
    'Remove ngAfterContentChecked; derive content state with contentChild()/computed().',
  'no-ngafterviewinit':
    'Remove ngAfterViewInit; use afterNextRender() for DOM access or computed() for derived view state.',
  'no-ngafterviewchecked':
    'Remove ngAfterViewChecked; derive view state with viewChild()/computed().',
  'no-ngondestroy':
    'Remove ngOnDestroy; use takeUntilDestroyed() or DestroyRef.onDestroy() for the rare manual cleanup.',
  'no-ngzone-testing':
    'Remove fixture.ngZone usage; it is null in a zoneless application.',
  'no-providezonechangedetection':
    'Remove provideZoneChangeDetection() from the bootstrap providers.',
  'no-reactive-forms':
    'Use signal forms (form()) instead of FormGroup/FormControl/FormArray/FormBuilder.',
  'no-view-decorator':
    'Replace @ViewChild()/@ViewChildren() with viewChild()/viewChildren().',
  'no-zonejs-import':
    "Remove `import 'zone.js'` from polyfills; the entry should not load zone.js.",
  'no-zonejs-testing-functions':
    'Replace fakeAsync()/tick()/flush()/waitForAsync() with async/await + fixture.whenStable().',
};

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

  'no-ngzone': `// Before (NgZone injection is dead code in zoneless):
@Component({ template: '' })
export class MyComponent {
  constructor(private zone: NgZone) {}
}

// After:
@Component({ template: '' })
export class MyComponent {
  constructor() {}
}`,
  'template-no-async-pipe': `Before:
@Component({
  template: '<div>{{ user$ | async }}</div>'
})
export class UserComponent {
  user$ = this.userService.getUser();
}

After:
@Component({
  template: '<div>{{ user() }}</div>'
})
export class UserComponent {
  user = toSignal(this.userService.getUser());
}`,
};
