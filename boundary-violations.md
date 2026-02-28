# ngcompass — Boundary & Coupling Violations

> **Date:** 2026-02-28
> **Scope:** All 6 packages in `packages/*`
> **Methodology:** tsconfig cross-reference analysis, import graph tracing, package.json dependency review, source-code structural analysis

---

## Table of Contents

1. [Violation Registry](#1-violation-registry)
2. [BV-01 — Cross-Package Source Reference in tsconfig](#bv-01)
3. [BV-02 — reporters Depends on core for Domain Types](#bv-02)
4. [BV-03 — Global Side-Effect on Any Core Import](#bv-03)
5. [BV-04 — rules Package is an Architecture Facade with Nothing Behind It](#bv-04)
6. [BV-05 — Missing Public API: ast/utils.ts Not Exported](#bv-05)
7. [BV-06 — require() in ESM Barrel (CJS/ESM Split Hazard)](#bv-06)
8. [BV-07 — ESLint Safety Net Disabled](#bv-07)
9. [BV-08 — TypeScript in Core Production Dependencies](#bv-08)
10. [Boundary Rules (Target State)](#10-boundary-rules-target-state)

---

## 1. Violation Registry

| ID | Area | Severity | Type | Status |
|----|------|----------|------|--------|
| BV-01 | `rules/tsconfig.json` → `core/src` | 🔴 High | Build boundary | Open |
| BV-02 | `reporters` → `core` (domain types) | 🟠 Medium | Layer violation | Open |
| BV-03 | `core/index.ts` global side-effect | 🔴 High | Runtime coupling | Open |
| BV-04 | `rules` pkg is a stub with dangling tsconfig path | 🟠 Medium | Architecture gap | Open |
| BV-05 | `ast/utils.ts` not exported from `common` | 🟠 Medium | API surface gap | Open |
| BV-06 | `require()` in ESM source (`core`) | 🟠 Medium | Module system | Open |
| BV-07 | All type-aware ESLint rules disabled | 🟠 Medium | Quality gate | Open |
| BV-08 | `typescript` in core production dependencies | 🟠 Medium | Dependency model | Open |

---

## BV-01 — Cross-Package Source Reference in tsconfig {#bv-01}

**Area / Package:** `packages/rules/tsconfig.json`, `packages/core/tsconfig.json`
**Rule Violated:** Package Boundary — no package may reference another package's `src/` directory in its compilation config

### The Violation

`packages/rules/tsconfig.json`:
```json
{
  "compilerOptions": { ... },
  "include": [
    "src/**/*",
    "../core/src/rules/domains"   ← ⚠️ CROSS-PACKAGE SRC REFERENCE
  ]
}
```

`packages/core/tsconfig.json`:
```json
{
  "include": [
    "src/**/*",
    "src/rules/domains/prefer-on-push.ts",           ← stale explicit path
    "src/rules/domains/template-no-call-expression.ts" ← stale explicit path
  ]
}
```

### Impact

1. **Build-time break risk:** `rules/tsconfig.json` references `../core/src/rules/domains` which is a **non-existent directory** in the current file tree (rules live under `core/src/rules/migration/`). This path is silently skipped today because it doesn't match any files, but it will cause a hard TS2307 error if the directory is ever created with mismatched files.
2. **Stale explicit file paths** in `core/tsconfig.json` reference two `.ts` files that don't exist (`src/rules/domains/prefer-on-push.ts`, `src/rules/domains/template-no-call-expression.ts`). These are never compiled but litter the config with incorrect paths.
3. **Architecture violation:** A compiled package must never reach into another package's `src/` directly. Consumers must go through the published interface (`dist/` via exports map).
4. If TypeScript project references (`composite: true`) are ever enabled, these cross-src references would cause a hard compile error.

### Root Cause

A refactor moved rule implementations from a planned `src/rules/domains/` hierarchy into `src/rules/migration/`. The tsconfig references were not cleaned up.

### Proposed Fix

1. Remove `"../core/src/rules/domains"` from `packages/rules/tsconfig.json` include array.
2. Remove the two stale explicit paths from `packages/core/tsconfig.json` include array.
3. Add a CI gate: `grep -r '"../` packages/*/tsconfig.json` → fail on any cross-package `../` in include paths.

### Success Metric
Zero cross-package `../` entries in any `tsconfig.json` include array. Verified by lint rule.

---

## BV-02 — reporters Depends on core for Domain Types {#bv-02}

**Area / Package:** `packages/reporters/src/types.ts`
**Rule Violated:** Layer Rule — a presentation/output package should not depend on the engine package for its type definitions

### The Violation

```typescript
// packages/reporters/src/types.ts
import { ConfigReport, HealthReport, InitResult } from '@ngcompass/common';
import { RuleFailure, RuleResult, RuleSeverity } from '@ngcompass/core'; // ← violation
```

`RuleFailure`, `RuleResult`, and `RuleSeverity` are output-domain types — they describe the shape of analysis results and severity levels. They should live in `@ngcompass/common` (the foundation layer) so that `reporters` can consume them without taking a dependency on the entire engine.

### Impact

1. **Coupling:** Every consumer of `@ngcompass/reporters` transitively imports `@ngcompass/core` with its 16 production dependencies (including the heavy `oxc-parser`, `typescript`, `xxhash-wasm`, WASM binary, etc.).
2. **Build order rigidity:** `reporters` must now wait for `core` to build before it can typecheck.
3. **Plugin authors** who want to write a custom reporter must install the full engine just to get the `RuleResult` type.
4. **Bloated bundles:** Any future browser/edge deployment of reporters carries the engine's server-only dependencies.

### Root Cause

These types were defined inside `core` where the rule engine first produced them, and reporters imported from there for convenience rather than re-homing the types to `common`.

### Proposed Fix

1. Move `RuleFailure`, `RuleResult`, `RuleSeverity`, and related result-shape types from `@ngcompass/core/src/rules/types.ts` to `@ngcompass/common/src/result-types.ts`.
2. Re-export from `@ngcompass/core/src/rules/types.ts` for backward compatibility: `export type { RuleFailure, RuleResult, RuleSeverity } from '@ngcompass/common/result-types.js'`.
3. Remove `@ngcompass/core` from `@ngcompass/reporters` production dependencies once no other types are imported from it.

### Success Metric

`@ngcompass/reporters/package.json` lists zero `@ngcompass/core` dependency. `pnpm --filter @ngcompass/reporters typecheck` passes.

---

## BV-03 — Global Side-Effect on Any Core Import {#bv-03}

**Area / Package:** `packages/core/src/index.ts`
**Rule Violated:** No Side Effects — importing a module must not mutate shared global state as a side effect of the import itself

### The Violation

```typescript
// packages/core/src/index.ts (line ~7)
import './rules/register-all.js';  // ← global side effect
```

`register-all.js` calls `getGlobalRegistry().registerMany([...19 rules])` at module load time. Any code that imports **anything** from `@ngcompass/core` — even just a type like `CacheContext` — triggers registration of all 19 built-in rules into the process-global rule registry singleton.

### Impact

1. **Test isolation:** Unit tests that import from `@ngcompass/core` start with 19 rules pre-registered, even if they only need the cache or config system. This makes unit tests implicitly stateful — test A may pass because it relies on rules registered by test B's import.
2. **Plugin tests:** A custom plugin test that imports `core` to check registry behavior will see the built-in rules mixed with its own — impossible to isolate.
3. **Tree-shaking blocked:** Bundlers that process ESM cannot tree-shake `@ngcompass/core` while it carries a side-effectful barrel. The missing `sideEffects` field in `package.json` makes this worse — bundlers may either keep or drop the import non-deterministically.
4. **Future extensibility:** When the plugin system is used in production, there is no clean way to start with an empty registry.

### Root Cause

The registration was added as a convenience "auto-register on first import" pattern to simplify CLI setup. The design did not account for test isolation or tree-shakability.

### Proposed Fix

1. Remove `import './rules/register-all.js'` from `core/src/index.ts`.
2. Export `registerAllBuiltinRules()` as an explicit function from `core/src/index.ts`.
3. In `cli/src/bin/ngcompass.ts`, call `registerAllBuiltinRules()` explicitly before running any analysis.
4. Update test setup files that rely on the implicit registration.
5. Add `"sideEffects": false` to `core/package.json` once the implicit import is removed.

### Success Metric

`core/src/index.ts` contains zero top-level `import '...'` statements with side effects. Tests confirm an empty registry after a fresh `createCacheContext()` call.

---

## BV-04 — rules Package is an Architecture Facade with Nothing Behind It {#bv-04}

**Area / Package:** `packages/rules/`
**Rule Violated:** SRP / Ownership — a declared package must own its stated responsibility

### The Violation

```typescript
// packages/rules/src/index.ts
export const rules = '@ngcompass/rules';  // entire public API
```

`@ngcompass/rules` declares `@ngcompass/core` as a production dependency — suggesting it wraps or extends core rule functionality. In reality, it is an empty shell. All 19 rule implementations live inside `@ngcompass/core/src/rules/migration/`.

Additionally, `rules/tsconfig.json` includes a cross-package path that references a non-existent directory (see BV-01).

### Impact

1. **Misleading architecture:** Developers expect rule implementations to live in `@ngcompass/rules`. They don't. Any new rule developer will be confused about where to put their work.
2. **Phantom dependency:** `cli` depends on `@ngcompass/rules` (`workspace:*`) for no functional reason. Importing `@ngcompass/rules` transitively imports `@ngcompass/core` (rules' dep), which is already directly imported by cli — so it's a redundant transitive load with zero benefit.
3. **Build waste:** Turbo builds `rules` even though its output is a single constant. It adds to build time for no value.

### Root Cause

The package was created as a placeholder for a planned separation of built-in rules from the engine. The separation was never completed.

### Proposed Fix (short-term)

1. Add at minimum a stub public API that makes the package useful: e.g., re-export rule registration helpers from `@ngcompass/core`.
2. Remove `@ngcompass/rules` from `cli` dependencies until it provides real value.
3. Fix `rules/tsconfig.json` (see BV-01).

### Proposed Fix (long-term)

Migrate built-in rule implementations from `core/src/rules/migration/` to `rules/src/rules/` as part of the god-package split (see `target-architecture.md`).

---

## BV-05 — Missing Public API: ast/utils.ts Not Exported {#bv-05}

**Area / Package:** `packages/common/src/index.ts` vs `packages/common/src/ast/utils.ts`
**Rule Violated:** Public API Contract — what consumers need must be in the declared public interface

### The Violation

`packages/common/src/ast/utils.ts` exports `createPosition`, `normalizePath`, and related helpers. **None of these are re-exported from `src/index.ts`.**

However, `packages/core/tests/setup.test.ts` contains:
```typescript
import { createPosition } from '@ngcompass/common';  // ← will fail at runtime
```

This import will succeed only if TypeScript's module resolution happens to resolve `createPosition` through some indirect path. In the published package (where only `dist/index.js` is available), this import will throw `SyntaxError: The requested module does not provide an export named 'createPosition'`.

### Impact

1. **Latent runtime failure:** Any test that imports `createPosition` from `@ngcompass/common` will fail when run against the published build (not just the source tree).
2. **Undocumented dependency:** Internal consumers (tests) rely on a "shadow export" that isn't part of the official API.
3. **Discoverability:** External plugin authors who need `createPosition` cannot find it via the package's published API.

### Proposed Fix

1. Add `export * from './ast/utils.js'` to `packages/common/src/index.ts`.
2. Alternatively, selectively export: `export { createPosition, normalizePath } from './ast/utils.js'`.
3. Add a test: verify that `import { createPosition } from '@ngcompass/common'` resolves successfully in both CJS and ESM builds.

---

## BV-06 — require() in ESM Source (CJS/ESM Split Hazard) {#bv-06}

**Area / Package:** `packages/core/src/cache/key-context.ts`
**Rule Violated:** Module System Consistency — CJS patterns must not appear in ESM-first source

### The Violation

```typescript
// packages/core/src/cache/key-context.ts
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('oxc-parser/package.json');  // ← CJS require in ESM
    parserVersion = pkg.version as string;
} catch {
    parserVersion = 'unknown';
}
```

This pattern is intentionally suppressed with an ESLint disable comment. While tsup bundles this into a working CJS output, the ESM output (`dist/index.js`) will fail when loaded by Node's native ESM loader because `require` is not defined in ESM scope.

A similar pattern exists in `core/src/rules/rule-utils.ts` (`require('typescript')` inside a lazy initializer).

### Impact

1. **Runtime failure in native ESM:** Users who load `dist/index.js` directly (e.g., `node --experimental-vm-modules`) will get `ReferenceError: require is not defined` in the catch block, silently falling back to `parserVersion = 'unknown'`.
2. **Cache key integrity:** `parserVersion` is used as part of the cache invalidation key. If it is always `'unknown'` in ESM builds, cache keys will be wrong across parser upgrades.
3. **Suppressed lint warnings** make this invisible in code review.

### Root Cause

`package.json` of `oxc-parser` may not expose a sub-path export for `package.json`. The author chose a `require()` try/catch as a fallback rather than a dynamic `import()`.

### Proposed Fix

```typescript
// Replace require() with dynamic import:
let parserVersion = 'unknown';
try {
    const { default: pkg } = await import('oxc-parser/package.json', {
        assert: { type: 'json' }
    });
    parserVersion = (pkg as { version: string }).version;
} catch {
    parserVersion = 'unknown';
}
```

Or read the version at build time via tsup's `define` option to inject it as a compile-time constant.

---

## BV-07 — ESLint Safety Net Disabled {#bv-07}

**Area / Package:** `.eslintrc.cjs` (root)
**Rule Violated:** Quality Gate — static analysis rules must enforce the contracts they declare

### The Violation

The root ESLint config extends `plugin:@typescript-eslint/recommended-requiring-type-checking` (the most powerful type-aware rule set) and then immediately disables all of its highest-value rules:

```javascript
rules: {
    '@typescript-eslint/no-explicit-any': 'off',          // allows any
    '@typescript-eslint/no-unsafe-assignment': 'off',     // allows any assignment
    '@typescript-eslint/no-unsafe-member-access': 'off',  // allows any property access
    '@typescript-eslint/no-unsafe-call': 'off',           // allows calling any
    '@typescript-eslint/no-unsafe-return': 'off',         // allows returning any
    '@typescript-eslint/no-unsafe-argument': 'off',       // allows passing any
    '@typescript-eslint/no-floating-promises': 'off',     // allows unhandled promises
    '@typescript-eslint/await-thenable': 'off',           // allows awaiting non-thenables
    '@typescript-eslint/require-await': 'off',            // allows async without await
    '@typescript-eslint/unbound-method': 'off',           // allows unbound method refs
    'no-console': 'off',                                  // allows console.* everywhere
}
```

The result: ESLint provides zero value beyond basic syntax checks. The `any` proliferation and `console.error` issues found in the code audit exist precisely because these rules are disabled.

### Impact

1. **False confidence:** The presence of `@typescript-eslint/recommended-requiring-type-checking` in the extends array gives the appearance of rigorous checking without enforcing it.
2. **Type safety erosion:** Without `no-explicit-any`, `no-unsafe-*`, new `any` escapes will continue to accumulate.
3. **console.* abuse:** Without `no-console`, `console.error` in the hot engine path (BV-03's related issue) will never be caught by linting.
4. **Promise safety:** Without `no-floating-promises`, unhandled async operations will go undetected.

### Proposed Fix (incremental — warn first, then error)

Phase 1 (warn mode):
```javascript
'@typescript-eslint/no-explicit-any': 'warn',
'@typescript-eslint/no-floating-promises': 'warn',
'no-console': ['warn', { allow: ['warn', 'error'] }],
```

Phase 2 (after existing violations are fixed):
```javascript
'@typescript-eslint/no-explicit-any': 'error',
'@typescript-eslint/no-unsafe-assignment': 'error',
'no-console': ['error', { allow: ['warn', 'error'] }],
```

---

## BV-08 — TypeScript in Core Production Dependencies {#bv-08}

**Area / Package:** `packages/core/package.json`
**Rule Violated:** Dependency model — compiler tooling should not be a runtime production dependency of a library

### The Violation

```json
// packages/core/package.json
"dependencies": {
    "typescript": "^5.9.3"  ← ⚠️ in production deps, not peerDependencies
}
```

`typescript` is used in `core/src/rules/rule-utils.ts` (optional type-checker integration) and in `common/src/ast/utils.ts` (TypeScript AST utilities). For a static analysis tool, this is conceptually unavoidable — but it should be declared as a `peerDependency` that the consuming project already has installed, not as a production dep that ngcompass always installs.

Additionally, `typescript` is imported in `@ngcompass/common/src/ast/utils.ts` (`import ts from 'typescript'`) but TypeScript is **not listed in `@ngcompass/common`'s production `dependencies`** — it is only in devDependencies. This means the published `@ngcompass/common` package has an undeclared peer dependency on `typescript`.

### Impact

1. **Double installation risk:** Projects that use ngcompass already have TypeScript installed. With `typescript` as a regular production dep of `@ngcompass/core`, they may get two TypeScript instances (pnpm deduplication usually prevents this, but not always across major version ranges).
2. **`common` runtime breakage:** `@ngcompass/common` imports `typescript` at module load time but doesn't declare it as a dependency. Any consumer that installs `@ngcompass/common` alone (e.g., a plugin author) will get a runtime `MODULE_NOT_FOUND` error.
3. **Version pin inflexibility:** Declaring `^5.9.3` as a production dep means ngcompass controls which TypeScript version users get, potentially conflicting with their project's version.

### Proposed Fix

1. Add `typescript` to `@ngcompass/common` `peerDependencies` (and devDependencies for local testing).
2. Move `typescript` from `@ngcompass/core` `dependencies` to `peerDependencies`.
3. Add a peer dependency validation check (e.g., `check-peer-dependencies` in CI).

---

## 10. Boundary Rules (Target State)

The following rules must be enforced by tooling (see `target-architecture.md` for the enforcement strategy):

### Allowed Dependency Directions

```
cli           → common, core, reporters, rules
reporters     → common              (NOT core)
rules         → common, core
core          → common              (NOT cli, reporters, rules)
common        → (nothing internal)
testing       → common              (NOT core, cli, reporters, rules)
```

### Forbidden Patterns

| Pattern | Enforcement |
|---------|------------|
| Any `tsconfig.json` includes a path outside its own `src/` | `grep` CI gate |
| Any `from '@ngcompass/X/src/'` deep import | ESLint `no-restricted-imports` |
| `reporters` imports from `@ngcompass/core` | `eslint-plugin-boundaries` |
| Top-level side-effect imports in barrel files | `import/no-commonjs` + manual review |
| `require()` in `.ts` source files | `@typescript-eslint/no-require-imports: error` |
| `console.*` in `src/` (non-CLI packages) | `no-console: error` |

### Package Public API Rules

1. Every package must have an `exports` map with a `.` entry pointing to `dist/`.
2. No package may export `src/` paths directly.
3. All types needed by downstream packages must be in `@ngcompass/common` or the owning package's `dist/`.
4. Internal utilities (used only within a package) must not appear in `src/index.ts`.

---

*See `target-architecture.md` for the complete enforcement tooling plan and phased migration.*
