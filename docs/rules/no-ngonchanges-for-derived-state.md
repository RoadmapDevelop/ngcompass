# no-ngonchanges-for-derived-state

**Severity:** `moderate`  **Phase:** 2 — Priority 4 (Signal Modernisation)  **Stream:** `AngularClass`

## Rationale

Before Angular signals, `ngOnChanges()` was the standard way to compute derived values when inputs changed:

```ts
ngOnChanges() {
    this.fullName = this.firstName + ' ' + this.lastName;
}
```

With signal inputs and `computed()`, this pattern is eliminated. Angular tracks dependencies automatically — no lifecycle hook needed, no manual synchronisation, no missed updates.

## Detection Strategy

This rule flags `ngOnChanges()` methods whose body consists **entirely** of `this.x = expr` assignment statements. When every statement is a pure assignment, the method is almost certainly computing derived state that `computed()` can express more cleanly.

Methods that mix assignments with side effects (service calls, logging, routing) are **not** flagged.

## Rule Details

### ❌ Failing

```ts
@Component({ ... })
export class NameComponent implements OnChanges {
    @Input() firstName = '';
    @Input() lastName = '';
    fullName = '';

    ngOnChanges() {
        this.fullName = this.firstName + ' ' + this.lastName;  // ← pure derivation
    }
}
```

### ✅ Passing

```ts
@Component({ ... })
export class NameComponent {
    firstName = input<string>('');
    lastName = input<string>('');
    fullName = computed(() => this.firstName() + ' ' + this.lastName());
}
```

### Not flagged (mixed side effects)

```ts
ngOnChanges() {
    this.fullName = this.firstName + ' ' + this.lastName; // assignment
    this.analyticsService.track('name-change');           // side effect → not flagged
}
```

## Configuration

This rule has no configuration options.

## See Also

- [`prefer-computed`](./prefer-computed.md)
- [`prefer-signal-inputs`](./prefer-signal-inputs.md)
- [Angular Signals](https://angular.dev/guide/signals)
