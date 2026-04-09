# prefer-on-push-component-change-detection

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Performance |
| **Applies to** | `.component.ts` |
| **Stream** | `AngularClass` (Component only) |

---

## Why This Rule Exists

Angular's **Default** change detection strategy checks every component in the tree on every event (click, timer, HTTP response, etc.). This is safe but extremely wasteful in large applications.

**OnPush** restricts change detection to three narrow conditions:

1. An `@Input()` reference changes.
2. An event originates from the component or its children.
3. An `async` pipe / signal marks the view dirty.

```
Default CD (❌)                        OnPush CD (✅)
─────────────                          ─────────────
Any event anywhere                     Only when:
        │                              ├─ Input reference changes
        ▼                              ├─ Component event fires
  Check ALL components                 └─ Signal / async pipe marks dirty
  in entire tree                               │
                                               ▼
                                       Check only this subtree
```

With Signals, OnPush is essentially **free** — signals mark exactly the views that need updating, so the entire component tree runs at maximum efficiency.

---

## Invalid Examples

```typescript
// ❌ Default change detection — entire tree checked on every event
@Component({
  selector: 'app-product-list',
  template: `
    @for (p of products; track p.id) {
      <app-product-card [product]="p" />
    }
  `,
  // changeDetection: not set → defaults to ChangeDetectionStrategy.Default
})
export class ProductListComponent {
  products = input<Product[]>([]);
}
```

```typescript
// ❌ Explicit Default — even worse, makes it clear it was intentional
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.Default, // ❌ error
  template: '...',
})
export class DashboardComponent {}
```

---

## Valid Examples

```typescript
// ✅ OnPush — minimal change detection
@Component({
  selector: 'app-product-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (p of products(); track p.id) {
      <app-product-card [product]="p" />
    }
  `,
})
export class ProductListComponent {
  products = input<Product[]>([]);
}
```

```typescript
// ✅ OnPush with Signals — zero-effort reactivity
@Component({
  selector: 'app-counter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span>{{ count() }}</span>`,
})
export class CounterComponent {
  count = signal(0);

  increment() {
    this.count.update(v => v + 1); // Signal write → Angular schedules update
  }
}
```

---

## Impact at Scale

```
App with 200 components, Default CD:
  User clicks anywhere → 200 components checked

App with 200 components, OnPush + Signals:
  User clicks → only dirty components checked (often 1–5)
```

---

## Exemptions

There are **no exemptions**. Every `@Component` must use `ChangeDetectionStrategy.OnPush`. If a component genuinely requires Default CD (e.g., wrapping a third-party library that mutates inputs), disable the rule at the declaration site with an inline comment.

---

## Migration Tips

1. Add `changeDetection: ChangeDetectionStrategy.OnPush` to the decorator.
2. Replace mutable property mutations with `signal()` or `computed()`.
3. Replace `this.cdr.markForCheck()` calls — they become unnecessary.
4. Use `async` pipe or `toSignal()` for observables.

---

## Related Rules

- [`component-no-manual-detect-changes`](../correctness/component-no-manual-detect-changes.md) — remove manual CD calls
- [`to-signal-require-initial-value`](../reactivity/to-signal-require-initial-value.md) — safe signal conversion
