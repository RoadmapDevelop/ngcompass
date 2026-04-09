# signal-prefer-computed-over-sync-effect

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | Reactivity |
| **Applies to** | All `.ts` files |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

An `effect()` that only reads signals and synchronously writes a derived value to another signal is a **manual re-implementation of `computed()`**. Using `effect()` for this is:

- **Less efficient** — `effect()` schedules asynchronously; `computed()` is synchronous and lazy.
- **More verbose** — requires declaring a writable signal to hold the derived value.
- **Error-prone** — can create reactive cycles if not carefully managed.
- **Misleading** — `effect()` semantically means "side effect", not "derivation".

```
Manual derivation with effect() (❌)     Automatic derivation with computed() (✅)
────────────────────────────────         ──────────────────────────────────────────
total = signal(0);                       total = computed(() => price() * qty());
effect(() => {
  total.set(price() * qty());            // Lazily evaluated when accessed.
});                                      // Cached until price or qty changes.
// Runs asynchronously after change.     // No extra signal needed.
// Requires a writable signal.           // Type is Signal<number>, not WritableSignal.
```

---

## Invalid Examples

```typescript
// ❌ effect() used to derive and write a value synchronously
@Component({ selector: 'app-price', template: '{{ total() }}' })
export class PriceComponent {
  price = input.required<number>();
  qty   = input.required<number>();

  total = signal(0); // ❌ extra signal needed

  // ❌ warn — this is a computed() in disguise
  syncEffect = effect(() => {
    this.total.set(this.price() * this.qty());
  });
}
```

```typescript
// ❌ effect() updating display state from signals
isVisible = signal(false);
items     = signal<Item[]>([]);

// ❌ warn — computed() is the right tool
updateEffect = effect(() => {
  this.isVisible.set(this.items().length > 0);
});
```

---

## Valid Examples

```typescript
// ✅ computed() — lazy, cached, zero boilerplate
@Component({ selector: 'app-price', template: '{{ total() }}' })
export class PriceComponent {
  price = input.required<number>();
  qty   = input.required<number>();

  total = computed(() => this.price() * this.qty()); // ✅
}
```

```typescript
// ✅ computed() for conditional state
isVisible = computed(() => this.items().length > 0); // ✅
```

```typescript
// ✅ effect() for true side effects (async, DOM, external systems)
logEffect = effect(() => {
  // ✅ effect is correct here: external system side effect
  this.analytics.track({ total: this.total() });
});
```

```typescript
// ✅ effect() with async operations — cannot be computed()
saveEffect = effect(() => {
  const data = this.formData();
  setTimeout(() => {          // async boundary — computed() can't do this
    this.api.save(data);
  }, 500);
});
```

---

## Decision Guide

```
Does your effect() do any of these?
├─ await / yield / setTimeout / setInterval / Promise? ─▶ ✅ keep effect()
├─ HTTP call / network request? ────────────────────────▶ ✅ keep effect()
├─ DOM manipulation? ───────────────────────────────────▶ ✅ keep effect()
├─ External library call? ──────────────────────────────▶ ✅ keep effect()
└─ Only reads signals + writes to another signal?
       No async, no side effects? ─────────────────────▶ ⚠️ use computed()
```

---

## Exemptions

| Pattern | Exempt? | Reason |
|---|---|---|
| `effect()` with `await` / `yield` | ✅ | Async — cannot be `computed()` |
| `effect()` with `setTimeout` / `setInterval` | ✅ | Timer side effect |
| `effect()` with `linkedSignal` | ✅ | Special linked signal pattern |
| `effect()` with no signal reads | ✅ | Not a derivation |
| `effect()` with no signal writes | ✅ | Side effect, not derivation |

---

## Related Rules

- [`signal-no-side-effects-in-computed`](../correctness/signal-no-side-effects-in-computed.md)
- [`signal-effect-must-be-destroy-scoped`](../correctness/signal-effect-must-be-destroy-scoped.md)
- [`signal-avoid-untracked-overuse`](./signal-avoid-untracked-overuse.md)
