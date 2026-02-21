# guard-class-suffix

**Severity:** `moderate`  **Phase:** 2 — Priority 2 (Naming Conventions)  **Stream:** `AnyAngularClass`

## Rationale

Angular guards and resolvers are `@Injectable` classes that expose specific lifecycle methods (`canActivate`, `resolve`, etc.). Naming them with the appropriate suffix (`Guard` or `Resolver`) makes their routing role immediately obvious without consulting the route configuration.

## Detection Strategy

This rule detects class role **syntactically** (no type resolution required) by checking for the presence of well-known guard/resolver method names:

| Methods found | Expected suffix |
|---|---|
| `canActivate`, `canActivateChild`, `canDeactivate`, `canLoad`, `canMatch` | `Guard` |
| `resolve` | `Resolver` |

## Rule Details

### ❌ Failing

```ts
@Injectable({ providedIn: 'root' })
export class AuthCheck {   // ← should be AuthGuard
    canActivate(): boolean { ... }
}

@Injectable({ providedIn: 'root' })
export class UserData {    // ← should be UserDataResolver
    resolve(): Observable<User> { ... }
}
```

### ✅ Passing

```ts
@Injectable({ providedIn: 'root' })
export class AuthGuard {
    canActivate(): boolean { ... }
}

@Injectable({ providedIn: 'root' })
export class UserDataResolver {
    resolve(): Observable<User> { ... }
}
```

## Configuration

This rule has no configuration options. The expected suffix is determined by which lifecycle method is found.

## When To Disable

When using functional guards (`export const authGuard = () => ...`), this rule never fires — functional guards are not classes and are not processed by ngcompass class-level rules.

## See Also

- [`service-class-suffix`](./service-class-suffix.md)
- [Angular Guards](https://angular.dev/guide/routing/common-router-tasks#preventing-unauthorized-access)
