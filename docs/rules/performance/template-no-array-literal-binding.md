# template-no-array-literal-binding

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | Performance |
| **Applies to** | Template files |
| **Stream** | `TemplateExpression` |

---

## Why This Rule Exists

An array literal in a template binding (`[items]="[1, 2, 3]"`) creates a **new array object on every change detection cycle**. Because Angular uses reference equality to detect input changes, a child component receiving this binding will see a "new" array every cycle — forcing it to re-render even when the data is identical.

```
Change detection (n cycles):
  [items]="[1, 2, 3]"
  ─────────────────────────────────────────────
  Cycle 1: new Array([1,2,3]) → ref A → child re-renders ❌
  Cycle 2: new Array([1,2,3]) → ref B → child re-renders ❌
  Cycle 3: new Array([1,2,3]) → ref C → child re-renders ❌

  With signal:
  items = signal([1, 2, 3])
  [items]="items()"
  ─────────────────────────────────────────────
  Cycle 1: same ref → child skips ✅ (OnPush)
  Cycle 2: same ref → child skips ✅
```

---

## Invalid Examples

```typescript
// ❌ Inline array literal passed to child component
// template:
// <app-chart [series]="['Jan', 'Feb', 'Mar']"></app-chart>
```

```typescript
// ❌ Inline array in @for track expression
// template:
// @for (item of [1, 2, 3]; track item) { ... }
```

```typescript
// ❌ Array literal in attribute binding
// template:
// <app-select [options]="['small', 'medium', 'large']">
```

---

## Valid Examples

```typescript
// ✅ Signal field — stable reference
@Component({ template: '<app-chart [series]="months()">' })
export class DashboardComponent {
  months = signal(['Jan', 'Feb', 'Mar']);
}
```

```typescript
// ✅ Class property — reference only changes when reassigned
@Component({ template: '<app-select [options]="sizeOptions">' })
export class FormComponent {
  readonly sizeOptions = ['small', 'medium', 'large'] as const;
}
```

```typescript
// ✅ computed() for dynamic arrays
@Component({ template: '<app-list [items]="activeItems()">' })
export class ListComponent {
  items  = input<Item[]>([]);
  active = input(true);

  activeItems = computed(() =>
    this.active() ? this.items() : []
  );
}
```

---

## Exemptions

There are no exemptions. All array literals in template expressions are flagged.

---

## Related Rules

- [`template-no-object-literal-binding`](./template-no-object-literal-binding.md) — same problem for object literals
- [`template-no-call-expression`](./template-no-call-expression.md) — function calls in templates
- [`prefer-on-push-component-change-detection`](./prefer-on-push-component-change-detection.md)
