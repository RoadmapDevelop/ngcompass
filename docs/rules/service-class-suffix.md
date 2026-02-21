# service-class-suffix

**Severity:** `moderate`  **Phase:** 2 — Priority 2 (Naming Conventions)  **Stream:** `AnyAngularClass`

## Rationale

All `@Injectable` classes — services, guards, resolvers, and interceptors — should have a suffix that communicates their role. The Angular Style Guide rule 02-04 mandates this for services. This rule enforces the convention across all injectable types.

## Rule Details

Flags `@Injectable` decorated classes whose name does not end with one of the configured suffixes.

**Default accepted suffixes:** `Service`, `Guard`, `Resolver`, `Interceptor`, `Store`

### ❌ Failing

```ts
@Injectable({ providedIn: 'root' })
export class Authentication { ... }  // Missing suffix
```

### ✅ Passing

```ts
@Injectable({ providedIn: 'root' })
export class AuthenticationService { ... }

@Injectable({ providedIn: 'root' })
export class AuthInterceptor implements HttpInterceptor { ... }
```

## Configuration

```json
{
    "rules": {
        "service-class-suffix": ["moderate", {
            "suffixes": ["Service", "Guard", "Resolver", "Interceptor", "Store", "Facade"]
        }]
    }
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `suffixes` | `string[]` | `["Service", "Guard", "Resolver", "Interceptor", "Store"]` | Accepted class name suffixes |

## When To Disable

When using domain-driven naming where the class name already communicates its role without a suffix (e.g., `UserRepository`). Add the custom suffix to the configuration instead of disabling.

## See Also

- [`guard-class-suffix`](./guard-class-suffix.md)
- [Angular Style Guide — Service names](https://angular.dev/style-guide#style-02-04)
