# signal-prefer-input-signal

| Property | Value |
|---|---|
| **Severity** | `error` (standalone) · `warn` (non-standalone) |
| **Category** | Modern API |
| **Applies to** | `.component.ts`, `.directive.ts` |
| **Stream** | `DecoratedProperty` |

---

## Why This Rule Exists

Angular 17.1 introduced `input()` and `input.required()` as signal-based replacements for the `@Input()` decorator. The new API:

- Returns a **`Signal<T>`** — the value is always accessible reactively without `ngOnChanges`.
- Is **type-narrowed** — `input.required<T>()` removes `undefined` from the type.
- Works with `computed()` and `effect()` without any bridge code.
- Supports **transform** and **alias** inline: `input('', { transform: trimString, alias: 'label' })`.

```
@Input() value: string = '';         input() signal
────────────────────                 ──────────────────
Decorator-based (legacy)             Function-based (modern)

Access in template: value            Access in template: value()
Access in class: this.value          Access in class: this.value()
React to changes: ngOnChanges()      React to changes: effect(() => this.value())
Type: string | undefined             Type: string (always defined)
```

---

## Invalid Examples

```typescript
// ❌ Legacy @Input() decorator
@Component({ selector: 'app-card', template: '{{ title }}' })
export class CardComponent {
  @Input() title: string = '';        // ⚠️ warn / ❌ error
  @Input() required count!: number;   // ⚠️ warn / ❌ error
}
```

```typescript
// ❌ @Input with alias (still should migrate)
@Directive({ selector: '[appHighlight]' })
export class HighlightDirective {
  @Input('appHighlight') color: string = 'yellow'; // ❌
}
```

---

## Valid Examples

```typescript
// ✅ input() for optional inputs with a default
@Component({ selector: 'app-card', template: '{{ title() }}' })
export class CardComponent {
  title = input('');           // Signal<string>
  count = input.required<number>(); // Signal<number> — required, no undefined
}
```

```typescript
// ✅ input() with transform and alias
@Directive({ selector: '[appHighlight]' })
export class HighlightDirective {
  color = input('yellow', {
    alias: 'appHighlight',
    transform: (v: string) => v.toLowerCase(),
  });
}
```

```typescript
// ✅ Using the signal value in computed/effect
@Component({ selector: 'app-price', template: '{{ discounted() | currency }}' })
export class PriceComponent {
  price    = input.required<number>();
  discount = input(0);

  discounted = computed(() => this.price() * (1 - this.discount())); // ✅ reactive
}
```

---

## Exemptions

- `@Input()` on properties that already use signal wrappers are not flagged.
- `@Output()` properties are handled by [`signal-prefer-output-function`](./signal-prefer-output-function.md).

---

## Migration Cheat Sheet

| Before | After |
|---|---|
| `@Input() x: T = default` | `x = input<T>(default)` |
| `@Input() required x!: T` | `x = input.required<T>()` |
| `@Input('alias') x: T` | `x = input<T>(default, { alias: 'alias' })` |
| `@Input({ transform: fn }) x` | `x = input(default, { transform: fn })` |
| `this.x` in class | `this.x()` in class |
| `x` in template | `x()` in template |
| `ngOnChanges` for reactions | `effect(() => this.x())` |

---

## Related Rules

- [`signal-prefer-output-function`](./signal-prefer-output-function.md) — migrate `@Output()`
- [`signal-prefer-model`](./signal-prefer-model.md) — migrate Input+Output pairs
- [`prefer-inject-over-constructor-di`](./prefer-inject-over-constructor-di.md) — modern DI
