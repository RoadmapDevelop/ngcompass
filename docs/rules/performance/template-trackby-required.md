# template-trackby-required

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Performance |
| **Applies to** | Template files |
| **Stream** | `TemplateAttribute`, `TemplateBlock` |
| **Rule names** | `template-trackby-required-for-ngfor` (legacy) · `template-track-required-for-atfor` (modern) |

---

## Why This Rule Exists

When Angular renders a list with `*ngFor` or `@for`, it must reconcile the old DOM with the new array on every change. Without a tracking expression, Angular cannot tell which item is which — so it **destroys and recreates every DOM node** in the list, even when only one item changed.

```
List update without trackBy (❌):
  Items: [A, B, C] → [A, B', C]  (only B changed)
  ─────────────────────────────────────────────────
  Angular destroys:  <li>A</li> <li>B</li> <li>C</li>
  Angular creates:   <li>A</li> <li>B'</li> <li>C</li>
  Full DOM churn — 3 destroys + 3 creates for 1 change.

List update with trackBy item.id (✅):
  Angular knows A and C are the same nodes — reuses them.
  Only <li>B</li> is destroyed and recreated.
  2 DOM operations instead of 6.
```

For large lists, the difference is **100× or more** in rendering time.

---

## Invalid Examples

```html
<!-- ❌ *ngFor without trackBy -->
<li *ngFor="let item of items">{{ item.name }}</li>

<!-- ❌ @for without track -->
@for (item of items) {
  <li>{{ item.name }}</li>
}
```

```typescript
// ❌ Dynamic ngFor without trackBy
// template:
// <app-row *ngFor="let row of rows">
```

---

## Valid Examples

```html
<!-- ✅ @for with track (modern — preferred) -->
@for (item of items; track item.id) {
  <li>{{ item.name }}</li>
}

<!-- ✅ @for with track by index (when items have no stable ID) -->
@for (item of items; track $index) {
  <li>{{ item.name }}</li>
}
```

```html
<!-- ✅ *ngFor with trackBy function (legacy) -->
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>
```

```typescript
// ✅ trackBy function in the component class
@Component({
  template: `
    <li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>
  `
})
export class ListComponent {
  items: Item[] = [];

  trackById(_: number, item: Item): number {
    return item.id;
  }
}
```

---

## Track Expression Guide

| Scenario | Track expression |
|---|---|
| Items have a unique `id` | `track item.id` |
| Items have a unique compound key | `track item.type + ':' + item.id` |
| Items are primitives (strings/numbers) | `track item` |
| No stable identity (last resort) | `track $index` |

> **Warning:** `track $index` should be a last resort — it only prevents full re-renders when items are inserted/removed from the end of the list.

---

## Exemptions

There are **no exemptions** for lists. Every `*ngFor` and `@for` must include a tracking expression.

---

## Migration

```html
<!-- Before (legacy) -->
<li *ngFor="let item of items">{{ item.name }}</li>

<!-- After (legacy with trackBy) -->
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>

<!-- After (modern — preferred) -->
@for (item of items; track item.id) {
  <li>{{ item.name }}</li>
}
```

---

## Related Rules

- [`template-prefer-control-flow`](../template/template-prefer-control-flow.md) — migrate `*ngFor` to `@for`
- [`template-no-call-expression`](./template-no-call-expression.md) — avoid function calls in track expressions
