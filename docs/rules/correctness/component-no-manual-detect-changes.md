# component-no-manual-detect-changes

| Property | Value |
|---|---|
| **Severity** | `error` (default CD) · `warn` (OnPush `markForCheck`) |
| **Category** | Correctness |
| **Applies to** | `.component.ts` files |
| **Stream** | `AnyAngularClass` |

---

## Why This Rule Exists

Manually calling `detectChanges()` or `markForCheck()` is a sign that a component is fighting Angular's change detection rather than working with it. These calls:

- **Create hidden coupling** between the component and the framework's internals.
- **Mask the real fix** — almost always, the underlying issue is a non-signal or non-observable state mutation.
- **Break zoneless Angular** — `detectChanges()` is a Zone.js concept and will not work in a signal-based, zoneless app.

The correct solution is to express state as `signal()`, `computed()`, or an `Observable` piped through `async` / `toSignal()`. Angular then updates the view automatically.

```
Component State Change
        │
        ▼
 ┌──────────────────┐       ❌ Manual trigger         ┌───────────┐
 │  Imperative Mut  │──────────────────────────────▶  │  detectChanges / markForCheck │
 │  this.data = x   │                                 └───────────┘
 └──────────────────┘
        │
        │  ✅ Signal / Observable
        ▼
 ┌──────────────────┐       Automatic scheduling      ┌───────────┐
 │  data = signal() │──────────────────────────────▶  │  Angular CD│
 └──────────────────┘                                 └───────────┘
```

---

## Invalid Examples

```typescript
// ❌ Calling detectChanges() manually in a Default CD component
@Component({ selector: 'app-list', template: '...' })
export class ListComponent {
  items: string[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  addItem(item: string) {
    this.items.push(item);
    this.cdr.detectChanges(); // ❌ error — masks the real problem
  }
}
```

```typescript
// ❌ markForCheck() on an OnPush component (warn, not error)
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '...'
})
export class CardComponent {
  constructor(private cdr: ChangeDetectorRef) {}

  onExternalEvent() {
    this.count++;
    this.cdr.markForCheck(); // ⚠️ warn — should use signal instead
  }
}
```

---

## Valid Examples

```typescript
// ✅ Signal-driven state — Angular schedules CD automatically
@Component({
  selector: 'app-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (item of items(); track item) { <li>{{ item }}</li> }
  `
})
export class ListComponent {
  items = signal<string[]>([]);

  addItem(item: string) {
    this.items.update(list => [...list, item]); // ✅ CD triggered automatically
  }
}
```

```typescript
// ✅ Observable + async pipe — no manual CD needed
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>{{ count$ | async }}</p>`
})
export class CardComponent {
  count$ = this.store.select(selectCount); // ✅ async pipe handles subscription + CD
  constructor(private store: Store) {}
}
```

---

## Exemptions

This rule has **no exemptions** for `detectChanges()`. For `markForCheck()` in `OnPush` components, severity is reduced to `warn` to account for legacy code that may have legitimate — though transitional — uses.

---

## How to Fix

| Before | After |
|---|---|
| `this.count++; this.cdr.detectChanges()` | `this.count = signal(0); this.count.update(v => v + 1)` |
| `this.data = resp; this.cdr.markForCheck()` | `this.data = toSignal(this.http.get(...), { initialValue: null })` |

---

## Related Rules

- [`prefer-on-push-component-change-detection`](../performance/prefer-on-push-component-change-detection.md) — require `OnPush` so CD pressure is reduced globally
- [`to-signal-require-initial-value`](../reactivity/to-signal-require-initial-value.md) — safe `toSignal()` usage
