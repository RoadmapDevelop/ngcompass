# template-no-call-expression

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Performance |
| **Applies to** | Template files (inline + external) |
| **Stream** | `TemplateExpression` |

---

## Why This Rule Exists

Every function call inside a template binding **executes on every change detection cycle**. Angular has no way to know whether the return value has changed — it must call the function again every time. This makes even simple functions an O(n × CD-cycles) performance problem.

```
Template: {{ formatName(user) }}

Change detection runs:
  ┌─────────────────────────────────────────────────────┐
  │ Cycle 1: formatName(user) called → 'John Doe'       │
  │ Cycle 2: formatName(user) called → 'John Doe' (same)│
  │ Cycle 3: formatName(user) called → 'John Doe' (same)│
  │ ... every mouse move, keypress, timer tick ...       │
  └─────────────────────────────────────────────────────┘

With a signal:
  ┌─────────────────────────────────────────────────────┐
  │ Computed once when user signal changes.              │
  │ Template reads cached value. No redundant calls.     │
  └─────────────────────────────────────────────────────┘
```

---

## Invalid Examples

```typescript
// ❌ Function call in interpolation
// template:
// {{ formatDate(item.createdAt) }}
```

```typescript
// ❌ Function call in binding
// template:
// <app-card [config]="buildConfig(item)">
```

```typescript
// ❌ Function call in *ngFor or @for
// template:
// @for (item of getFilteredItems(); track item.id) { ... }
```

```typescript
// ❌ Function call in @if condition
// template:
// @if (isVisible(item)) { ... }
```

---

## Valid Examples

```typescript
// ✅ Pure pipe — memoised by Angular, only re-runs on value change
// template: {{ item.createdAt | date:'shortDate' }}
```

```typescript
// ✅ Signal-based computed — reactive and cached
@Component({ template: '{{ formattedDate() }}' })
export class MyComponent {
  createdAt = input<Date>();
  formattedDate = computed(() =>
    this.createdAt() ? formatDate(this.createdAt()!, 'shortDate', 'en') : ''
  );
}
```

```typescript
// ✅ Property getter → signal (preferred for OnPush)
@Component({ template: '{{ filteredItems() | json }}' })
export class ListComponent {
  items  = input<Item[]>([]);
  filter = input('');

  filteredItems = computed(() =>
    this.items().filter(i => i.name.includes(this.filter()))
  );
}
```

---

## Allowed Exceptions

The following calls are **intentionally exempted** because they are either pure, standard, or have negligible performance impact:

**Free-function allowlist:**
`translate`, `$localize`, `$any`

**Member method allowlist:**
`slice`, `toString`, `toFixed`, `toUpperCase`, `toLowerCase`, `trim`, `join`, `includes`, `indexOf`, `startsWith`, `endsWith`, `charAt`, `substring`, `replace`, `split`, `concat`, `toISOString`, `toLocaleDateString`, `toLocaleTimeString`, `toLocaleString`

**Signal invocations:**
`signal()`, `computed()` calls (i.e., `mySignal()` in templates) are always allowed.

---

## Migration Patterns

| Template pattern | Replacement |
|---|---|
| `{{ format(value) }}` | Create a `computed()` or a `pipe` |
| `[binding]="build(item)"` | Move `build()` to a `computed()` field |
| `@for (x of filter(); ...)` | `filteredItems = computed(() => ...)` |
| `@if (check(x))` | `isVisible = computed(() => check(this.x()))` |

---

## Related Rules

- [`template-no-object-literal-binding`](./template-no-object-literal-binding.md) — forbid inline object literals
- [`template-no-array-literal-binding`](./template-no-array-literal-binding.md) — forbid inline array literals
- [`prefer-on-push-component-change-detection`](./prefer-on-push-component-change-detection.md) — reduce CD frequency
