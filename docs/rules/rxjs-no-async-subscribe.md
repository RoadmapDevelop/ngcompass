# rxjs-no-async-subscribe

**Severity:** `high`  **Phase:** 2 — Priority 5 (RxJS Safety)  **Stream:** `AngularClass`

## Rationale

Using `async` callbacks inside `.subscribe()` breaks the RxJS error propagation model:

1. The `async` function returns a **Promise** immediately
2. `subscribe()` receives that Promise as its "next" value — it does not await it
3. Any error thrown **inside** the async callback becomes an **unhandled Promise rejection**, not a RxJS error notification
4. The error handler passed to `subscribe()` is never called for errors inside the async callback

This leads to silent failures, unhandled rejection warnings, and memory leaks.

## Rule Details

Flags any `.subscribe()` call whose first argument is an `async` arrow function or `async` function expression.

### ❌ Failing

```ts
this.userService.getUser(id).subscribe(async (user) => {
    const profile = await this.profileService.load(user.id);
    this.profile = profile;
});
```

```ts
// Error inside async callback is NOT caught by subscribe's error handler:
this.data$.subscribe(async (data) => {
    const result = await this.process(data);  // error here → unhandled rejection
}, (err) => console.error(err));              // ← never called for async errors
```

### ✅ Passing

```ts
// Use switchMap to chain async operations inside the RxJS pipeline:
this.userService.getUser(id).pipe(
    switchMap(user => this.profileService.load(user.id)),
    takeUntilDestroyed(),
).subscribe(profile => {
    this.profile = profile;
});
```

## Configuration

This rule has no configuration options.

## When To Disable

Almost never. The pattern is consistently wrong in terms of error handling.

## See Also

- [`rxjs-no-nested-subscribe`](./rxjs-no-nested-subscribe.md)
- [`rxjs-prefer-takeuntil`](./rxjs-prefer-takeuntil.md)
- [RxJS Error Handling](https://rxjs.dev/guide/operators#error-handling-operators)
