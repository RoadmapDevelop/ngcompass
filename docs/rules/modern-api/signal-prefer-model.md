# signal-prefer-model

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | Modern API |
| **Applies to** | `.component.ts`, `.directive.ts` |
| **Stream** | `AnyAngularClass` |

---

## Why This Rule Exists

A common Angular pattern for two-way data binding requires **two declarations**:

```typescript
@Input()  value: string = '';
@Output() valueChange = new EventEmitter<string>();
```

Angular 17.2 introduced `model()` which replaces this pair with a **single signal** that supports both reading and writing, eliminating half the boilerplate:

```typescript
value = model('');  // writable Signal<string> with two-way binding support
```

The `model()` API:

- Creates a writable signal that parents can bind to with `[(value)]="x"`.
- Eliminates the `*Change` EventEmitter boilerplate.
- Is fully reactive — child updates propagate to the parent via signal graph.
- Works seamlessly with `computed()` and `effect()`.

---

## Invalid Examples

```typescript
// ❌ Classic @Input + @Output two-way binding pair
@Component({
  selector: 'app-text-input',
  template: `<input [value]="value" (input)="onChange($event)">`
})
export class TextInputComponent {
  @Input()  value: string = '';                    // ⚠️ warn
  @Output() valueChange = new EventEmitter<string>(); // ⚠️ warn (paired with above)

  onChange(e: Event) {
    this.valueChange.emit((e.target as HTMLInputElement).value);
  }
}
```

```typescript
// ❌ Multiple two-way binding pairs
@Component({ selector: 'app-range', template: '...' })
export class RangeComponent {
  @Input()  min: number = 0;
  @Output() minChange = new EventEmitter<number>();

  @Input()  max: number = 100;
  @Output() maxChange = new EventEmitter<number>();
}
```

---

## Valid Examples

```typescript
// ✅ model() — single signal replaces the pair
@Component({
  selector: 'app-text-input',
  template: `<input [value]="value()" (input)="value.set($event.target.value)">`
})
export class TextInputComponent {
  value = model('');  // Signal<string> with two-way binding

  // Parent template: <app-text-input [(value)]="parentText" />
}
```

```typescript
// ✅ Multiple model() signals
@Component({ selector: 'app-range', template: '...' })
export class RangeComponent {
  min = model(0);
  max = model(100);

  // Automatically emits minChange/maxChange when set() is called
}
```

```typescript
// ✅ model.required() for mandatory two-way bindings
@Component({ selector: 'app-checkbox', template: '...' })
export class CheckboxComponent {
  checked = model.required<boolean>();

  toggle() {
    this.checked.update(v => !v);
  }
}
```

---

## Two-Way Binding Flow

```
Parent                              Child (model())
──────                              ───────────────
[(value)]="parentText"  ──────────▶  value = model('')
      ▲                                    │
      └────────────── value.set() ─────────┘
         (signal write propagates up automatically)
```

---

## Exemptions

- `@Output()` EventEmitters that are **not** paired with an `@Input()` of the same base name are not flagged (they are plain outputs, not two-way bindings).
- The rule checks for the naming convention: `@Input() x` + `@Output() xChange`.

---

## Migration Guide

```typescript
// Before
@Input()  selected: boolean = false;
@Output() selectedChange = new EventEmitter<boolean>();

onToggle() {
  this.selectedChange.emit(!this.selected);
}

// After
selected = model(false);

onToggle() {
  this.selected.update(v => !v);  // parent automatically receives the update
}
```

---

## Related Rules

- [`signal-prefer-input-signal`](./signal-prefer-input-signal.md) — migrate plain `@Input()`
- [`signal-prefer-output-function`](./signal-prefer-output-function.md) — migrate plain `@Output()`
