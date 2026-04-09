# rxjs-require-take-until-destroyed

| Property | Value |
|---|---|
| **Rule name** | `rxjs-require-takeUntilDestroyed` |
| **Severity** | `error` |
| **Category** | Reactivity |
| **Applies to** | `.component.ts` |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

A subscription to a long-lived observable that outlives the component creates a **memory leak**: the subscription callback still fires after the component is destroyed, potentially mutating destroyed view state and causing `ExpressionChangedAfterItHasBeenChecked` errors or null-pointer crashes.

`takeUntilDestroyed()` (Angular 16+) provides a **zero-boilerplate teardown** that hooks into the component's `DestroyRef` and automatically unsubscribes when the component is destroyed.

```
Without teardown:
  Component Created ──► subscribe() ──► Component Destroyed
                              │                    │
                              └─── still running ──┘
                                   memory leak! 🔴

With takeUntilDestroyed():
  Component Created ──► subscribe() ──► Component Destroyed
                              │                    │
                              └─────────────────── ┘
                                   auto-unsubscribed ✅
```

---

## Invalid Examples

```typescript
// ❌ Bare subscribe — will outlive the component
@Component({ selector: 'app-feed', template: '...' })
export class FeedComponent implements OnInit {
  ngOnInit() {
    this.feedService.updates$.subscribe(update => { // ❌ error
      this.latest = update;
    });
  }
}
```

```typescript
// ❌ WebSocket subscription without teardown
ngOnInit() {
  this.ws.messages$.pipe(
    map(m => JSON.parse(m.data))
  ).subscribe(msg => this.handle(msg)); // ❌ error — no teardown in pipe
}
```

---

## Valid Examples

```typescript
// ✅ takeUntilDestroyed() — preferred modern approach
@Component({ selector: 'app-feed', template: '...' })
export class FeedComponent {
  constructor() {
    this.feedService.updates$.pipe(
      takeUntilDestroyed()
    ).subscribe(update => this.latest = update);
  }
}
```

```typescript
// ✅ takeUntilDestroyed(destroyRef) — when not in injection context
@Component({ selector: 'app-feed', template: '...' })
export class FeedComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.feedService.updates$.pipe(
      takeUntilDestroyed(this.destroyRef) // ✅
    ).subscribe(update => this.latest = update);
  }
}
```

```typescript
// ✅ take(1) — single emission, auto-completes (HTTP-like pattern)
onSearch(query: string) {
  this.api.search(query).pipe(
    take(1) // ✅ single emission
  ).subscribe(results => this.results = results);
}
```

```typescript
// ✅ HTTP observable — auto-completes, no teardown needed
onSave() {
  this.http.post('/api/data', this.form.value)
    .subscribe(res => this.notify(res)); // ✅ HTTP always completes
}
```

---

## Teardown Operator Reference

| Operator | When to use |
|---|---|
| `takeUntilDestroyed()` | Component lifecycle — most common case |
| `takeUntilDestroyed(destroyRef)` | Outside constructor / injection context |
| `takeUntil(destroy$)` | Legacy — prefer `takeUntilDestroyed()` |
| `take(1)` | First emission only |
| `first()` | First emission that passes a predicate |
| `takeWhile(predicate)` | While a condition is true |

---

## Exemptions

| Pattern | Exempt? | Reason |
|---|---|---|
| `pipe(takeUntilDestroyed(...))` | ✅ | Explicit cleanup |
| `pipe(takeUntil(...))` | ✅ | Explicit cleanup |
| `pipe(take(1))` | ✅ | Single emission |
| `pipe(first())` | ✅ | Single emission |
| `pipe(takeWhile(...))` | ✅ | Conditional completion |
| HTTP observables | ✅ | `this.http.*`, `this.api.get*()`, etc. |
| Manual `ngOnDestroy + .unsubscribe()` | ✅ | Manual management |

---

## Related Rules

- [`rxjs-no-subscribe-in-component`](./rxjs-no-subscribe-in-component.md)
- [`rxjs-no-nested-subscribe`](../correctness/rxjs-no-nested-subscribe.md)
