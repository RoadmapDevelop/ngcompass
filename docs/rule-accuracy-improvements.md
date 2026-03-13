# Rule Accuracy Improvements Through Contextual Awareness

## Per-Rule Analysis: What Context Would Fix, and Why

---

## Impact Classification

| Tier | Meaning | Rules |
|------|---------|-------|
| **S** | Contextual awareness transforms the rule from "noisy guess" to "precise diagnostic" | 3 rules |
| **A** | Significant false-positive/negative reduction (>40% estimated) | 4 rules |
| **B** | Moderate accuracy gain, currently "good enough" but improvable | 3 rules |
| **C** | Minimal benefit — rule is already accurate at single-file level | 2 rules |

---

## S-TIER: Transformative Accuracy Gains

---

### 1. `rxjs-prefer-to-signal-for-template-state`

**Current accuracy: LOW (~50-60%)**

**What it does today:**
Flags class properties ending with `$` that look like observables (type annotation, `new Subject()`, `.pipe()` initializer). Suggests converting to Signal via `toSignal()`.

**The core problem — it guesses whether the observable is used in the template:**

```typescript
// FLAGGED — but this is NEVER used in the template. Pure false positive.
@Component({ ... })
export class UserComponent {
  private refreshTimer$ = interval(30000).pipe(takeUntilDestroyed());  // ← internal mechanism
}

// NOT FLAGGED — but this IS used in template via async pipe. False negative.
@Component({ template: '{{ userData | async }}' })
export class UserComponent {
  userData = this.http.get('/api/user');  // ← no $ suffix, no type annotation
}
```

**What context fixes:**

| Context Layer | What It Unlocks | Accuracy Impact |
|---|---|---|
| **Template ↔ Component cross-ref (CTX-003)** | Actually scan the template for `| async` pipes referencing this property | Eliminates ~80% of false positives (private/internal observables) |
| **Template cross-ref** | Detect observables used in template WITHOUT `$` suffix or type annotation | Eliminates ~60% of false negatives |
| **Import graph (CTX-002)** | Check if the observable is exposed to other components via `@Output()` or service | Prevents flagging legitimate reactive APIs |
| **TypeChecker** | Verify the property is actually `Observable<T>` vs a custom class with `.pipe()` | Eliminates type-confusion false positives |

**Concrete improvement:**

```typescript
// TODAY: Rule sees class property with $ suffix → flags it
// WITH CONTEXT: Rule checks template → "userData$" appears as "{{ userData$ | async }}"
//   → YES, template state → flag with HIGH confidence
//   OR: "refreshTimer$" does NOT appear in template
//   → NO, internal mechanism → SKIP

// The rule becomes: "Observable properties ACTUALLY CONSUMED in template via async pipe
// should migrate to toSignal()" — a precise, actionable diagnostic.
```

**Ticket: RULE-ACC-001**

> **Title:** Add template cross-reference to `rxjs-prefer-to-signal-for-template-state`
>
> **Priority:** Critical | **Effort:** M | **Depends on:** CTX-003
>
> **Changes:**
> 1. In rule metadata, declare `requires: { projectContext: true }` (or a narrower `crossRef: true`)
> 2. In handler, access `context.crossRef.templateReferences`
> 3. Only flag properties that appear in the template with `| async`
> 4. Add `confidence: 'high'` when template-verified, `confidence: 'low'` when falling back to heuristic (no cross-ref available)
> 5. Detect observables without `$` suffix that ARE used in template with `| async`
>
> **Expected accuracy:** ~50-60% → ~90-95%
>
> **Acceptance criteria:**
> - [ ] Rule only flags observables actually consumed in template via `| async`
> - [ ] Rule detects template-bound observables regardless of naming convention
> - [ ] Inline templates (`template: '...'`) and external templates (`.html`) both handled
> - [ ] Fallback to current heuristic when cross-ref unavailable (graceful degradation)

---

### 2. `template-no-call-expression`

**Current accuracy: LOW (~40-50%)**

**What it does today:**
Flags function calls with arguments in Angular templates. Maintains a hardcoded whitelist of "safe" methods (`translate`, `slice`, `toString`, `toUpperCase`, etc.). Everything else is flagged.

**The core problem — it can't distinguish pure methods from impure ones:**

```html
<!-- FLAGGED — but this is a Signal read. Completely safe. Zero CD cost. -->
<div>{{ userName() }}</div>

<!-- FLAGGED — but this is a pure pipe. Safe. -->
<span>{{ amount | currency:'USD' }}</span>

<!-- NOT FLAGGED — in the whitelist, but the custom toString() has side effects -->
<span>{{ tracker.toString() }}</span>

<!-- FLAGGED — but getDisplayName() is a memoized pure getter. Safe. -->
<h1>{{ user.getDisplayName('short') }}</h1>
```

**What context fixes:**

| Context Layer | What It Unlocks | Accuracy Impact |
|---|---|---|
| **Template ↔ Component cross-ref (CTX-003)** | Check if the called method is a Signal (zero-arg call = signal read) | Eliminates the entire class of Signal false positives |
| **TypeChecker (existing)** | Resolve method return type — is it a `Signal<T>`? | High-confidence signal detection |
| **Cross-ref + class analysis** | Check if method is a getter, pure function, or has side effects | Eliminates ~50% of pure-method false positives |

**Concrete improvement:**

```typescript
// TODAY: Template has {{ userName() }} → "function call in template!" → false positive
// WITH CONTEXT:
//   1. Cross-ref finds `userName` in component class
//   2. TypeChecker resolves type: Signal<string>
//   3. Rule recognizes Signal read → SKIP
//   4. Or: method is a getter → SKIP
//   5. Or: method body contains no side effects → SKIP with medium confidence
```

**Ticket: RULE-ACC-002**

> **Title:** Add Signal-awareness and component cross-ref to `template-no-call-expression`
>
> **Priority:** Critical | **Effort:** M | **Depends on:** CTX-003
>
> **Changes:**
> 1. Declare `requires: { projectContext: true, typeChecker: true }`
> 2. For zero-arg calls: check if the member is a `Signal<T>` or `WritableSignal<T>` via TypeChecker → skip
> 3. For calls with args: look up the method in the component class via cross-ref
> 4. If method body is pure (no assignments, no service calls, no I/O) → skip or downgrade to warning
> 5. Remove hardcoded whitelist in favor of semantic analysis (keep whitelist as fallback)
>
> **Expected accuracy:** ~40-50% → ~85-90%
>
> **Acceptance criteria:**
> - [ ] Signal reads (`mySignal()`) are never flagged
> - [ ] Pure getters are not flagged (or flagged as info, not error)
> - [ ] Impure methods (service calls, mutations) are still flagged
> - [ ] Works without TypeChecker (falls back to current whitelist)

---

### 3. `prefer-inject`

**Current accuracy: LOW-MEDIUM (~55-65%)**

**What it does today:**
Flags constructor parameters that "look like" DI injections and suggests `inject()`. Detection is based on a massive list of type name suffixes (`Service`, `Facade`, `Store`, `Repository`, `Factory`, `Strategy`, `Validator`, etc.) and parameter name patterns (`http`, `router`, `cdr`).

**The core problem — suffix matching is inherently unreliable:**

```typescript
// FALSE POSITIVE — not an Angular injectable
@Component({...})
export class ChartComponent {
  constructor(
    private config: ChartFactory,       // ← Ends with "Factory" → flagged. But it's a plain object.
    private validator: FormValidator,    // ← Ends with "Validator" → flagged. But it's a local class.
    private strategy: RenderStrategy    // ← Ends with "Strategy" → flagged. But it's an interface.
  ) {}
}

// FALSE NEGATIVE — IS an injectable, no matching suffix
@Component({...})
export class AppComponent {
  constructor(
    private auth: AuthenticationGuard,  // ← Ends with "Guard" but uses inject() already... or not?
    private api: BackendApi,            // ← Doesn't end with any known suffix → missed
    private permissions: RBAC           // ← Acronym, no suffix → missed
  ) {}
}
```

**What context fixes:**

| Context Layer | What It Unlocks | Accuracy Impact |
|---|---|---|
| **DI Provider Tree (CTX-006)** | Know definitively which classes are `@Injectable()` | Eliminates ~90% of suffix-matching errors |
| **Import graph (CTX-002)** | Resolve the actual class definition of the parameter type | No more guessing from name alone |
| **TypeChecker (already partial)** | Verify the symbol has `@Injectable` decorator or is in `providers` array | High-confidence DI detection |

**Concrete improvement:**

```typescript
// TODAY: `constructor(private factory: ChartFactory)` → suffix "Factory" → flag
// WITH CONTEXT:
//   1. Import graph resolves ChartFactory → chart-factory.ts
//   2. DI tree lookup: is ChartFactory @Injectable()? NO
//   3. → SKIP. Not a DI dependency.
//
// TODAY: `constructor(private api: BackendApi)` → no matching suffix → miss
// WITH CONTEXT:
//   1. Import graph resolves BackendApi → backend-api.ts
//   2. DI tree lookup: is BackendApi @Injectable()? YES (@Injectable({ providedIn: 'root' }))
//   3. → FLAG with high confidence
```

**Ticket: RULE-ACC-003**

> **Title:** Replace suffix heuristics with DI tree lookup in `prefer-inject`
>
> **Priority:** Critical | **Effort:** M | **Depends on:** CTX-006 (or CTX-001 + TypeChecker)
>
> **Changes:**
> 1. Declare `requires: { projectContext: true, typeChecker: true }`
> 2. For each constructor param: resolve type via TypeChecker → find class declaration → check for `@Injectable()` decorator
> 3. If DI tree available: cross-reference with known providers
> 4. Keep suffix/name heuristic as **fallback** when TypeChecker unavailable, but mark as `confidence: 'low'`
> 5. When DI tree confirms injectable: `confidence: 'high'`
>
> **Expected accuracy:** ~55-65% → ~95%+
>
> **Acceptance criteria:**
> - [ ] Constructor params typed with `@Injectable` classes are always flagged
> - [ ] Constructor params typed with non-injectable classes are never flagged
> - [ ] Suffix heuristic used as fallback only, with low confidence marker
> - [ ] Angular built-in injectables (Router, HttpClient, etc.) always detected regardless

---

## A-TIER: Significant Accuracy Gains

---

### 4. `component-no-manual-detect-changes`

**Current accuracy: MEDIUM (~65-70%)**

**The core problem — it can't distinguish legitimate from unnecessary change detection:**

```typescript
// FALSE POSITIVE — markForCheck() is REQUIRED with OnPush + async operation
@Component({ changeDetection: ChangeDetectionStrategy.OnPush, ... })
export class DataComponent {
  constructor(private cdr: ChangeDetectorRef) {}

  loadData() {
    fetch('/api/data').then(data => {
      this.data = data;
      this.cdr.markForCheck();  // ← Flagged, but this is NECESSARY with OnPush
    });
  }
}

// TRUE POSITIVE — Default change detection, markForCheck() is pointless
@Component({ ... })  // Default CD
export class SimpleComponent {
  constructor(private cdr: ChangeDetectorRef) {}
  update() { this.cdr.markForCheck(); }  // ← Should be flagged: useless with Default CD
}
```

**What context fixes:**

| Context Layer | What It Unlocks | Accuracy Impact |
|---|---|---|
| **Component metadata cross-ref** | Know the component's `changeDetection` strategy | `markForCheck()` with OnPush = legitimate; with Default = unnecessary |
| **Template cross-ref (CTX-003)** | Know if the modified property is used in template | If property not in template, CD call is suspicious regardless |
| **TypeChecker** | Verify `cdr` is actually `ChangeDetectorRef` vs. custom variable | Eliminates name-collision false positives |

**Ticket: RULE-ACC-004**

> **Title:** Add change detection strategy awareness to `component-no-manual-detect-changes`
>
> **Priority:** High | **Effort:** S | **Depends on:** CTX-003 (or component metadata access)
>
> **Changes:**
> 1. Access component's `changeDetection` from decorator metadata (already parsed by scanner)
> 2. If OnPush: `markForCheck()` is **valid** → skip or downgrade to info
> 3. If OnPush: `detectChanges()` is still suspicious → keep as warning
> 4. If Default: both `markForCheck()` and `detectChanges()` are unnecessary → error
> 5. Use TypeChecker to verify the receiver is actually `ChangeDetectorRef`
>
> **Expected accuracy:** ~65-70% → ~85-90%

---

### 5. `template-no-async-pipe-duplication`

**Current accuracy: MEDIUM (~60-65%)**

**The core problem — string-based deduplication can't understand what the observable IS:**

```html
<!-- TRUE POSITIVE: Same observable, two subscriptions. Wasteful. -->
<div>{{ user$ | async }}</div>
<span>{{ user$ | async }}</span>

<!-- FALSE NEGATIVE: Same observable, different property access. Still duplicated. -->
<div>{{ (user$ | async)?.name }}</div>
<span>{{ (user$ | async)?.email }}</span>
<!-- Rule sees "user$" twice → DOES flag. But only if stringification is identical. -->

<!-- FALSE POSITIVE: Different observables with same name in *ngFor scope -->
<div *ngFor="let item of items">
  {{ item.data$ | async }}  <!-- Each item.data$ is a DIFFERENT observable -->
</div>
```

**What context fixes:**

| Context Layer | What It Unlocks | Accuracy Impact |
|---|---|---|
| **Template ↔ Component cross-ref (CTX-003)** | Know the actual type of the property — is it the same `Observable<T>` instance? | Eliminates scope-collision false positives |
| **TypeChecker** | Verify that two expressions with the same name are the same observable instance | High-confidence deduplication |
| **Template scope analysis** | Understand `*ngFor` / `@for` scoping — `item.data$` in a loop is a different instance per iteration | Eliminates loop-scoped false positives |

**Ticket: RULE-ACC-005**

> **Title:** Add template scope awareness to `template-no-async-pipe-duplication`
>
> **Priority:** High | **Effort:** M | **Depends on:** CTX-003 (template scope analysis)
>
> **Changes:**
> 1. Track template structural directives (`*ngFor`, `*ngIf`, `@for`, `@if`) scope boundaries
> 2. Only flag duplicates within the same scope level
> 3. Understand that `item.prop$ | async` inside `*ngFor` is scoped per iteration — not a global duplicate
> 4. With cross-ref: verify both expressions reference the same component property
>
> **Expected accuracy:** ~60-65% → ~85%

---

### 6. `rxjs-no-subscribe-in-component`

**Current accuracy: MEDIUM (~65-70%)**

**The core problem — it can't see teardown management outside the subscribe chain:**

```typescript
// FALSE POSITIVE — subscription is properly managed, just not via pipe operators
@Component({...})
export class SearchComponent implements OnDestroy {
  private sub!: Subscription;

  ngOnInit() {
    this.sub = this.searchService.results$
      .subscribe(results => this.results = results);  // ← Flagged! No takeUntil in chain.
  }

  ngOnDestroy() {
    this.sub.unsubscribe();  // ← Rule can't see this. Perfectly safe.
  }
}

// FALSE NEGATIVE — has take(1) but the observable never emits
@Component({...})
export class BrokenComponent {
  ngOnInit() {
    this.deadObservable$.pipe(take(1)).subscribe(v => {
      this.doWork(v);  // ← Rule allows (fire-and-forget). But observable never completes.
    });
  }
}
```

**What context fixes:**

| Context Layer | What It Unlocks | Accuracy Impact |
|---|---|---|
| **Class-level analysis (CTX-010)** | See `ngOnDestroy()` with `.unsubscribe()` on the same subscription variable | Eliminates false positives on manual teardown patterns |
| **TypeChecker** | Verify `.subscribe()` is actually on an `Observable<T>` vs. custom method | Eliminates name-collision false positives |
| **Import graph (CTX-002)** | Check if subscription is delegated to a service that manages lifecycle | Reduces false positives on service-managed subscriptions |

**Ticket: RULE-ACC-006**

> **Title:** Add lifecycle teardown detection to `rxjs-no-subscribe-in-component`
>
> **Priority:** High | **Effort:** M | **Depends on:** CTX-010 (ClassMember stream)
>
> **Changes:**
> 1. When `.subscribe()` is found without pipe-level teardown:
>    - Check if result is assigned to a class property (`this.sub = ...`)
>    - Check if `ngOnDestroy()` exists and calls `.unsubscribe()` on that property
>    - If both → skip (manual but correct teardown)
> 2. Use TypeChecker to verify receiver is `Observable<T>`
> 3. Add `confidence` level: `high` when TypeChecker confirms, `medium` for pattern-match
>
> **Expected accuracy:** ~65-70% → ~85%

---

### 7. `signal-prefer-computed-over-sync-effect`

**Current accuracy: MEDIUM (~60-70%)**

**The core problem — it guesses what "signal reads" are:**

```typescript
// FALSE POSITIVE — zero-arg call is NOT a signal read
effect(() => {
  this.logger.flush();         // ← Zero-arg call, rule thinks it's a signal read
  this.count.set(newValue);    // ← Write detected
  // Rule: read + write + no async = suggest computed(). WRONG.
});

// FALSE NEGATIVE — signal read hidden behind a method
effect(() => {
  const name = this.getName();  // ← Internally calls this.name() (signal read)
  this.displayName.set(name);   // ← Write
  // Rule: no direct signal read detected → doesn't flag. But it IS a sync derivation.
});
```

**What context fixes:**

| Context Layer | What It Unlocks | Accuracy Impact |
|---|---|---|
| **TypeChecker (already partial)** | Verify zero-arg calls are actually `Signal<T>` reads vs. regular methods | Eliminates the biggest source of false positives |
| **Cross-ref + class analysis (CTX-003)** | Resolve `this.getName()` → check if method body reads signals | Catches indirect signal reads (false negative reduction) |

**Ticket: RULE-ACC-007**

> **Title:** Require TypeChecker confirmation for signal reads in `signal-prefer-computed`
>
> **Priority:** High | **Effort:** S | **Depends on:** TypeChecker (already available)
>
> **Changes:**
> 1. When TypeChecker is available: only count a zero-arg call as "signal read" if the return type is `Signal<T>` or `WritableSignal<T>` or `InputSignal<T>`
> 2. When TypeChecker is unavailable: keep current heuristic but mark `confidence: 'low'`
> 3. Add class body analysis: check if called methods internally read signals (one level deep)
>
> **Expected accuracy:** ~60-70% → ~85-90%

---

## B-TIER: Moderate Accuracy Gains

---

### 8. `rxjs-avoid-behaviorsubject-for-local-state`

**Current accuracy: MEDIUM-HIGH (~70-75%)**

**The blind spot:** Rule skips `public` properties, assuming they're intentional API. But many private `BehaviorSubject` instances are legitimately used for controlled state streams consumed by child components.

| Context Layer | Fix |
|---|---|
| **Import graph (CTX-002)** | Check if `BehaviorSubject` is `.subscribe()`'d or `.pipe()`'d in other files → it's shared state, not local |
| **Template cross-ref (CTX-003)** | Check if `BehaviorSubject` is consumed in template via `| async` → template state, rule is correct to flag |

**Ticket: RULE-ACC-008**

> **Title:** Add consumer analysis to `rxjs-avoid-behaviorsubject-for-local-state`
>
> **Priority:** Medium | **Effort:** M | **Depends on:** CTX-002, CTX-003
>
> **Changes:**
> 1. If BehaviorSubject property is consumed in template → flag (should be signal)
> 2. If BehaviorSubject property is consumed in other files → skip (shared reactive state)
> 3. If BehaviorSubject property is only used internally in same class → flag (local state → signal)
>
> **Expected accuracy:** ~70-75% → ~85-90%

---

### 9. `rxjs-require-take-until-destroyed`

**Current accuracy: MEDIUM-HIGH (~70-75%)**

**The blind spot:** Same as `rxjs-no-subscribe-in-component` — can't see `ngOnDestroy()` with manual unsubscribe. Also can't verify that `takeUntilDestroyed()` is called with a valid `DestroyRef`.

| Context Layer | Fix |
|---|---|
| **Class-level analysis** | Detect `ngOnDestroy()` + `unsubscribe()` pattern as valid teardown |
| **TypeChecker** | Verify `takeUntilDestroyed()` argument is `DestroyRef` when called outside injection context |

**Ticket: RULE-ACC-009**

> **Title:** Add OnDestroy/unsubscribe pattern recognition to `rxjs-require-take-until-destroyed`
>
> **Priority:** Medium | **Effort:** S | **Depends on:** None (class body analysis only)
>
> **Changes:**
> 1. When `.subscribe()` result is assigned to a property and `ngOnDestroy` calls `.unsubscribe()` on it → skip
> 2. When subscription is added to a `Subscription` aggregate (`this.subs.add(...)`) and aggregate is torn down → skip
> 3. Add `confidence` scoring
>
> **Expected accuracy:** ~70-75% → ~85%

---

### 10. `to-signal-require-initial-value`

**Current accuracy: MEDIUM (~65-70%)**

**The blind spot:** Can't verify that `requireSync: true` is actually safe (requires synchronous observable).

| Context Layer | Fix |
|---|---|
| **TypeChecker** | Resolve the observable argument type — is it `BehaviorSubject<T>` (sync) or `Observable<T>` (async)? |
| **Cross-ref** | Check if observable is initialized with `of()`, `BehaviorSubject`, or `startWith()` |

**Ticket: RULE-ACC-010**

> **Title:** Add observable synchronicity check to `to-signal-require-initial-value`
>
> **Priority:** Medium | **Effort:** S | **Depends on:** TypeChecker (already available)
>
> **Changes:**
> 1. When `requireSync: true` is set: use TypeChecker to verify observable type
> 2. If observable is `BehaviorSubject` or has `startWith()` → `requireSync` is safe → skip
> 3. If observable is plain `Observable` or `Subject` → `requireSync` will throw → flag as error
> 4. When TypeChecker unavailable: keep current behavior
>
> **Expected accuracy:** ~65-70% → ~80-85%

---

## C-TIER: Minimal Contextual Benefit

---

### 11. `prefer-on-push`

**Current accuracy: HIGH (~80%)**

The rule checks a simple boolean condition (is `changeDetection` set to OnPush?). Context would let it validate whether the component *can safely use* OnPush (no mutable input bindings, async pipe usage, etc.), but the rule's current intent — "always prefer OnPush" — is architecturally sound without cross-file data. **Leave as-is.**

---

### 12. `signal-no-side-effects-in-computed` / `signal-no-effect-in-constructor` / `signal-effect-must-be-destroy-scoped` / `signal-avoid-untracked-overuse`

**Current accuracy: HIGH (~80-85%)**

These rules check well-defined syntactic patterns (effect in constructor, side effects in computed callback, untracked overuse). The checks are structurally unambiguous — context wouldn't change the verdict. **Leave as-is.**

---

## Summary: Priority Matrix

```
                    HIGH ACCURACY GAIN
                          ▲
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
    │  RULE-ACC-003       │  RULE-ACC-001       │
    │  prefer-inject      │  rxjs-prefer-to-    │
    │  (DI tree)          │  signal-for-        │
    │                     │  template-state     │
    │  RULE-ACC-002       │  (template x-ref)   │
    │  template-no-call   │                     │
    │  (signal awareness) │                     │
    │                     │                     │
LOW ◄─────────────────────┼─────────────────────► HIGH
EFFORT                    │                     EFFORT
    │                     │                     │
    │  RULE-ACC-007       │  RULE-ACC-005       │
    │  signal-prefer-     │  template-async-    │
    │  computed           │  pipe-dup           │
    │  (TypeChecker only) │  (scope analysis)   │
    │                     │                     │
    │  RULE-ACC-009       │  RULE-ACC-006       │
    │  rxjs-require-      │  rxjs-no-subscribe  │
    │  take-until         │  (lifecycle detect) │
    │  (class body scan)  │                     │
    │                     │  RULE-ACC-008       │
    │  RULE-ACC-010       │  rxjs-avoid-        │
    │  to-signal-require  │  behaviorsubject    │
    │  (TypeChecker only) │  (consumer graph)   │
    │                     │                     │
    └─────────────────────┼─────────────────────┘
                          │
                    LOW ACCURACY GAIN
```

## Recommended Execution Order

| Phase | Tickets | Shared Dependency | Net Effect |
|-------|---------|-------------------|------------|
| **1 — Quick wins (no infra)** | RULE-ACC-007, RULE-ACC-009, RULE-ACC-010 | TypeChecker (exists) + class body scan | 3 rules improved, zero infra cost |
| **2 — Template cross-ref** | RULE-ACC-001, RULE-ACC-002, RULE-ACC-004, RULE-ACC-005 | CTX-003 (template ↔ component) | 4 rules improved, biggest bang-for-buck |
| **3 — Import graph** | RULE-ACC-006, RULE-ACC-008 | CTX-002 (import graph) | 2 rules improved, enables future rules |
| **4 — DI tree** | RULE-ACC-003 | CTX-006 (DI provider tree) | 1 rule transformed, high individual impact |

**Phase 1 requires zero infrastructure changes** — just better use of the TypeChecker you already have and reading the class body more thoroughly. Start there.
