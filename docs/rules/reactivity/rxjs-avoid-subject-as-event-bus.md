# rxjs-avoid-subject-as-event-bus

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | Reactivity |
| **Applies to** | `.component.ts` |
| **Stream** | `AnyAngularClass` |

---

## Why This Rule Exists

Using a `Subject` (or its variants) as a local event bus or state container inside a component is an anti-pattern in modern Angular. Subjects as local buses:

- **Add memory-leak risk** — they must be manually completed in `ngOnDestroy`.
- **Bypass the signal graph** — Angular cannot track their dependencies for zoneless scheduling.
- **Duplicate the role of signals** — for state, `signal()` is simpler and more efficient.
- **Duplicate the role of methods** — for events, a plain method call is clearer.

```
Common misuse patterns:
─────────────────────────────────────────────────────
 Pattern A: Subject as state container
   private loading$ = new Subject<boolean>();  ← replace with signal()

 Pattern B: Subject as local event bus
   private click$ = new Subject<void>();       ← replace with a method call
   onClick() { this.click$.next(); }

 Pattern C: Subject as pipeline source (✅ legitimate)
   private search$ = new Subject<string>();
   results$ = this.search$.pipe(debounceTime(300), switchMap(...));
   ↑ Has .pipe() usage → exempt from this rule
```

---

## Invalid Examples

```typescript
// ❌ Subject used as UI state container
import { Subject } from 'rxjs';

@Component({ selector: 'app-list', template: '...' })
export class ListComponent {
  private loading$ = new Subject<boolean>(); // ⚠️ warn — use signal() instead
  private error$   = new Subject<string>();  // ⚠️ warn — use signal() instead
}
```

```typescript
// ❌ Subject used as local event bus
@Component({ selector: 'app-form', template: '...' })
export class FormComponent {
  private submit$ = new Subject<void>(); // ⚠️ warn — use a method call instead

  onSubmit() {
    this.submit$.next();
  }
}
```

---

## Valid Examples

```typescript
// ✅ signal() for UI state
@Component({ selector: 'app-list', template: '...' })
export class ListComponent {
  loading = signal(false);
  error   = signal<string | null>(null);

  load() {
    this.loading.set(true);
    this.api.getItems().subscribe({
      next:  items  => { this.items.set(items); this.loading.set(false); },
      error: err    => { this.error.set(err.message); this.loading.set(false); },
    });
  }
}
```

```typescript
// ✅ Subject with .pipe() — legitimate reactive pipeline
@Component({ selector: 'app-search', template: '...' })
export class SearchComponent {
  private search$ = new Subject<string>(); // ✅ exempt — has .pipe()

  results = toSignal(
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => this.api.search(q)),
    ),
    { initialValue: [] }
  );

  onSearch(query: string) {
    this.search$.next(query);
  }
}
```

```typescript
// ✅ Method call instead of event bus
@Component({ selector: 'app-form', template: '...' })
export class FormComponent {
  onSubmit(data: FormData) {
    this.api.save(data).subscribe(result => this.handleResult(result));
  }
}
```

---

## Exemptions

| Pattern | Exempt? | Reason |
|---|---|---|
| `public` Subject | ✅ | Part of public API (may be an output bus) |
| Names in teardown list | ✅ | `destroy$`, `destroyed$`, `unsubscribe$`, etc. |
| `complete()` in `ngOnDestroy` | ✅ | Detected as teardown subject |
| `.next()` in `@Input` setter | ✅ | Detected as bridge pattern |
| `.next()` in `ngOnChanges` | ✅ | Detected as lifecycle bridge |
| Subject with `.pipe()` usage | ✅ | Used in reactive pipeline |

---

## Related Rules

- [`rxjs-require-take-until-destroyed`](./rxjs-require-take-until-destroyed.md)
- [`to-signal-require-initial-value`](./to-signal-require-initial-value.md)
- [`rxjs-prefer-to-signal-for-template-state`](./rxjs-prefer-to-signal-for-template-state.md)
