# Angular Signals Migration Ruleset (Top 20 Rules)

This ruleset is designed specifically for **legacy Angular projects migrating to Signals**.
It focuses on eliminating performance bottlenecks, preventing memory leaks, and enabling a smooth transition from RxJS-heavy, Default Change Detection architectures to modern Signal-based Angular.

---

# Goals

* Reduce change detection cost
* Replace RxJS local state with Signals
* Prevent reactive anti-patterns during migration
* Improve template performance
* Eliminate memory leaks
* Prepare codebase for full Signal adoption

---

# Rule 1 — template-no-function-call-in-binding [Implemented]

**Detect**

```html
{{ computeValue() }}
<div [class]="getClass()"></div>
```

**Why**

Functions execute on every change detection cycle.

**Migration**

Use computed signals:

```ts
readonly className = computed(() => computeClass());
```

```html
<div [class]="className()"></div>
```

---

# Rule 2 — component-prefer-onpush [Implemented]

**Detect**

```ts
@Component({
  selector: 'app-example'
})
```

**Why**

Default change detection is expensive.

**Migration**

```ts
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush
})
```

---

# Rule 3 — template-trackby-required-for-ngfor [Implemented]

**Detect**

```html
<div *ngFor="let item of items">
```

**Why**

Without trackBy, Angular recreates DOM unnecessarily.

**Migration**

```html
<div *ngFor="let item of items; trackBy: trackById">
```

---

# Rule 4 — template-no-object-literal-binding [Implemented]

**Detect**

```html
<div [style]="{ color: 'red' }">
```

**Why**

Creates new object every change detection cycle.

**Migration**

```ts
readonly style = signal({ color: 'red' });
```

---

# Rule 5 — template-no-array-literal-binding [Implemented]

**Detect**

```html
<div [items]="[1,2,3]">
```

**Why**

Creates new array every cycle.

**Migration**

```ts
readonly items = signal([1,2,3]);
```

---

# Rule 6 — template-no-async-pipe-duplication [Implemented]

**Detect**

```html
{{ user$ | async }}
{{ user$ | async }}
```

**Why**

Creates multiple subscriptions.

**Migration**

```html
@let user = user$ | async;
{{ user.name }}
```

Or

```ts
readonly user = toSignal(user$, { initialValue: null });
```

---

# Rule 7 — rxjs-no-subscribe-in-component [Implemented]

**Detect**

```ts
this.service.get().subscribe(...)
```

**Why**

Manual subscription leads to leaks.

**Migration**

```ts
readonly data = toSignal(this.service.get(), { initialValue: null });
```

---

# Rule 8 — rxjs-require-takeUntilDestroyed [Implemented]

**Detect**

```ts
observable.subscribe(...)
```

without teardown.

**Why**

Memory leak risk.

**Migration**

```ts
observable.pipe(takeUntilDestroyed()).subscribe(...)
```

---

# Rule 9 — rxjs-prefer-toSignal-for-template-state

**Detect**

Observable used only for template rendering.

**Migration**

```ts
readonly users = toSignal(users$);
```

---

# Rule 10 — rxjs-avoid-behaviorsubject-for-local-state [Implemented]

**Detect**

```ts
private count$ = new BehaviorSubject(0);
```

**Migration**

```ts
readonly count = signal(0);
```

---

# Rule 11 — rxjs-avoid-subject-as-event-bus [Implemented]

**Detect**

```ts
private click$ = new Subject<void>();
```

**Migration**

Use signals or direct event handlers.

---

# Rule 12 — signal-no-side-effects-in-computed [Implemented]

**Detect**

```ts
computed(() => {
  this.http.get(...);
});
```

**Why**

Computed must be pure.

---

# Rule 13 — signal-no-writes-in-computed [Implemented]

**Detect**

```ts
computed(() => {
  this.count.set(5);
});
```

**Why**

Creates reactive cycles.

---

# Rule 14 — signal-effect-must-be-destroy-scoped

**Detect**

Effects outside lifecycle scope.

**Migration**

Ensure effect runs within injection context.

---

# Rule 15 — signal-no-effect-in-constructor

**Detect**

```ts
constructor() {
  effect(...)
}
```

**Migration**

Move to field initializer or ngOnInit.

---

# Rule 16 — signal-prefer-computed-over-sync-effect

**Detect**

```ts
effect(() => {
  derived.set(source() * 2);
});
```

**Migration**

```ts
readonly derived = computed(() => source() * 2);
```

---

# Rule 17 — signal-avoid-untracked-overuse

**Detect**

```ts
untracked(() => this.count())
```

without clear reason.

**Why**

Breaks reactivity.

---

# Rule 18 — toSignal-require-initialValue [Implemented]

**Detect**

```ts
readonly data = toSignal(data$);
```

**Migration**

```ts
readonly data = toSignal(data$, { initialValue: null });
```

---

# Rule 19 — component-no-manual-detectChanges [Implemented]

**Detect**

```ts
cdr.detectChanges();
```

**Why**

Signals should drive updates.

---

# Rule 20 — prefer-inject-over-constructor-di [Implemented]

**Detect**

```ts
constructor(private service: DataService) {}
```

**Migration**

```ts
private service = inject(DataService);
```

---

# Recommended Severity Levels

| Severity | Meaning                   |
| -------- | ------------------------- |
| error    | must fix before migration |
| moderate | strongly recommended      |
| advice   | improves signal adoption  |

---

# Migration Priority Order

Start with:

1. template-no-function-call-in-binding
2. component-prefer-onpush
3. rxjs-no-subscribe-in-component
4. rxjs-avoid-behaviorsubject-for-local-state
5. template-trackby-required-for-ngfor
6. signal-no-side-effects-in-computed

---

# Expected Benefits After Applying These Rules

* 30–70% reduction in change detection cost
* Significant memory leak reduction
* Cleaner reactive architecture
* Easier migration to full Signals
* Improved runtime performance

---

# End of Migration Ruleset
