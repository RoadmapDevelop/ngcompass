# rxjs-no-nested-subscribe

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Correctness |
| **Applies to** | All `.ts` files |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

Nesting one `.subscribe()` call inside another creates a **pyramid of doom** that:

- **Leaks subscriptions** — the inner subscription is not tracked by the outer one and may never be cleaned up.
- **Loses error propagation** — errors in the inner stream don't surface in the outer stream.
- **Cannot be cancelled** — switching outer emission doesn't cancel a running inner subscription.
- **Is unreadable** — async logic buried three levels deep is impossible to reason about.

RxJS provides higher-order mapping operators that solve every nesting scenario declaratively.

```
Nested subscribe flow (❌)              Flattened flow (✅)
─────────────────────────               ─────────────────────────
outer$.subscribe(user => {              outer$.pipe(
  inner$.subscribe(posts => {             switchMap(user => inner$)
    this.render(user, posts);           ).subscribe(([user, posts]) =>
  });                                     this.render(user, posts)
});                                     );

Inner sub leaks if outer re-emits.     switchMap cancels stale inner sub.
```

---

## Invalid Examples

```typescript
// ❌ Basic nested subscribe — inner subscription leaks
this.user$.subscribe(user => {
  this.posts$.subscribe(posts => {
    this.render(user, posts); // ❌ error
  });
});
```

```typescript
// ❌ Nested subscribe inside a lifecycle hook
ngOnInit() {
  this.route.params.subscribe(params => {
    this.api.getItem(params['id']).subscribe(item => { // ❌ error
      this.item = item;
    });
  });
}
```

```typescript
// ❌ Triple nesting — compounding the problem
this.auth$.subscribe(user => {
  this.org$.subscribe(org => {
    this.billing$.subscribe(plan => { // ❌ error
      this.setup(user, org, plan);
    });
  });
});
```

---

## Valid Examples

```typescript
// ✅ switchMap — cancels stale inner observable when outer re-emits
this.route.params.pipe(
  switchMap(params => this.api.getItem(params['id'])),
  takeUntilDestroyed()
).subscribe(item => this.item = item);
```

```typescript
// ✅ combineLatest — combine multiple streams reactively
combineLatest([this.user$, this.posts$]).pipe(
  takeUntilDestroyed()
).subscribe(([user, posts]) => this.render(user, posts));
```

```typescript
// ✅ forkJoin — wait for all one-shot observables
forkJoin({
  user: this.api.getUser(),
  org:  this.api.getOrg(),
  plan: this.api.getBilling(),
}).subscribe(({ user, org, plan }) => this.setup(user, org, plan));
```

```typescript
// ✅ mergeMap — concurrent inner streams (e.g. parallel uploads)
this.files$.pipe(
  mergeMap(file => this.upload(file)),
  takeUntilDestroyed()
).subscribe(result => this.onUploaded(result));
```

---

## Operator Selection Guide

| Scenario | Operator |
|---|---|
| Cancel previous request when new value arrives | `switchMap` |
| Process all requests concurrently | `mergeMap` |
| Process requests one at a time, in order | `concatMap` |
| All streams must complete before combining | `forkJoin` |
| Combine latest values from multiple streams | `combineLatest` |

---

## Exemptions

There are **no exemptions**. All nested `.subscribe()` calls are flagged. If you have a genuinely fire-and-forget inner subscription, use `take(1)` combined with a flattening operator:

```typescript
// Even fire-and-forget should use concatMap + take(1)
this.trigger$.pipe(
  concatMap(() => this.api.notify().pipe(take(1)))
).subscribe();
```

---

## Related Rules

- [`rxjs-require-take-until-destroyed`](../reactivity/rxjs-require-take-until-destroyed.md) — teardown for long-lived subscriptions
- [`rxjs-no-subscribe-in-component`](../reactivity/rxjs-no-subscribe-in-component.md) — subscription hygiene in components
