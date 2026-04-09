# spec-no-focused-test

| Property | Value |
|---|---|
| **Severity** | `error` |
| **Category** | Testing |
| **Applies to** | `.spec.ts`, `.test.ts` files |
| **Stream** | `CallExpression` |

---

## Why This Rule Exists

Three classes of test modifier accidentally prevent parts of your test suite from running:

### 1. Focused tests (`fdescribe`, `fit`, `describe.only`, `it.only`, …)

When a focused test exists, **only focused tests run** — all other tests are silently skipped. This is useful during local development but catastrophic in CI: the pipeline stays green while the rest of the suite never executes.

### 2. Skipped / disabled tests (`xdescribe`, `xit`, `xtest`, `xcontext`)

The `x`-prefix disables a test permanently. These are easy to forget: the test disappears from the output, coverage drops silently, and regressions go undetected.

### 3. Pending tests (`pending()`)

Calling `pending()` inside a Jasmine test body marks the spec as pending and stops execution at that point. Like disabled tests, pending specs accumulate over time and erode confidence in the suite.

```
Test runner lifecycle (focused example):
────────────────────────────────────────
  Normal run:   describe A → it 1 ✓  it 2 ✓  it 3 ✓
  Focused run:  describe A → it 1 ✗ (skipped)
                             fit 2 ✓ (only this runs!)
                             it 3 ✗ (skipped)
                             ↑
                             CI is GREEN, but it 1 and it 3 were never tested
```

---

## Patterns Detected

| Call | Category | Message |
|---|---|---|
| `fdescribe(...)` | Focused | "uses a focused test suite — remove `f` prefix before committing" |
| `fit(...)` | Focused | "uses a focused test — remove `f` prefix before committing" |
| `describe.only(...)` | Focused | "uses a focused test suite — remove `.only` before committing" |
| `it.only(...)` | Focused | "uses a focused test — remove `.only` before committing" |
| `test.only(...)` | Focused | "uses a focused test — remove `.only` before committing" |
| `context.only(...)` | Focused | "uses a focused test suite — remove `.only` before committing" |
| `xdescribe(...)` | Skipped | "disables a test suite — remove `x` prefix or delete the suite" |
| `xit(...)` | Skipped | "disables a test — remove `x` prefix or delete the test" |
| `xtest(...)` | Skipped | "disables a test — remove `x` prefix or delete the test" |
| `xcontext(...)` | Skipped | "disables a test suite — remove `x` prefix or delete the suite" |
| `pending()` | Pending | "marks a test as pending — implement the test or remove the call" |

---

## Invalid Examples

### Focused suites and tests

```typescript
// ❌ Focused suite — all other describes are silently skipped
fdescribe('UserService', () => {
  it('should create', () => { ... });
});

// ❌ Focused single test — all sibling its are skipped
describe('AuthGuard', () => {
  fit('should redirect unauthenticated user', () => { ... });
  it('should allow authenticated user', () => { ... }); // never runs!
});

// ❌ .only variants (Jest / Karma)
describe.only('CartService', () => {
  it.only('should calculate total', () => { ... });
});
```

### Skipped / disabled tests

```typescript
// ❌ Disabled suite — entire block is ignored
xdescribe('CheckoutComponent', () => {
  it('should display order summary', () => { ... });
  it('should apply discount code', () => { ... });
});

// ❌ Disabled single test — easy to forget
describe('PaymentService', () => {
  it('should charge card', () => { ... });
  xit('should handle declined card', () => { ... }); // silently ignored
});

// ❌ xtest (Jest alias)
xtest('should validate email format', () => { ... });
```

### Pending tests

```typescript
// ❌ pending() stops the test and marks it pending indefinitely
describe('ReportComponent', () => {
  it('should export as PDF', () => {
    pending(); // ❌ test never actually runs assertions
    expect(component.exportPdf()).toBeTruthy();
  });
});
```

---

## Valid Examples

```typescript
// ✅ Normal test suite — all tests run
describe('UserService', () => {
  it('should create the service', () => {
    expect(service).toBeTruthy();
  });

  it('should return user by id', () => {
    expect(service.getUser(1)).toEqual(mockUser);
  });
});

// ✅ All tests active — nothing skipped
describe('AuthGuard', () => {
  it('should redirect unauthenticated user', () => {
    expect(guard.canActivate(mockRoute, mockState)).toBeFalse();
  });

  it('should allow authenticated user', () => {
    authService.isLoggedIn.set(true);
    expect(guard.canActivate(mockRoute, mockState)).toBeTrue();
  });
});

// ✅ Properly remove or implement pending tests
describe('ReportComponent', () => {
  it('should export as PDF', () => {
    const blob = component.exportPdf();
    expect(blob.type).toBe('application/pdf');
  });
});
```

---

## Focused vs Skipped: Key Difference

```
Focused (fdescribe / fit / *.only)
  ┌─────────────────────────────────────┐
  │ Effect:  ALL other tests are skipped│
  │ CI:      Stays green (false safety) │
  │ Intent:  "Run only this during dev" │
  │ Risk:    ★★★★★ Critical             │
  └─────────────────────────────────────┘

Skipped (xdescribe / xit / xtest)
  ┌─────────────────────────────────────┐
  │ Effect:  That test is silently gone │
  │ CI:      Stays green (test missing) │
  │ Intent:  "Disable temporarily"      │
  │ Risk:    ★★★★☆ High                 │
  └─────────────────────────────────────┘

Pending (pending())
  ┌─────────────────────────────────────┐
  │ Effect:  Test stops, no assertions  │
  │ CI:      Reported as pending        │
  │ Intent:  "Placeholder / stub"       │
  │ Risk:    ★★★☆☆ Medium               │
  └─────────────────────────────────────┘
```

---

## Why This Matters in CI

```
Local dev workflow (✅ temporary use acceptable):

  Developer: fit('only debug this one test')
  → Quick feedback loop during development

  Before commit:
  → Remove fit / fdescribe / xit / pending()
  → Run full suite to confirm everything passes


CI pipeline (❌ should never reach this state):

  PR pipeline runs:
    fdescribe('MyComponent', ...) found
    → Only MyComponent tests run
    → 85 other test files skipped silently
    → Pipeline: ✅ PASS  ← FALSE POSITIVE
    → Regression in unrelated module goes undetected
```

---

## Exemptions

There are **no exemptions**. This rule applies to all `.spec.ts` and `.test.ts` files without exception. The rule does **not** apply to non-test files (`.ts`, `.component.ts`, `.service.ts`, etc.).

---

## Migration Guide

### Removing focused tests

```typescript
// Before
fdescribe('MyComponent', () => { ... });
fit('should do something', () => { ... });
it.only('should do something', () => { ... });
describe.only('MyComponent', () => { ... });

// After — remove the f-prefix or .only
describe('MyComponent', () => { ... });
it('should do something', () => { ... });
it('should do something', () => { ... });
describe('MyComponent', () => { ... });
```

### Removing disabled tests

```typescript
// Before
xdescribe('FeatureX', () => { ... });
xit('should handle edge case', () => { ... });

// After — either implement and re-enable, or delete
describe('FeatureX', () => { ... });  // re-enable
it('should handle edge case', () => { ... });

// OR — delete it entirely if the test is no longer relevant
```

### Resolving pending tests

```typescript
// Before
it('should validate email', () => {
  pending();
});

// After — implement the test
it('should validate email', () => {
  const result = validator.validate('test@example.com');
  expect(result.valid).toBeTrue();
});
```

---

## Pre-commit Hook Integration

Pair this rule with a pre-commit hook to block focused tests before they reach CI:

```json
// package.json scripts
{
  "scripts": {
    "lint:tests": "ngcompass lint --rule spec-no-focused-test"
  }
}
```

```bash
# .husky/pre-commit
#!/bin/sh
pnpm lint:tests || exit 1
```

---

## Related Rules

- [`rxjs-require-take-until-destroyed`](../reactivity/rxjs-require-take-until-destroyed.md) — ensure subscriptions are cleaned up in tests
