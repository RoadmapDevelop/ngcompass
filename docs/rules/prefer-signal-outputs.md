# prefer-signal-outputs

**Severity:** `moderate`  **Phase:** 2 — Priority 1 (Critical Gap)  **Stream:** `AngularClass`

## Rationale

Angular 17.3 introduced `output<T>()` as the signal-based replacement for `@Output()` / `EventEmitter`. It:
- Integrates with the reactive signal graph
- Removes `EventEmitter` boilerplate
- Is consistent with `input()` and `viewChild()` (completing the signals trilogy)
- Provides stronger typing without needing explicit generic on EventEmitter

## Rule Details

Flags any `@Output()` decorated property in a `@Component` or `@Directive`.

### ❌ Failing

```ts
@Component({ ... })
export class ButtonComponent {
    @Output() clicked = new EventEmitter<void>();
    @Output('save') saved = new EventEmitter<string>();
}
```

### ✅ Passing

```ts
@Component({ ... })
export class ButtonComponent {
    clicked = output<void>();
    saved = output<string>();
}
```

## Configuration

This rule has no configuration options.

## When To Disable

- When targeting Angular < 17.3 where `output()` is not available.

## See Also

- [`prefer-signal-inputs`](./prefer-signal-inputs.md)
- [`prefer-signal-queries`](./prefer-signal-queries.md)
- [Angular Signals — output()](https://angular.dev/guide/signals/outputs)
