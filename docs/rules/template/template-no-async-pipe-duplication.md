# template-no-async-pipe-duplication

| Property | Value |
|---|---|
| **Severity** | `warn` |
| **Category** | Template |
| **Applies to** | Template files |
| **Stream** | `TemplateExpression` |

---

## Why This Rule Exists

The `async` pipe **subscribes to an observable** each time it is applied. If the same observable is piped with `async` in multiple places within the same template, the component creates **multiple active subscriptions** to the same data source:

```html
<!-- Creates TWO subscriptions to user$ -->
<p>{{ user$ | async }}</p>
<img [src]="(user$ | async)?.avatar">
```

This is problematic because:
- **Doubles network requests** if the observable is cold (e.g., direct `HttpClient` call).
- **Causes visual inconsistency** if the observable emits between the two subscriptions.
- **Wastes memory** — two subscription objects held simultaneously.

The solution is to share the subscription using `@if ... as` or `*ngIf as`, or to convert to a signal with `toSignal()`.

---

## Invalid Examples

```html
<!-- ❌ Two async pipe subscriptions to the same observable -->
<div>{{ user$ | async }}</div>
<span>Hello, {{ (user$ | async)?.name }}</span>

<!-- ❌ Observable in *ngFor and in a sibling binding -->
<p>Count: {{ items$ | async | json | count }}</p>
@for (item of items$ | async; track item.id) { ... }

<!-- ❌ Same observable in nested template expressions -->
@if (data$ | async) {
  <p>{{ data$ | async }}</p>
}
```

---

## Valid Examples

```html
<!-- ✅ Share subscription with @if ... as (Angular 17+) -->
@if (user$ | async; as user) {
  <div>{{ user }}</div>
  <span>Hello, {{ user.name }}</span>
}

<!-- ✅ Share subscription with *ngIf as (legacy) -->
<ng-container *ngIf="user$ | async as user">
  <div>{{ user }}</div>
  <span>Hello, {{ user.name }}</span>
</ng-container>

<!-- ✅ Convert to signal — no async pipe at all -->
<!-- In component: user = toSignal(user$, { initialValue: null }); -->
@if (user()) {
  <div>{{ user() }}</div>
  <span>Hello, {{ user()!.name }}</span>
}
```

---

## Detection Logic

The rule tracks every `| async` expression in a template and builds a **canonical string key** for the observable expression. If the same key appears more than once, the second occurrence is flagged.

The `stringify()` function handles these expression types:

| AST Node | Example | Key produced |
|---|---|---|
| Identifier | `user$` | `user$` |
| MemberExpression | `this.auth.user$` | `this.auth.user$` |
| CallExpression | `getUser()` | `getUser()` |
| LogicalExpression | `user$ \|\| guest$` | `user$\|\|guest$` |
| ConditionalExpression | `loggedIn ? user$ : guest$` | `loggedIn?user$:guest$` |
| BinaryExpression | `count$ + 1` | `count$+1` |
| Array/Object literal | `[a$, b$]` | `[a$,b$]` |

If the expression is too complex to stringify, the rule **does not flag it** (avoids false positives).

---

## Scope

Duplicate detection is **per template**. Two separate component templates with identical `| async` bindings are not flagged against each other.

---

## Exemptions

- The **first occurrence** of any observable in a template is never flagged.
- Non-`async` pipes (`| date`, `| currency`, etc.) are never flagged.
- Expressions that cannot be stringified are not flagged.

---

## Related Rules

- [`rxjs-prefer-to-signal-for-template-state`](../reactivity/rxjs-prefer-to-signal-for-template-state.md) — convert template observables to signals
- [`template-prefer-control-flow`](./template-prefer-control-flow.md) — use `@if ... as` for sharing
