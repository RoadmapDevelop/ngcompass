# template-no-object-literal-binding

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | Performance |
| **Applies to** | Template files |
| **Stream** | `TemplateExpression` |

---

## Why This Rule Exists

An object literal in a template binding (`[config]="{ size: 'lg' }"`) creates a **new object reference on every change detection cycle**. Child components using `OnPush` detect input changes by reference — so they will always see a "changed" input and always re-render, making `OnPush` useless for that binding.

```
[config]="{ color: 'red', size: 10 }"
─────────────────────────────────────
Cycle 1: { color: 'red', size: 10 }  ← ref A
Cycle 2: { color: 'red', size: 10 }  ← ref B (new object! child re-renders)
Cycle 3: { color: 'red', size: 10 }  ← ref C (new object! child re-renders)

vs.

config = signal({ color: 'red', size: 10 })
[config]="config()"
─────────────────────────────────────
Cycle 1: same ref  ← child skips ✅
Cycle 2: same ref  ← child skips ✅
```

---

## Invalid Examples

```typescript
// ❌ Inline object literal
// template:
// <app-chart [options]="{ responsive: true, legend: false }">
```

```typescript
// ❌ Style object literal
// template:
// <div [ngStyle]="{ color: 'red', fontSize: '14px' }">
```

```typescript
// ❌ Class map literal
// template:
// <div [ngClass]="{ active: isActive, disabled: isDisabled }">
```

---

## Valid Examples

```typescript
// ✅ Signal field
@Component({ template: '<app-chart [options]="chartOptions()">' })
export class DashboardComponent {
  chartOptions = signal({ responsive: true, legend: false });
}
```

```typescript
// ✅ computed() — reactive, cached, stable reference
@Component({ template: '<div [ngClass]="classes()">' })
export class ItemComponent {
  isActive   = input(false);
  isDisabled = input(false);

  classes = computed(() => ({
    active:   this.isActive(),
    disabled: this.isDisabled(),
  }));
}
```

```typescript
// ✅ readonly class property for static configs
@Component({ template: '<app-map [config]="mapConfig">' })
export class MapComponent {
  readonly mapConfig = { zoom: 10, center: [0, 0] };
}
```

---

## Exemptions

There are no exemptions. All object literals in template expressions are flagged.

---

## Related Rules

- [`template-no-array-literal-binding`](./template-no-array-literal-binding.md)
- [`template-no-call-expression`](./template-no-call-expression.md)
