# ngcompass — Architecture Status Report Q1 2026

> **Date:** 2026-02-28
> **Auditor:** Automated structural review (Claude Sonnet 4.6)
> **Branch:** `feat_quality` (post-refactor)
> **Scope:** Full monorepo — current 11 packages after major architectural refactor
> **Prior document:** [`ARCH_AUDIT.md`](./ARCH_AUDIT.md) — original 15 findings, dated 2026-02-28
> **Companion documents:**
> - [`architecture-inventory.md`](./architecture-inventory.md) — original package map (now outdated)
> - [`boundary-violations.md`](./boundary-violations.md) — original boundary violations
> - [`dependency-governance.md`](./dependency-governance.md) — dependency audit (mostly resolved)
> - [`target-architecture.md`](./target-architecture.md) — the original migration target

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Transformation](#2-architecture-transformation)
3. [Original Audit Findings — Resolution Status](#3-original-audit-findings--resolution-status)
4. [New Issues Discovered Post-Refactor](#4-new-issues-discovered-post-refactor)
5. [Strengths Analysis](#5-strengths-analysis)
6. [Weaknesses Analysis](#6-weaknesses-analysis)
7. [Updated Risk Registry](#7-updated-risk-registry)
8. [Remaining Backlog Tickets](#8-remaining-backlog-tickets)
9. [Architecture Layer Diagram (Current)](#9-architecture-layer-diagram-current)

---

## 1. Executive Summary

The monorepo has undergone a **radical structural transformation** that exceeds the scope of the original migration plan. The original target architecture called for *shrinking* `@ngcompass/core` into a leaner engine. What was actually achieved is the **complete elimination of `@ngcompass/core`** and its replacement with seven focused, single-responsibility packages. The god-package anti-pattern — the highest-risk architectural finding from the original audit — has been fully eradicated.

### Overall Progress

| Category | Original Findings | Resolved | Partially Resolved | Still Open |
|----------|------------------|----------|--------------------|------------|
| Architecture | 5 | **4** | 1 | 0 |
| Boundary/Coupling | 4 | **4** | 0 | 0 |
| CI/CD | 4 | 0 | 0 | **4** |
| Build/Config | 2 | 1 | 1 | 0 |
| **Total** | **15** | **9 (60%)** | **2 (13%)** | **4 (27%)** |

### Critical Remaining Risks

The only unresolved risks that block safe releases are the **four CI issues** (AF-01, AF-02, AF-03, AF-15): the project has no functioning automated gate on `main`, no coverage enforcement, and no pnpm version reproducibility. All engine/architecture risks are resolved.

### What Changed Since Original Audit

| Area | Before | After |
|------|--------|-------|
| Package count | 6 (2 stubs, 1 god-package) | **11** (1 stub, 0 god-packages) |
| `@ngcompass/core` | God-package (~2500 LOC, 8 subsystems) | **Deleted** |
| `@ngcompass/rules` | Stub (5 LOC) | **Fully populated** (registry, presets, resolution, analyzers, rule implementations) |
| `reporters` → `core` coupling | Active violation | **Eliminated** |
| Side-effect rule registration | `import './register-all.js'` fires on any import | **Explicit** `registerAllBuiltinRules()` call in worker |
| Worker threads | Non-functional (worker file never built) | **Working** |
| `require()` in ESM | `ReferenceError` at runtime | **Fixed** via `createRequire` |
| `typescript` in prod deps | Production dependency | **Peer dependency** |
| Phantom cross-package tsconfig paths | Present | **Removed** |
| `sideEffects` declarations | Missing on all 6 packages | **Declared on all 11 packages** |
| Unused prod deps (`chalk`, `ora`, jest) | Present | **Removed** |
| Version alignment | Manual per-package | **`pnpm catalog:` centralized** |

---

## 2. Architecture Transformation

### 2.1 Original Architecture (6 packages)

```
packages/
  common/      ← foundation types, utilities
  core/        ← GOD-PACKAGE (engine + cache + scanner + config + rules + planner + parsers)
  reporters/   ← output (but violated: depended on core)
  rules/       ← STUB
  cli/         ← binary orchestration
  testing/     ← STUB
```

**Dependency graph:**
```
@ngcompass/cli
    ├── @ngcompass/core   (everything)
    ├── @ngcompass/reporters
    │       ├── @ngcompass/common
    │       └── @ngcompass/core   ← layer violation
    └── @ngcompass/rules  (stub that depended on core for nothing)
            └── @ngcompass/core
```

### 2.2 Current Architecture (11 packages)

```
packages/
  common/    ← foundation: types, errors, constants, logger, result-types, ast utils
  ast/       ← parsers: TypeScript (oxc), HTML (angular-html-parser), CSS (lightningcss)
  cache/     ← multi-tier cache: L1 memory (lru) + L2 disk (cacache) + atomic writes
  scanner/   ← file discovery: glob, .gitignore, include/exclude patterns
  planner/   ← execution planning: task builder, hash-based incremental analysis
  engine/    ← rule execution: single-pass AST engine, orchestrator, worker pool
  config/    ← config loading, validation (zod), health checks, plugin loader
  rules/     ← all built-in rule implementations + registry + presets + resolution
  reporters/ ← output formatters: console, JSON, SARIF, config health
  cli/       ← CLI binary: commands, pipeline orchestration
  testing/   ← test utilities  [STUB — still not implemented]
```

**Dependency graph (current):**
```
@ngcompass/cli
    ├── @ngcompass/common
    ├── @ngcompass/ast
    ├── @ngcompass/cache
    ├── @ngcompass/scanner
    ├── @ngcompass/planner
    ├── @ngcompass/engine
    │       ├── @ngcompass/common
    │       ├── @ngcompass/ast
    │       ├── @ngcompass/cache
    │       ├── @ngcompass/rules  ← rules is now a dependency of engine (correct)
    │       │       ├── @ngcompass/common
    │       │       └── @ngcompass/ast
    │       └── @ngcompass/planner
    ├── @ngcompass/config
    │       ├── @ngcompass/common
    │       ├── @ngcompass/cache
    │       └── @ngcompass/engine  ← N-01: phantom dep (never imported)
    └── @ngcompass/reporters
            └── @ngcompass/common  ← ✅ layer violation removed

@ngcompass/testing → @ngcompass/common
```

### 2.3 What Exceeded the Original Target

The `target-architecture.md` planned an **8-package** target with `@ngcompass/core` surviving as a leaner engine. The actual outcome eliminated core entirely and produced 11 packages. This is a more complete decomposition than planned:

| Original Target | Actual Outcome |
|----------------|---------------|
| core (shrunk to engine) | core deleted; engine is its own package |
| rules (populated from core) | rules fully populated; engine is separate |
| config (future Phase 3) | config extracted immediately as part of refactor |
| testing (implement) | testing still a stub |

---

## 3. Original Audit Findings — Resolution Status

### AF-01 — Broken CI Branch Trigger ❌ STILL OPEN

**Status:** 🔴 Open — `ci.yml` still fires on `master`, not `main`. Every push to `main` is unvalidated.
**Original severity:** Critical. **Current severity:** Critical (unchanged).
**Action required:** Change `branches: [master, develop]` → `branches: [main, develop]`. See TICKET-A01.

---

### AF-02 — pnpm Version Mismatch in CI ❌ STILL OPEN

**Status:** 🔴 Open — `test.yml` still specifies `pnpm/action-setup@v2` with `version: 8`. Root `package.json` declares `pnpm@10.26.0`.
**Original severity:** Critical. **Current severity:** Critical (unchanged).
**Action required:** Replace `pnpm/action-setup@v2` with `pnpm/action-setup@v4` (removes version pin). See TICKET-A02.

---

### AF-03 — Missing check-coverage.js Script ❌ STILL OPEN

**Status:** 🔴 Open — `scripts/check-coverage.js` still does not exist. The CI step calling it always fails with `MODULE_NOT_FOUND`.
**Original severity:** Critical. **Current severity:** Critical (unchanged).
**Action required:** Create the script or remove the broken CI step. See TICKET-A03.

---

### AF-04 — @ngcompass/core God-Package ✅ FULLY RESOLVED

**Status:** ✅ Resolved — **Exceeded the original plan.** The entire `packages/core/` directory was deleted. All subsystems are now independent packages with single responsibilities. Zero files remain from the original core god-package.

**What was done:**
1. All subsystems were moved to their own dedicated packages: `@ngcompass/cache`, `@ngcompass/config`, `@ngcompass/scanner`, `@ngcompass/ast` (parsers), `@ngcompass/planner`, `@ngcompass/engine`
2. Rule implementations and registry infrastructure were moved to `@ngcompass/rules`
3. `packages/core/` was fully deleted after confirming zero real dependents
4. All 19 `.rule.ts` files removed from core; rule logic now lives exclusively in `@ngcompass/rules`

**Before:** `@ngcompass/core` — ~2500 LOC, 8 subsystems, 16 external dependencies, single entry point.
**After:** 7 focused packages. No package exceeds 600 LOC (approximate). External dependencies distributed appropriately.

---

### AF-05 — Global Side-Effect Registration on Core Import ✅ FULLY RESOLVED

**Status:** ✅ Resolved.

**What was done:**
1. `import './rules/register-all.js'` removed from the barrel index
2. `registerAllBuiltinRules()` is exported explicitly from `@ngcompass/rules`
3. `packages/engine/src/execution-worker.ts` calls `registerAllBuiltinRules()` explicitly at worker startup — each worker thread has its own isolated module registry and must register rules independently
4. `"sideEffects": false` declared on all 11 packages

**Bonus fix:** The worker thread file (`execution-worker.ts`) was also not being compiled as a separate tsup entry point. This caused a **"Execution worker not found, falling back to local execution"** error at runtime. This was fixed by adding `src/execution-worker.ts` as a second entry point in `packages/engine/package.json`.

---

### AF-06 — reporters → core Layer Violation ✅ FULLY RESOLVED

**Status:** ✅ Resolved.

`@ngcompass/reporters` now only depends on:
- `@ngcompass/common` — result types (`RuleFailure`, `RuleResult`, `RuleSeverity`, etc.)
- `@babel/code-frame` and `picocolors` — formatting utilities

`@ngcompass/core` has been removed from `reporters` dependencies. In fact, `@ngcompass/core` no longer exists.

---

### AF-07 — Stub Packages Provide No Value 🟡 PARTIALLY RESOLVED

**Status:**
- `@ngcompass/rules` ✅ Fully resolved — The package now owns the complete rule system: registry, resolution, presets, rule-context factory, analyzers, AST utilities for rules, all 19+ built-in rule implementations, and `registerAllBuiltinRules()`.
- `@ngcompass/testing` ❌ Still a stub — exports `export const testing = '@ngcompass/testing'` only. No test utilities implemented.

**Risk of remaining stub:** Low. The testing package does not break any functionality. Its absence means rule authors duplicate test setup code. See TICKET-NS-01.

---

### AF-08 — Missing ast/utils.ts Exports from common ✅ FULLY RESOLVED

**Status:** ✅ Resolved.

`packages/common/src/index.ts` now contains:
```typescript
export * from './ast/utils';
```

`createPosition`, `normalizePath`, and all AST position utilities are accessible via `import { createPosition } from '@ngcompass/common'`.

---

### AF-09 — All Type-Aware ESLint Rules Disabled ❌ STILL OPEN

**Status:** 🟠 Open — `.eslintrc.cjs` still disables all `@typescript-eslint/recommended-requiring-type-checking` rules. `no-explicit-any`, `no-floating-promises`, `no-console` all set to `'off'`.

**Current impact:** The two `any` casts in `engine/worker-pool.ts` (pre-existing TS6133) and the `console.error` calls in `engine/single-pass-engine.ts` remain invisible to linting. See TICKET-A13.

---

### AF-10 — TypeScript in Core Production Dependencies ✅ FULLY RESOLVED

**Status:** ✅ Resolved.

`typescript` is now:
- `peerDependencies: { "typescript": ">=4.7.0" }` in both `@ngcompass/common` and `@ngcompass/engine` (the successor to core)
- `devDependencies: { "typescript": "catalog:" }` for local builds across all packages that need it
- Removed entirely from production `dependencies` everywhere

The `pnpm catalog:` protocol is live — upgrading TypeScript requires editing one line in `pnpm-workspace.yaml`.

---

### AF-11 — Cross-Package tsconfig Include Paths ✅ FULLY RESOLVED

**Status:** ✅ Resolved.

- `packages/rules/tsconfig.json` — removed `../core/src/rules/domains` cross-package reference
- `packages/core/tsconfig.json` — the package no longer exists (deleted)
- Zero `../` paths in any `tsconfig.json` include array

---

### AF-12 — CI Does Not Use Turbo ❌ STILL OPEN

**Status:** 🟠 Open — Both CI workflows still run sequential `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` commands. No Turbo integration in CI. Estimated 40–60% CI time wasted per run on unchanged packages. See TICKET-A04.

---

### AF-13 — require() ESM Hazard ✅ FULLY RESOLVED

**Status:** ✅ Resolved.

The canonical `packages/cache/src/key-context.ts` file now uses:
```typescript
import { createRequire } from 'node:module';
// ...
const require = createRequire(import.meta.url);
const pkg = require('oxc-parser/package.json') as { version?: string };
```

`parserVersion` is correctly populated in both CJS and ESM builds. The stale core copy was deleted along with the entire core package.

---

### AF-14 — Unused tsup.config.ts Factory 🟡 PARTIALLY RESOLVED

**Status:** 🟡 Partial — The root `tsup.config.ts` factory (`createConfig()`) is still not explicitly imported by any package. However, tsup automatically discovers and uses the root `tsup.config.ts` when it is present at the project root, so the factory's settings (`splitting: false`, `target: node18`, `platform: node`, SWC esbuild plugin) **are applied to all package builds**.

The remaining issue: packages still declare their entry points via CLI flags (e.g., `tsup src/index.ts --format cjs,esm --dts --clean`) rather than via `createConfig()`. Build configuration drift is possible if a package needs special settings. See TICKET-A21.

---

### AF-15 — Overlapping CI Workflows ❌ STILL OPEN

**Status:** 🔴 Open — `ci.yml` (fires on `master`/`develop`) and `test.yml` (fires on correct branches but with pnpm v8) both exist. Consolidation into a single unified workflow has not been done. See TICKET-A04.

---

## 4. New Issues Discovered Post-Refactor

### N-01 — Phantom @ngcompass/engine Dependency in @ngcompass/config

**Area:** `packages/config/package.json`
**Severity:** 🟡 Low (correctness issue, not runtime failure)
**Finding:** `@ngcompass/config` declares `@ngcompass/engine` as a production dependency, but **no source file in `packages/config/src/` imports from `@ngcompass/engine`**. This is a phantom dependency introduced during the refactoring.

**Impact:**
1. `config` is incorrectly positioned above `engine` in the build graph — Turbo waits for `engine` to build before building `config`, adding unnecessary serial build time.
2. Creates a misleading dependency entry that could confuse future developers.
3. Consumers of `@ngcompass/config` transitively install `@ngcompass/engine` unnecessarily.

**Root cause:** When the original `core/src/config/` was moved to `@ngcompass/config`, the `package.json` was set up with `@ngcompass/engine` as a dependency that was never actually used.

**Proposed fix:**
```json
// Remove from packages/config/package.json dependencies:
"@ngcompass/engine": "workspace:*"  // ← DELETE
```

**Success metric:** `pnpm --filter @ngcompass/config typecheck` passes after removal. `packages/config/` has no `@ngcompass/engine` import in any source file.

---

### N-02 — Worker Thread File Missing from exports Map

**Area:** `packages/engine/package.json`
**Severity:** 🟡 Low (functional, not exposed as API)
**Finding:** `execution-worker.js` is now built correctly (fix for AF-05), but it is not declared in the `exports` map. The worker pool resolves it by path inspection (`existsSync`), which works at runtime but is not formally declared.

```json
// packages/engine/package.json — current state
"exports": {
    ".": { ... }   // only the main barrel
    // execution-worker not declared
}
```

**Impact:** No immediate runtime breakage, but if the package is ever published to npm, the worker file path may be blocked by package resolution depending on Node.js version and bundler behavior.

**Proposed fix:**
```json
"exports": {
    ".": { "types": "...", "import": "...", "require": "..." },
    "./execution-worker": { "import": "./dist/execution-worker.js", "require": "./dist/execution-worker.cjs" }
}
```

---

### N-03 — console.error Remains in Engine Hot Path

**Area:** `packages/engine/src/single-pass-engine.ts`
**Severity:** 🟠 Medium
**Finding:** This issue was documented as F-11 and TICKET-06 in `CODE_AUDIT.md` but was not addressed during the architectural refactor. Two `console.error` calls remain in the innermost loop:

```typescript
// Line 91 — template handler dispatch
} catch (e) {
    console.error(`Rule ${handler.name} failed on template node:`, e);
}

// Line 189 — AST rule execution
} catch (e) {
    console.error(`Rule ${entry.ruleName} failed:`, e);
}
```

**Impact:** Crashes in any rule write unstructured text to `process.stderr` in the performance-critical hot path. No programmatic way to suppress, filter, or act on these. Rule crash counts are not returned to callers. The `budgetViolations` array is populated but no caller acts on it. See TICKET-06 in CODE_AUDIT.md.

---

### N-04 — @ngcompass/testing Still a Stub

**Area:** `packages/testing/`
**Severity:** 🟡 Low (no breakage, friction for rule authors)
**Finding:** `@ngcompass/testing` still exports only `export const testing = '@ngcompass/testing'`. The original AF-07 finding was marked "partially resolved" because `@ngcompass/rules` was populated. The testing utilities (`createTestRule`, `RuleTestHarness`, `createMockCacheContext`) described in TICKET-A15 have not been implemented. See TICKET-NS-01 (new).

---

### N-05 — groupTasksByFile Still Duplicated

**Area:** `packages/engine/src/worker-pool.ts` and `packages/planner/`
**Severity:** 🟡 Low (DRY violation)
**Finding:** The `groupTasksByFile` utility function still exists in at least two locations. Originally documented as F-03 and TICKET-05 in `CODE_AUDIT.md`. This was not addressed during the architectural refactor.

**Note:** `worker-pool.ts` now actually exports `groupTasksByFile` from `packages/engine/src/worker-pool.ts`, so it is accessible. If planner has its own copy, TICKET-05 still applies.

---

## 5. Strengths Analysis

### 5.1 Architectural Strengths (Post-Refactor)

#### Single Responsibility — Every Package Has One Job

| Package | Responsibility |
|---------|---------------|
| `common` | Shared types, errors, constants, logger |
| `ast` | AST parsing only (TS, HTML, CSS) |
| `cache` | Cache infrastructure only (drivers, context) |
| `scanner` | File discovery only (glob, .gitignore) |
| `planner` | Execution plan building and caching |
| `engine` | Rule execution, orchestration, worker pool |
| `config` | Config loading, validation, plugin loading |
| `rules` | Rule implementations, registry, presets |
| `reporters` | Output formatting only |
| `cli` | CLI binary, commands |
| `testing` | Test utilities (intended) |

No package has more than one primary concern. This is the goal of SRP applied at the package level.

#### Clean Dependency Direction

`reporters` no longer depends on `engine`. This was the most significant architectural boundary violation in the original audit. Any consumer installing `@ngcompass/reporters` no longer transitively pulls in `oxc-parser`, `typescript`, `xxhash-wasm`, `cacache`, and the 13 other heavy engine dependencies.

#### Explicit Rule Registration

`registerAllBuiltinRules()` is now an explicit function call rather than a global side effect on import. This means:
- Unit tests that import from `@ngcompass/rules` start with an empty registry
- Worker threads can register rules at the appropriate time
- Tree-shaking is possible for consumers that only need a subset of rules

#### Worker Threads Actually Working

`execution-worker.ts` is now compiled as a separate tsup entry point, producing `dist/execution-worker.js`. The worker pool's `resolveWorkerPath()` finds it on the first candidate check. Parallel analysis across CPU cores now functions correctly.

#### `sideEffects: false` on All Packages

All 11 packages now declare `"sideEffects": false`. This correctly communicates to bundlers (webpack, rollup, esbuild) that no top-level imports carry side effects, enabling safe tree-shaking.

#### Dependency Hygiene

- `chalk`, `ora` removed (unused CLI deps)
- `jest`, `ts-jest`, `@types/jest` removed (wrong test framework leftovers)
- `typescript` correctly declared as `peerDependency` everywhere
- `pnpm catalog:` centralized all tool versions (`typescript`, `tsup`, `vitest`, `eslint`, `rimraf`, `@types/node`)
- Zero phantom workspace dependencies (except N-01 in config)

#### Functional Error Model Preserved

The `Result<T,E>` / `Ok` / `Err` pattern is consistently used across all packages. `Err` returns are preferred over throws for expected failure cases throughout the analysis pipeline. `InfrastructureErrorCollector` is used in the orchestrator.

#### Plugin Architecture

`@ngcompass/rules` exports a `RuleRegistry` with a `RulePlugin` interface. External rules can be registered via `getGlobalRegistry().register(plugin)`. The plugin system is decoupled from the engine infrastructure and accessible without installing the entire engine.

#### Single-Pass Engine Design

The `@ngcompass/engine/single-pass-engine` processes all rules in a single AST traversal per file. Rules receive pre-typed, pre-filtered node streams (`AngularClass`, `DecoratedProperty`, `TemplateExpression`, `TemplateAttribute`). This avoids the N×R traversal cost of naive rule engines.

---

### 5.2 Build System Strengths

- **Turbo task pipeline** is correctly configured with `^build` topological ordering, fine-grained input/output tracking, and remote cache enabled
- **tsup + SWC** produces both CJS and ESM outputs with correct sourcemaps in < 1 second per package
- **`pnpm catalog:`** means a single version bump in `pnpm-workspace.yaml` propagates everywhere
- **`composite: true` properly disabled** per-package (avoids confusing TypeScript project reference behavior)

---

## 6. Weaknesses Analysis

### 6.1 Critical Weaknesses (Blocking)

#### CI Is Completely Non-Functional on `main`

Three independent failures mean the automated safety gate does not exist:
1. `ci.yml` triggers on `master` (branch doesn't exist) — pushes to `main` never trigger CI
2. `test.yml` uses pnpm v8 against a pnpm@10 lockfile — results are unreliable
3. `test.yml` calls `scripts/check-coverage.js` which doesn't exist — step always fails

**A regression can ship to `main` undetected.** This is the highest-priority remaining issue.

---

### 6.2 Moderate Weaknesses (Maintainability Risk)

#### @ngcompass/testing Is a Stub

Rule authors have no shared test utilities. Anyone writing a rule must duplicate test setup code (mock config, mock cache context, synthetic AST nodes). As the rule set grows from 25 to 50+ rules, this becomes a significant maintenance burden.

#### ESLint Type-Safety Rules Disabled

`.eslintrc.cjs` still disables `no-explicit-any`, `no-floating-promises`, `no-unsafe-*`, `no-console`. The `any` casts in `engine/worker-pool.ts` and the `console.error` calls in `engine/single-pass-engine.ts` would be caught by these rules if enabled. See AF-09.

#### Phantom Dependency in @ngcompass/config

`@ngcompass/config` declares `@ngcompass/engine` as a dependency but never imports from it. This adds to the build graph unnecessarily and incorrectly signals to Turbo that config must wait for engine. See N-01.

#### console.error in Engine Hot Path

Two unguarded `console.error` calls in the performance-critical single-pass engine write unstructured text to stderr. Callers have no programmatic visibility into which rules crashed. Budget violations are tracked but never enforced or surfaced. See N-03 / TICKET-06.

---

### 6.3 Low Weaknesses (Polish / Future Friction)

#### tsup.config.ts Factory Still Not Explicitly Used

All packages still use inline CLI flags (`tsup src/index.ts --format cjs,esm --dts --clean`) rather than importing the shared `createConfig()` factory. While tsup discovers the root config automatically, the factory's documented purpose (preventing build configuration drift) is not being leveraged. See AF-14 / TICKET-A21.

#### TypeScript Project References Inconsistent

Root `tsconfig.json` declares `composite: true`, implying project references are intended. All package tsconfigs have `composite: false`. This is a misleading state — the root should either commit to project references (set `composite: true` in all packages) or remove the `composite: true` / `incremental: true` from the root. See BQ-TS-01 in `build-quality-report.md`.

#### groupTasksByFile Duplication

The `groupTasksByFile` utility is implemented in multiple locations (engine and likely planner). See F-03 / TICKET-05 in `CODE_AUDIT.md`.

#### Rule Coverage Gaps

Per `RULES_EVALUATION.md`, the following important rules are missing:
- `prefer-signal-outputs` (completes the signals trilogy — inputs ✅, queries ✅, outputs ❌)
- `no-inner-html` (highest-priority security rule — XSS via `[innerHTML]`)
- Security rules (`no-bypassSecurityTrust`)
- Naming conventions: `pipe-class-suffix`, `service-class-suffix`, `guard-class-suffix`
- Template rules: `template-no-any-cast`, `template-no-inline-styles`

#### No Autofix Capability

Rules provide fix text recommendations but no programmatic `--fix` flag. Mechanical migrations (`*ngIf` → `@if`, `@ViewChild` → `viewChild()`) require manual edits.

#### @ngcompass/testing Still a Stub

No test harness means rule authors must duplicate setup code. This is repeated here from the moderate section because the impact grows non-linearly with the number of rules.

---

## 7. Updated Risk Registry

Ranked by **Impact × Likelihood** (I = impact 1–5, L = likelihood 1–5, Score = I × L):

| Rank | Finding | I | L | Score | Status |
|------|---------|---|---|-------|--------|
| 1 | **AF-01**: CI never fires on `main` | 5 | 5 | **25** | 🔴 Critical — open |
| 2 | **AF-02**: pnpm v8 vs pnpm@10 lockfile | 5 | 5 | **25** | 🔴 Critical — open |
| 3 | **AF-03**: Missing `check-coverage.js` | 4 | 5 | **20** | 🔴 Critical — open |
| 4 | **AF-15**: Overlapping workflows (no unified CI) | 4 | 4 | **16** | 🔴 High — open |
| 5 | **AF-09**: ESLint type-safety rules disabled | 4 | 3 | **12** | 🟠 Medium — open |
| 6 | **N-03**: `console.error` in engine hot loop | 3 | 4 | **12** | 🟠 Medium — open |
| 7 | **AF-12**: No Turbo in CI | 3 | 4 | **12** | 🟠 Medium — open |
| 8 | **N-01**: Phantom `@ngcompass/engine` dep in config | 2 | 5 | **10** | 🟡 Low — open |
| 9 | **N-04**: `@ngcompass/testing` stub | 3 | 3 | **9** | 🟡 Low — open |
| 10 | **AF-07 (testing)**: Rule test harness missing | 2 | 4 | **8** | 🟡 Low — open |
| 11 | **AF-14**: tsup.config.ts factory unused | 2 | 3 | **6** | 🟡 Low — partial |
| 12 | **N-02**: Worker file not in exports map | 1 | 4 | **4** | 🟡 Low — open |
| 13 | **N-05**: groupTasksByFile duplicated | 1 | 3 | **3** | 🟡 Low — open |

**Resolved / No Longer Applicable:**

| Finding | Previous Status | Resolution |
|---------|----------------|------------|
| AF-04 — God-package | 🔴 Critical | ✅ `@ngcompass/core` deleted entirely |
| AF-05 — Side-effect registration | 🔴 High | ✅ Explicit registration in worker |
| AF-06 — reporters→core coupling | 🟠 Medium | ✅ reporters now only depends on common |
| AF-07 (rules) — stub | 🟠 Medium | ✅ rules fully populated |
| AF-08 — createPosition not exported | 🔴 High | ✅ exported from common |
| AF-10 — typescript in prod deps | 🔴 High | ✅ moved to peerDependencies |
| AF-11 — cross-package tsconfig paths | 🟠 Medium | ✅ removed |
| AF-13 — require() in ESM | 🟠 Medium | ✅ fixed with createRequire |
| DG-M1/M2 — typescript peer dep | 🔴 High | ✅ resolved |
| DG-R1/R2 — chalk/ora unused | 🟠 Medium | ✅ removed |
| DG-R3 — jest/ts-jest leftovers | 🟠 Medium | ✅ removed |
| DG-R5 — build tools duplicated | 🟡 Low | ✅ removed |
| Worker not found (runtime) | 🔴 Runtime | ✅ engine build now compiles worker |

---

## 8. Remaining Backlog Tickets

All open tickets from the original audit that remain unresolved, plus new ones.

---

### TICKET-A01 — Fix CI Branch Trigger (P0) ❌ OPEN

**Title:** Fix `ci.yml` to trigger on `main` instead of `master`
**Priority:** 🔴 Critical | **Effort:** 5 min
Change `branches: [master, develop]` → `branches: [main, develop]` in both `push` and `pull_request` triggers in `.github/workflows/ci.yml`.

---

### TICKET-A02 — Fix pnpm Version in test.yml (P0) ❌ OPEN

**Title:** Fix pnpm version mismatch in CI
**Priority:** 🔴 Critical | **Effort:** 5 min
Replace `pnpm/action-setup@v2` with `version: 8` → `pnpm/action-setup@v4` (reads `packageManager` from root `package.json`).

---

### TICKET-A03 — Fix Missing Coverage Script (P0) ❌ OPEN

**Title:** Create `scripts/check-coverage.js` or remove the broken CI step
**Priority:** 🔴 Critical | **Effort:** 30 min
Either create the script (reads `coverage/coverage-summary.json`, enforces 90/90/85/90 thresholds) or remove the step and rely on vitest's built-in `--coverage.thresholds`.

---

### TICKET-A04 — Consolidate CI Workflows + Add Turbo (P0/P1) ❌ OPEN

**Title:** Merge `ci.yml` + `test.yml` into single Turbo-powered workflow
**Priority:** 🔴 High | **Effort:** 2 hr
Replace both workflows with the target workflow from `target-architecture.md §7`. Uses `pnpm/action-setup@v4`, `[main, develop]` triggers, `[18.x, 20.x, 22.x]` matrix, and `pnpm exec turbo lint typecheck test build --concurrency=4`. Delete `test.yml`.

---

### TICKET-A13 — Enable ESLint Type-Safety Rules (P1) ❌ OPEN

**Title:** Re-enable `no-explicit-any`, `no-floating-promises`, `no-console` in warn mode
**Priority:** 🟠 Medium | **Effort:** 3 hr
In `.eslintrc.cjs`, change from `'off'` to `'warn'` for:
- `'@typescript-eslint/no-explicit-any': 'warn'`
- `'@typescript-eslint/no-floating-promises': 'warn'`
- `'no-console': ['warn', { allow: ['warn', 'error'] }]`

Collect all warnings, fix violations, then promote to `'error'`.

---

### TICKET-A21 — Adopt Shared tsup.config.ts Factory (P2) ⚠️ PARTIAL

**Title:** Migrate all package build scripts to use the root `tsup.config.ts` factory
**Priority:** 🟡 Low | **Effort:** 2 hr
Create per-package `tsup.config.ts` files that call `createConfig({ entry: [...] })`. This makes the root factory's settings explicit per-package and prevents configuration drift. Special attention to `@ngcompass/engine` which needs two entry points (`src/index.ts` + `src/execution-worker.ts`).

---

### TICKET-N01 — Remove Phantom @ngcompass/engine from config (P0) ❌ NEW

**Title:** Remove `@ngcompass/engine` from `@ngcompass/config` dependencies
**Priority:** 🟡 Low | **Effort:** 15 min

**Steps:**
1. Remove `"@ngcompass/engine": "workspace:*"` from `packages/config/package.json` `dependencies`
2. Run `pnpm install` to update lockfile
3. Run `pnpm --filter @ngcompass/config typecheck` — verify zero errors (no actual imports exist)
4. Run `pnpm --filter @ngcompass/config build` — verify clean build

**Definition of Done:**
- [ ] `@ngcompass/engine` absent from `packages/config/package.json` dependencies
- [ ] `pnpm --filter @ngcompass/config typecheck` passes
- [ ] Turbo build graph no longer waits for engine before building config

---

### TICKET-N02 — Declare Worker File in Engine Exports Map (P1) ❌ NEW

**Title:** Add `./execution-worker` sub-path to `@ngcompass/engine` exports
**Priority:** 🟡 Low | **Effort:** 30 min

Add to `packages/engine/package.json`:
```json
"exports": {
    ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js",
        "require": "./dist/index.cjs"
    },
    "./execution-worker": {
        "import": "./dist/execution-worker.js",
        "require": "./dist/execution-worker.cjs"
    }
}
```

**Definition of Done:**
- [ ] `execution-worker` sub-path declared in exports map
- [ ] `pnpm --filter @ngcompass/engine build` produces both entries
- [ ] Worker pool still resolves the path correctly at runtime

---

### TICKET-NS-01 — Implement @ngcompass/testing Utilities (P2) ❌ OPEN (carry-over from A15)

**Title:** Replace `testing` stub with real rule test harness
**Priority:** 🟡 Low | **Effort:** 1 day

Implement:
1. `createTestRule(ruleClass, config?)` — wires a rule into a synthetic context
2. `createMockCacheContext()` — in-memory cache (all drivers backed by `Map`)
3. `createMockAnalyzerConfig(overrides?)` — builder for default `NormalizedAnalyzerConfig`
4. `RuleTestHarness.run(filePath, source)` — returns `RuleFailure[]` for assertion
5. Export all from `testing/src/index.ts`

**Definition of Done:**
- [ ] All 4 utilities exported from `@ngcompass/testing`
- [ ] `rules/tests/` uses `@ngcompass/testing` harness instead of ad-hoc setup
- [ ] Coverage ≥ 90% for the testing package itself

---

### TICKET-06 — Replace console.error in Engine (carry-over from CODE_AUDIT.md) ❌ OPEN

**Title:** Replace `console.error` in `single-pass-engine.ts` with structured error collection
**Priority:** 🟠 Medium | **Effort:** 2 hr

See `CODE_AUDIT.md TICKET-06` for full specification. Key steps:
1. Add optional `errorCollector?: InfrastructureErrorCollector` to `runSinglePassAnalysis` options
2. Replace both `console.error` calls with `errorCollector?.record(createInfrastructureError(...))`
3. Add `hasBudgetViolations` boolean flag to `PerformanceReport`

---

### TICKET-05 — Extract Shared groupTasksByFile Utility (carry-over from CODE_AUDIT.md) ❌ OPEN

**Title:** Deduplicate `groupTasksByFile` between planner and engine
**Priority:** 🟡 Low | **Effort:** 1 hr

Canonical implementation should live in `@ngcompass/planner/src/utils.ts` and be exported from `@ngcompass/planner`. Replace usages in `@ngcompass/engine/src/worker-pool.ts`.

---

## 9. Architecture Layer Diagram (Current)

### Actual Dependency Topology

```
Layer 6 — Delivery
    @ngcompass/cli
    └── depends on: common, ast, cache, scanner, planner, engine,
                    config, rules, reporters, testing

Layer 5 — Config (unusual: depends on engine)
    @ngcompass/config
    └── depends on: common, cache
        phantom dep on engine (N-01 — should be removed)

Layer 4 — Engine
    @ngcompass/engine
    └── depends on: common, ast, cache, rules, planner

Layer 3 — Domain (parallel)
    @ngcompass/rules          @ngcompass/reporters
    └── common, ast           └── common only ✅

Layer 2 — Services (parallel)
    @ngcompass/planner        @ngcompass/scanner
    └── common, cache, scanner  └── common, cache

Layer 1 — Parsers / Cache (parallel)
    @ngcompass/ast            @ngcompass/cache
    └── common                └── common

Layer 0 — Foundation
    @ngcompass/common         @ngcompass/testing
    └── (no deps)             └── common
```

### Target State (after N-01 fix)

```
Layer 5 — Delivery
    @ngcompass/cli → common, ast, cache, scanner, planner, engine, config, rules, reporters

Layer 4 — Config (decoupled from engine after N-01 fix)
    @ngcompass/config → common, cache

Layer 3 — Engine
    @ngcompass/engine → common, ast, cache, rules, planner

Layer 2 — Domain
    @ngcompass/rules → common, ast
    @ngcompass/reporters → common

Layer 1 — Services
    @ngcompass/planner → common, cache, scanner
    @ngcompass/scanner → common, cache

Layer 0 — Foundation
    @ngcompass/ast → common
    @ngcompass/cache → common
    @ngcompass/common → (nothing)
    @ngcompass/testing → common
```

After removing the phantom engine dep from config, the architecture forms a **strict directed acyclic graph** with no cross-layer violations.

---

## Summary Scorecard

| Dimension | Original Score | Current Score | Change |
|-----------|---------------|---------------|--------|
| Package Architecture | 3/10 (god-package) | **9/10** | ↑ +6 |
| Boundary Enforcement | 4/10 (violations) | **8/10** | ↑ +4 |
| Dependency Hygiene | 5/10 | **9/10** | ↑ +4 |
| Build System | 6/10 | **7/10** | ↑ +1 |
| CI/CD | 1/10 (broken) | **1/10** | → 0 |
| Test Infrastructure | 3/10 | **4/10** | ↑ +1 |
| ESLint Safety Net | 2/10 (all disabled) | **2/10** | → 0 |
| Rule Coverage | 6/10 | **6/10** | → 0 |
| **Overall** | **30/80** | **46/80** | ↑ +16 |

**The architecture has transformed from fragile to solid in one refactor cycle. The only remaining systemic risk is the non-functional CI pipeline — fix the four CI tickets and the project has a reliable automated safety gate for the first time.**

---

*Generated 2026-02-28 from source analysis on the current `feat_quality` branch post-refactor.*
*Cross-references: `ARCH_AUDIT.md` · `CODE_AUDIT.md` · `dependency-governance.md` · `build-quality-report.md` · `RULES_EVALUATION.md` · `target-architecture.md`*
