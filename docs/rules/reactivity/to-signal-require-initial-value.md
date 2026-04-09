# to-signal-require-initial-value

| Property | Value |
|---|---|
| **Rule name** | `toSignal-require-initialValue` |
| **Severity** | `warn` |
| **Category** | Reactivity |
| **Applies to** | All `.ts` files |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

`toSignal()` converts an Observable into a Signal. Without configuration, the signal's type becomes `Signal<T | undefined>` because Angular cannot know what value to return _before_ the observable emits its first value.

This has two consequences:

1. **Type pollution** — every consumer must null-check: `if (data()) { ... }`.
2. **Template binding errors** — `data()?.property` needed everywhere instead of `data().property`.

Providing `initialValue` or `requireSync: true` eliminates the `undefined` from the type and makes the signal safe to use immediately.

```
Without initialValue:
  data = toSignal(this.http.get<Item[]>('/api'))
  // Type: Signal<Item[] | undefined>
  // Template: @if (data()) { @for (i of data()!; track i.id) }

With initialValue:
  data = toSignal(this.http.get<Item[]>('/api'), { initialValue: [] })
  // Type: Signal<Item[]>
  // Template: @for (i of data(); track i.id)  ← clean!
```

---

## Invalid Examples

```typescript
// ❌ toSignal() without initialValue or requireSync
@Component({ selector: 'app-list', template: '...' })
export class ListComponent {
  users = toSignal(this.userService.getUsers()); // ⚠️ warn — type is Signal<User[] | undefined>
}
```

```typescript
// ❌ Missing configuration — null initialValue still counts
products = toSignal(this.http.get<Product[]>('/api/products')); // ⚠️ warn
```

---

## Valid Examples

```typescript
// ✅ initialValue — explicit fallback before the observable emits
@Component({ selector: 'app-list', template: '...' })
export class ListComponent {
  users = toSignal(this.userService.getUsers(), {
    initialValue: [] as User[] // ✅ Signal<User[]>
  });
}
```

```typescript
// ✅ null initialValue — explicit fallback (null is intentional)
currentUser = toSignal(this.auth.user$, {
  initialValue: null // ✅ Signal<User | null>
});
```

```typescript
// ✅ requireSync: true — for synchronous observables (BehaviorSubject, etc.)
count = toSignal(this.store.select(selectCount), {
  requireSync: true // ✅ Signal<number> — store always has a value
});
```

```typescript
// ✅ Combining with computed
users = toSignal(this.userService.getUsers(), { initialValue: [] as User[] });
adminUsers = computed(() => this.users().filter(u => u.isAdmin));
```

---

## `initialValue` vs `requireSync`

| Option | When to use | Result type |
|---|---|---|
| `{ initialValue: [] }` | HTTP or async observable | `Signal<T>` (uses the default until first emit) |
| `{ initialValue: null }` | When `null` is a meaningful "not loaded yet" state | `Signal<T \| null>` |
| `{ requireSync: true }` | Observable is guaranteed to emit synchronously (BehaviorSubject, store selectors) | `Signal<T>` (throws if not synchronous) |

---

## Exemptions

There are **no exemptions**. Every `toSignal()` call must provide either `initialValue` or `requireSync: true`.

---

## Related Rules

- [`rxjs-prefer-to-signal-for-template-state`](./rxjs-prefer-to-signal-for-template-state.md)
- [`rxjs-no-subscribe-in-component`](./rxjs-no-subscribe-in-component.md)
