# pipe-class-suffix

**Severity:** `moderate`  **Phase:** 2 — Priority 2 (Naming Conventions)  **Stream:** `AnyAngularClass`

## Rationale

Consistent class naming makes Angular pipes immediately identifiable without reading the decorator. This rule parallels `component-class-suffix` and `directive-class-suffix`, completing the naming convention trio for declarables.

## Rule Details

Flags `@Pipe` decorated classes whose name does not end with `Pipe` (or a configured suffix).

### ❌ Failing

```ts
@Pipe({ name: 'currencyFormat' })
export class CurrencyFormat implements PipeTransform { ... }
```

### ✅ Passing

```ts
@Pipe({ name: 'currencyFormat' })
export class CurrencyFormatPipe implements PipeTransform { ... }
```

## Configuration

```json
{
    "rules": {
        "pipe-class-suffix": ["moderate", { "suffixes": ["Pipe"] }]
    }
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `suffixes` | `string[]` | `["Pipe"]` | Accepted class name suffixes |

## See Also

- [`component-class-suffix`](./component-class-suffix.md)
- [`directive-class-suffix`](./directive-class-suffix.md)
- [Angular Style Guide — Naming](https://angular.dev/style-guide#style-02-03)
