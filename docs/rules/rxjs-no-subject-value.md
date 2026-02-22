# rxjs-no-subject-value

**Severity:** `moderate`  **Phase:** 2 — Priority 5 (RxJS Safety)  **Stream:** `AngularClass`

## Rationale

`BehaviorSubject.value` is a synchronous getter that imperatively **pulls** the current value. This:

- Encourages imperative "read then write" patterns instead of reactive transformations
- Creates **temporal coupling** — the value may change between the read and the use
- Bypasses the reactive graph so derived state based on this read can become stale
- Leaks the internal state model to consumers who should only see events

## Detection Strategy

1. Collect all class properties initialised with `new BehaviorSubject(...)` or `new ReplaySubject(...)`
2. Flag any `this.<collectedProperty>.value` member access in the class body

Note: Only `BehaviorSubject` and `ReplaySubject` expose `.value`. Regular `Subject` does not.

## Rule Details

### ❌ Failing

```ts
@Component({ ... })
export class CartComponent {
    private items$ = new BehaviorSubject<CartItem[]>([]);

    addItem(item: CartItem) {
        const current = this.items$.value;  // ← flagged
        this.items$.next([...current, item]);
    }
}
```

### ✅ Passing

```ts
// Option 1: pipe(take(1)) — reactive, one-shot read
addItem(item: CartItem) {
    this.items$.pipe(take(1)).subscribe(current => {
        this.items$.next([...current, item]);
    });
}

// Option 2: Use scan() to accumulate inside the stream
addItem$ = new Subject<CartItem>();
items$ = this.addItem$.pipe(
    scan((items, item) => [...items, item], [] as CartItem[])
);

// Option 3: Migrate to a signal-based store
items = signal<CartItem[]>([]);
addItem(item: CartItem) {
    this.items.update(current => [...current, item]);
}
```

## Configuration

This rule has no configuration options.

## When To Disable

In initialization code (e.g., `ngOnInit` reading an initial snapshot before subscribing) where temporal coupling is explicitly acceptable and documented.

## See Also

- [`rxjs-no-nested-subscribe`](./rxjs-no-nested-subscribe.md)
- [RxJS BehaviorSubject](https://rxjs.dev/api/index/class/BehaviorSubject)
