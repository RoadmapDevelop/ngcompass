# signal-no-side-effects-in-computed

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Correctness |
| **Applies to** | All `.ts` files |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

`computed()` must be a **pure derivation** — given the same signal inputs, it must always produce the same output with no observable side-effects. Angular may call the computation multiple times, re-order it, or cache it aggressively. Side effects inside `computed()` break these assumptions in unpredictable ways.

```
Signal graph (✅ pure computed)           Signal graph (❌ side-effecting computed)
──────────────────────────────            ──────────────────────────────────────
 price ──┐                                 price ──┐
         ├─▶ total = computed(             HTTP ────┴─▶ total = computed(
 qty ───┘       price() * qty()                           fetch('/save')   ← 🔴 side effect!
         )                                          )
                                                    ↑ Angular may call this multiple times!
```

**Side effects that are prohibited inside `computed()`:**

- HTTP / network calls
- Writing to other signals (`.set()`, `.update()`)
- DOM manipulation
- `console.log` / logging
- State mutations (`array.push()`, `object.x = y`)

---

## Invalid Examples

```typescript
// ❌ HTTP call inside computed
total = computed(() => {
  this.http.post('/api/log', { val: this.price() }).subscribe(); // ❌ error
  return this.price() * this.qty();
});
```

```typescript
// ❌ Writing to another signal inside computed
syncedTotal = computed(() => {
  const t = this.price() * this.qty();
  this.cachedTotal.set(t); // ❌ error — signal write in computed
  return t;
});
```

```typescript
// ❌ Console.log side effect
debugComputed = computed(() => {
  console.log('recomputing'); // ❌ error — side effect
  return this.items().length;
});
```

```typescript
// ❌ DOM mutation inside computed
labelWidth = computed(() => {
  this.labelEl.nativeElement.style.width = '100px'; // ❌ error
  return this.label().length * 8;
});
```

---

## Valid Examples

```typescript
// ✅ Pure derivation — no side effects
total = computed(() => this.price() * this.qty());
```

```typescript
// ✅ Multiple signals, pure transform
summary = computed(() => ({
  count: this.items().length,
  total: this.items().reduce((s, i) => s + i.price, 0),
  isEmpty: this.items().length === 0,
}));
```

```typescript
// ✅ Move side effects to effect()
total = computed(() => this.price() * this.qty());

// Side effect lives here, where it belongs:
logEffect = effect(() => {
  console.log('Total changed:', this.total());
});
```

```typescript
// ✅ Write to another signal via effect(), not computed()
derivedCount = computed(() => this.items().length);

syncEffect = effect(() => {
  this.cachedCount.set(this.derivedCount()); // ✅ write in effect, not computed
});
```

---

## Exemptions

There are **no exemptions**. `computed()` must always be pure. If you need a side effect triggered by signal changes, use `effect()`.

---

## Decision Guide

```
Do you need to...
│
├─ derive a value from other signals? ──────────────────▶ computed()
│
├─ run a side effect when a signal changes? ────────────▶ effect()
│
└─ persist derived state across renders?
   ├─ synchronously derivable? ───────────────────────▶ computed()
   └─ requires async work (HTTP, timers)? ────────────▶ effect() + signal.set()
```

---

## Related Rules

- [`signal-effect-must-be-destroy-scoped`](./signal-effect-must-be-destroy-scoped.md) — correct `effect()` usage
- [`signal-prefer-computed-over-sync-effect`](../reactivity/signal-prefer-computed-over-sync-effect.md) — when to prefer `computed()` over `effect()`
