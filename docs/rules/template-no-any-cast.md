# template-no-any-cast

**Severity:** `high`  **Phase:** 2 — Priority 3 (Template Coverage)  **Stream:** `TemplateExpression`

## Rationale

`$any(expr)` is a special Angular template function that casts the expression to `any`, bypassing the template type checker. It is analogous to `as any` in TypeScript — a type-safety escape hatch that silences real errors rather than fixing them.

Problems caused by `$any()`:
- Hides genuine type errors that would catch bugs at compile time
- Makes it impossible for the Angular Language Service to provide accurate completions
- Creates technical debt: casts accumulate and are never removed

## Rule Details

Flags any call to `$any()` in template expressions.

### ❌ Failing

```html
<!-- $any() suppresses a type error — fix the type instead -->
<span>{{ $any(user).adminLevel }}</span>
<div [class.active]="$any(item).isSelected"></div>
```

### ✅ Passing

```html
<!-- Fix the type: narrow it or add the property to the interface -->
<span>{{ (user as AdminUser).adminLevel }}</span>
<!-- Or better: use a type guard in the component -->
<span>{{ user.adminLevel }}</span>
```

## Configuration

This rule has no configuration options.

## When To Disable

Almost never. If the type system cannot understand the expression, fix the type definition rather than casting.

## See Also

- [Angular Template Type Checking](https://angular.dev/guide/templates/template-type-checking)
