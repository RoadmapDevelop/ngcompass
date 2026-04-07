# template-prefer-control-flow

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Template |
| **Applies to** | Template files |
| **Stream** | `TemplateAttribute` |

---

## Why This Rule Exists

Angular 17 introduced **built-in control flow blocks** (`@if`, `@for`, `@switch`) as a first-class replacement for the structural directives (`*ngIf`, `*ngFor`, `*ngSwitch`) from `CommonModule`. The new syntax offers:

- **Better performance** — built-in to the compiler, no directive overhead.
- **Tree-shaking** — eliminates the need to import `CommonModule` or `NgIf`/`NgFor`/`NgSwitch`.
- **Type-narrowing** — `@if (user; as u) { {{ u.name }} }` narrows `u` properly in TypeScript.
- **Cleaner syntax** — no `ng-container` wrappers needed for `else` or `else if`.
- **Better `@for`** — `track` is required (enforced at compile time), `$empty` block is built-in.

---

## Invalid Examples

```html
<!-- ❌ *ngIf -->
<div *ngIf="isLoggedIn">Welcome!</div>
<div *ngIf="user; else loading">{{ user.name }}</div>
<ng-template #loading><spinner /></ng-template>

<!-- ❌ *ngFor -->
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>

<!-- ❌ *ngSwitch / *ngSwitchCase / *ngSwitchDefault -->
<div [ngSwitch]="status">
  <p *ngSwitchCase="'active'">Active</p>
  <p *ngSwitchCase="'inactive'">Inactive</p>
  <p *ngSwitchDefault>Unknown</p>
</div>
```

---

## Valid Examples

```html
<!-- ✅ @if — with type-narrowed else block -->
@if (isLoggedIn) {
  <div>Welcome!</div>
} @else {
  <div>Please log in.</div>
}

<!-- ✅ @if with type narrowing (no more null checks needed) -->
@if (user; as u) {
  <p>{{ u.name }}</p>    <!-- u is narrowed to non-null here -->
}

<!-- ✅ @for with required track -->
@for (item of items; track item.id) {
  <li>{{ item.name }}</li>
} @empty {
  <li>No items found.</li>
}

<!-- ✅ @switch -->
@switch (status) {
  @case ('active')   { <p>Active</p> }
  @case ('inactive') { <p>Inactive</p> }
  @default           { <p>Unknown</p> }
}
```

---

## Directive Replacement Map

| Legacy directive | Modern block | Notes |
|---|---|---|
| `*ngIf="cond"` | `@if (cond)` | |
| `*ngIf="x; else tmpl"` | `@if (x) { } @else { }` | Eliminates `<ng-template>` |
| `*ngIf="x; as y"` | `@if (x; as y)` | Better type narrowing |
| `*ngFor="let i of arr; trackBy: fn"` | `@for (i of arr; track i.id)` | `track` enforced by compiler |
| `[ngSwitch]="val"` + `*ngSwitchCase` | `@switch (val)` + `@case` | |
| `*ngSwitchDefault` | `@default` | |

---

## Automated Migration

Angular provides an official migration schematic:

```bash
ng generate @angular/core:control-flow
```

This automatically converts all `*ngIf`, `*ngFor`, and `*ngSwitch` usages in your project to the new control flow syntax.

---

## Exemptions

There are **no exemptions**. All uses of legacy structural directives are flagged. If you are working in a codebase that has not yet migrated to Angular 17+, this rule should be disabled until the migration is scheduled.

---

## Related Rules

- [`template-trackby-required`](../performance/template-trackby-required.md) — `track` is required in `@for`
- [`template-no-async-pipe-duplication`](./template-no-async-pipe-duplication.md) — `@if ... as` to share subscriptions
