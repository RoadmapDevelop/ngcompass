# signal-effect-must-be-destroy-scoped

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Correctness |
| **Applies to** | Component/directive methods (non-constructor) |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

`effect()` registers a **reactive side-effect** that runs whenever its signal dependencies change. If created outside an injection context (i.e., not in a constructor or field initializer), Angular cannot attach a `DestroyRef` to it — meaning **the effect will never be cleaned up** and will keep running after the component is destroyed.

```
Lifecycle timeline (❌ unscoped effect)
────────────────────────────────────────────────────────
Component Created ──► ngOnInit (effect() call) ──► Component Destroyed
                                                        │
                                              effect still running! 🔴
                                              Signals still tracked!
                                              Callback still firing!

Lifecycle timeline (✅ scoped effect in constructor)
────────────────────────────────────────────────────────
Component Created ──► constructor (effect() call) ──► Component Destroyed
          │                                                    │
          └── DestroyRef auto-attached ─────────────── effect cleaned up ✅
```

---

## Invalid Examples

```typescript
// ❌ effect() in ngOnInit — no injection context, never cleaned up
@Component({ selector: 'app-counter', template: '{{ count() }}' })
export class CounterComponent {
  count = signal(0);

  ngOnInit() {
    effect(() => {                 // ❌ error — no injection context
      console.log(this.count());
    });
  }
}
```

```typescript
// ❌ effect() in a regular method
export class DashboardComponent {
  data = signal<Data[]>([]);

  setupEffects() {
    effect(() => this.syncToServer(this.data())); // ❌ error
  }
}
```

```typescript
// ❌ effect() in ngAfterViewInit
ngAfterViewInit() {
  effect(() => {          // ❌ error — outside injection context
    this.chart.update(this.chartData());
  });
}
```

---

## Valid Examples

```typescript
// ✅ Field initializer — implicit injection context
@Component({ selector: 'app-counter', template: '{{ count() }}' })
export class CounterComponent {
  count = signal(0);

  // Field initializers run inside the injection context
  logEffect = effect(() => console.log(this.count())); // ✅
}
```

```typescript
// ✅ Constructor — injection context is active
@Component({ selector: 'app-counter', template: '{{ count() }}' })
export class CounterComponent {
  count = signal(0);

  constructor() {
    effect(() => console.log(this.count())); // ✅ DestroyRef auto-attached
  }
}
```

```typescript
// ✅ Explicit injector option — for use outside injection context
@Component({ selector: 'app-chart', template: '...' })
export class ChartComponent {
  chartData = signal<number[]>([]);
  private injector = inject(Injector);

  ngAfterViewInit() {
    effect(() => this.chart.update(this.chartData()), {
      injector: this.injector  // ✅ explicit ownership
    });
  }
}
```

```typescript
// ✅ manualCleanup flag — developer owns cleanup explicitly
export class StreamComponent {
  private effectRef = effect(() => this.process(), { manualCleanup: true });

  ngOnDestroy() {
    this.effectRef.destroy(); // ✅ explicit cleanup
  }
}
```

---

## Exemptions

| Pattern | Exempted? | Reason |
|---|---|---|
| `effect()` in constructor | ✅ Yes | Injection context is active |
| `effect()` in field initializer | ✅ Yes | Injection context is active |
| `effect(..., { injector })` | ✅ Yes | Explicit lifecycle ownership |
| `effect(..., { manualCleanup: true })` | ✅ Yes | Developer controls cleanup |
| `effect()` in `ngOnInit` | ❌ No | No injection context |
| `effect()` in any other method | ❌ No | No injection context |

---

## Related Rules

- [`signal-no-side-effects-in-computed`](./signal-no-side-effects-in-computed.md) — keep `computed()` pure
- [`signal-prefer-computed-over-sync-effect`](../reactivity/signal-prefer-computed-over-sync-effect.md) — prefer `computed()` for derived state
