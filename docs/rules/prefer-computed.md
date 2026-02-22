# prefer-computed

**Severity:** `low`  **Phase:** 2 — Priority 4 (Signal Modernisation)  **Stream:** `AngularClass`

## Rationale

TypeScript getters in signal-based Angular components re-compute on every access. `computed()` signals, by contrast, are:
- **Memoised** — only recompute when a tracked signal dependency changes
- **Tracked** — Angular knows which computed values need updating
- **Lazy** — not re-evaluated if no consumer reads them in the current cycle

## Detection Strategy

This rule uses a **syntax-only heuristic**: it flags getter methods that contain at least one `this.xxx()` call expression with no arguments — the pattern used to read signal values. It cannot distinguish signal reads from regular method calls without type information, so some false positives are possible.

## Rule Details

### ❌ Failing

```ts
@Component({ ... })
export class ProfileComponent {
    firstName = input<string>('');
    lastName = input<string>('');

    get fullName(): string {
        return this.firstName() + ' ' + this.lastName();  // ← flagged
    }
}
```

### ✅ Passing

```ts
@Component({ ... })
export class ProfileComponent {
    firstName = input<string>('');
    lastName = input<string>('');

    fullName = computed(() => this.firstName() + ' ' + this.lastName());
}
```

## Configuration

This rule has no configuration options.

## When To Disable

When the getter makes regular method calls (not signal reads) and is correctly a getter rather than a computed signal.

## See Also

- [Angular computed()](https://angular.dev/guide/signals#computed-signals)
- [`no-ngonchanges-for-derived-state`](./no-ngonchanges-for-derived-state.md)
