# signal-avoid-untracked-overuse

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | Reactivity |
| **Applies to** | All `.ts` files |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

`untracked()` reads signals without registering a dependency — the surrounding reactive context (`computed()`, `effect()`) won't re-execute when those signals change. This is occasionally the right tool, but **overuse silently breaks reactivity**:

```
effect(() => {
  const a = this.a();               // ✅ tracked — effect re-runs when a changes
  const b = untracked(() => this.b()); // ⚠️ NOT tracked — effect will NOT re-run when b changes
  this.render(a, b);                // b may be stale!
});
```

When overused:
- The reactive graph becomes incorrect — computed values may be stale.
- Effects may run with outdated signal values.
- Bugs are silent — no errors, just wrong UI.

The only legitimate use of `untracked()` inside code that runs on every frame is **inside `afterRender` / `afterNextRender`** hooks, where reading a signal without creating a dependency is intentional (the hook already has its own scheduling).

---

## Invalid Examples

```typescript
// ❌ untracked() in computed — defeats the purpose of computed
fullName = computed(() => {
  const first = this.firstName();
  const last  = untracked(() => this.lastName()); // ⚠️ warn — last name won't trigger recompute
  return `${first} ${last}`;
});
```

```typescript
// ❌ untracked() inside effect body — breaks reactivity
logEffect = effect(() => {
  const user = untracked(() => this.user()); // ⚠️ warn — effect won't re-run on user change
  console.log('Current user:', user);
});
```

```typescript
// ❌ Unnecessary untracked() in a standalone read
ngOnInit() {
  const count = untracked(() => this.count()); // ⚠️ warn — not in reactive context
  this.initial = count;
}
```

---

## Valid Examples

```typescript
// ✅ untracked() inside afterNextRender — intentional, no reactive scheduling needed
constructor() {
  afterNextRender(() => {
    const value = untracked(() => this.chartData()); // ✅ exempt
    this.chart.update(value);
  });
}
```

```typescript
// ✅ untracked() inside afterRender — same reasoning
afterRenderRef = afterRender(() => {
  const pos = untracked(() => this.scrollPosition()); // ✅ exempt
  this.el.nativeElement.scrollTop = pos;
});
```

```typescript
// ✅ Reading analytics without creating a dependency (inside effect)
trackEffect = effect(() => {
  const value = this.count(); // ✅ tracked — effect re-runs when count changes
  untracked(() => this.analytics.track(value)); // ✅ analytics read/write is side-effect safe
});
```

---

## When `untracked()` Is Correct

```
Use untracked() when you need to:
├─ Read a signal in a one-shot context (not reactive) ─────▶ acceptable, but avoid in effects/computed
├─ Prevent over-triggering in afterRender hooks ───────────▶ ✅ fully intended
└─ Read additional context in an effect without creating
   a dependency on that value for re-triggering ───────────▶ document the intent clearly
```

---

## Exemptions

| Context | Exempt? | Reason |
|---|---|---|
| Inside `afterRender()` callback | ✅ | Browser-only hook with its own scheduling |
| Inside `afterNextRender()` callback | ✅ | Runs once after first render |
| All other contexts | ⚠️ | Flagged as potential misuse |

---

## Related Rules

- [`signal-prefer-computed-over-sync-effect`](./signal-prefer-computed-over-sync-effect.md)
- [`signal-effect-must-be-destroy-scoped`](../correctness/signal-effect-must-be-destroy-scoped.md)
