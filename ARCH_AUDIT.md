# ngcompass — Architecture Quality Audit

> **Date:** 2026-02-28
> **Auditor:** Automated structural + dependency review (Claude Sonnet 4.6)
> **Branch:** `feat_quality` (head: `2d1fcab`)
> **Scope:** Monorepo architecture, package boundaries, dependency governance, build/CI quality
> **Companion documents:**
> - [`architecture-inventory.md`](./architecture-inventory.md) — Package map, dependency graph, layer diagram
> - [`boundary-violations.md`](./boundary-violations.md) — BV-01 through BV-08 with fix directions
> - [`dependency-governance.md`](./dependency-governance.md) — Approved library list, redundancies, version strategy
> - [`build-quality-report.md`](./build-quality-report.md) — CI audit, Turbo pipeline, TS config, baselines
> - [`target-architecture.md`](./target-architecture.md) — Target package structure, enforcement tooling, phased migration

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Findings](#2-architecture-findings)
3. [Top Risk Registry](#3-top-risk-registry)
4. [Refactor Backlog — Tickets](#4-refactor-backlog--tickets)
5. [System-Level Test Recommendations](#5-system-level-test-recommendations)
6. [Quick-Win Summary](#6-quick-win-summary)

---

## 1. Executive Summary

The `ngcompass` monorepo is architecturally coherent at a high level — clear workspace tooling, a sensible build graph, and a functional error model throughout. The risks are concentrated in three areas:

### 1.1 Broken CI (Immediate Risk)

Three independent CI failures exist **right now** that prevent the safety net from working:
1. `ci.yml` triggers on `master` — a branch that doesn't exist. Every push to `main` is unvalidated.
2. `test.yml` installs pnpm v8 against a pnpm@10 lockfile — CI is unreliable.
3. `test.yml` calls `node scripts/check-coverage.js` — a file that doesn't exist. CI always fails.

**Impact:** The project has no functioning automated gate on its default branch. A regression can ship undetected.

### 1.2 Architectural Boundaries (Medium-Term Risk)

- `@ngcompass/core` is a god-package hosting the engine, all rule implementations, the planner, the cache, config loading, parsers, and the registry. Adding any new rule, cache layer, or parser subsystem increases its blast radius.
- `@ngcompass/reporters` depends on `@ngcompass/core` for result-shape types, creating unnecessary coupling between the output layer and the engine.
- `@ngcompass/rules` and `@ngcompass/testing` are stub packages that provide no value — misleading consumers and adding Turbo build overhead.
- A global side-effect registration (`import './rules/register-all.js'`) fires on **any** import from `@ngcompass/core`, making unit tests stateful and blocking tree-shaking.

### 1.3 Dependency Hygiene (Low-Term Risk, Easy Fixes)

- `chalk` and `ora` are unused production dependencies in `@ngcompass/cli`.
- `jest`, `ts-jest`, `@types/jest` are leftover devDependencies in `@ngcompass/common` (workspace uses Vitest).
- `typescript` is in `@ngcompass/core` production dependencies and undeclared in `@ngcompass/common` — should be a peer dependency in both.
- All type-aware ESLint rules are disabled — the declared `recommended-requiring-type-checking` ruleset is a dead letter.

### Severity Breakdown

| Severity | Count |
|----------|-------|
| 🔴 Critical (active breakage) | 4 |
| 🔴 High (regression risk) | 5 |
| 🟠 Medium (maintainability debt) | 12 |
| 🟡 Low (polish / future friction) | 8 |

---

## 2. Architecture Findings

### AF-01 — Broken CI Branch Trigger

**Area:** `.github/workflows/ci.yml`
**Issue:** Workflow triggers on `master`/`develop`. The repo default branch is `main`. `ci.yml` never fires on `main`.
**Impact:** No automated validation on the production branch. Regressions can ship silently.
**Root cause:** Branch rename from `master` to `main` was not propagated to CI config.
**Rule violated:** Reliability, CI/CD contract
**Proposed fix:** Change `branches: [master, develop]` → `branches: [main, develop]`
**Success metric:** `ci.yml` triggers and passes on every push to `main`
**Tests/Checks:** Verify CI run appears in GitHub Actions after a push to `main`

---

### AF-02 — pnpm Version Mismatch in CI

**Area:** `.github/workflows/test.yml`
**Issue:** `pnpm/action-setup@v2` configured with `version: 8`. Root `packageManager` is `pnpm@10.26.0`.
**Impact:** `pnpm install` may regenerate the lockfile in pnpm v8 format, causing non-reproducible builds and CI failures.
**Root cause:** `version: 8` was left when pnpm was upgraded to v10.
**Rule violated:** Reproducible builds
**Proposed fix:** Remove `version: 8`; use `pnpm/action-setup@v4` which reads `packageManager` from `package.json`.
**Success metric:** `pnpm install --frozen-lockfile` succeeds in CI with pnpm@10.

---

### AF-03 — Missing check-coverage.js Script

**Area:** `.github/workflows/test.yml`
**Issue:** Step runs `node scripts/check-coverage.js` but the file does not exist.
**Impact:** CI step always fails with `MODULE_NOT_FOUND`, making coverage verification impossible.
**Root cause:** Script was planned but never implemented.
**Rule violated:** Reliability
**Proposed fix:** Create `scripts/check-coverage.js` (reads `coverage/coverage-summary.json`, enforces thresholds) OR remove the step and rely on vitest's built-in `--coverage.thresholds` in `vitest.config.ts`.
**Success metric:** CI coverage step completes successfully and enforces the 90/90/85/90 thresholds.

---

### AF-04 — @ngcompass/core God-Package

**Area:** `packages/core/`
**Issue:** Core owns the engine, planner, cache, scanner, parsers, config loading, plugin registry, AND all 19 rule implementations. It is the largest package (~2500+ LOC) and grows with every new rule.
**Impact:** Runtime risk (all subsystems fail or succeed together), high coupling, slow incremental builds when any rule changes.
**Root cause:** Evolutionary growth without re-homing rule implementations as originally planned.
**Rule violated:** SRP, OCP, DRY (changes to one concern ripple through unrelated areas)
**Proposed fix:** Phase 2 migration: move `core/src/rules/migration/*.rule.ts` → `rules/src/rules/` (see `target-architecture.md` Phase 2).
**Success metric:** `@ngcompass/core` no longer contains any rule `.rule.ts` files. Rule count in `core` = 0.
**Tests/Checks:** All existing rule tests pass; no import errors; `turbo test` green.

---

### AF-05 — Global Side-Effect Registration on Core Import

**Area:** `packages/core/src/index.ts`
**Issue:** `import './rules/register-all.js'` fires whenever any symbol is imported from `@ngcompass/core`.
**Impact:** Unit tests are implicitly stateful (19 rules pre-registered); tree-shaking is blocked; plugin test isolation is impossible.
**Root cause:** Convenience pattern intended to simplify CLI setup.
**Rule violated:** No Side Effects, Test Isolation, POLA (Principle of Least Astonishment)
**Proposed fix:**
  1. Remove the side-effect import from `core/src/index.ts`.
  2. Export `registerAllBuiltinRules(): void` as an explicit function.
  3. Call it in `cli/src/bin/ngcompass.ts` at startup.
  4. Add `"sideEffects": false` to `core/package.json`.
**Success metric:** Importing `CacheContext` from `@ngcompass/core` no longer registers any rules. `getGlobalRegistry().all()` returns empty after a fresh import.

---

### AF-06 — reporters → core Layer Violation

**Area:** `packages/reporters/src/types.ts`
**Issue:** `reporters` imports `RuleFailure`, `RuleResult`, `RuleSeverity` from `@ngcompass/core`, creating an unnecessary dependency on the engine from the output layer.
**Impact:** Any reporter consumer (custom reporter plugins, editor integrations) must install the full engine (oxc-parser, typescript, xxhash-wasm, etc.).
**Root cause:** Types were defined in core where they were first created; reporters imported from there for convenience.
**Rule violated:** DIP (depend on abstractions not implementations), Layer Rule
**Proposed fix:**
  1. Move `RuleFailure`, `RuleResult`, `RuleSeverity` to `@ngcompass/common/src/result-types.ts`.
  2. Re-export from `core` for backward compat.
  3. Remove `@ngcompass/core` from `reporters` dependencies.
**Success metric:** `packages/reporters/package.json` `dependencies` contains no `@ngcompass/core`. `pnpm --filter @ngcompass/reporters typecheck` passes.

---

### AF-07 — Stub Packages Provide No Value

**Area:** `packages/rules/`, `packages/testing/`
**Issue:** Both packages export a single string constant. `rules` declares `@ngcompass/core` as a dependency it never uses. Both add Turbo build steps for no benefit.
**Impact:** Developer confusion; Turbo build overhead; `tsconfig.json` in `rules` contains a cross-package path to a non-existent directory (see BV-01).
**Root cause:** Packages created as placeholders; implementation was deferred.
**Rule violated:** YAGNI, Least Astonishment
**Proposed fix (short-term):** Fix tsconfig violations; remove `@ngcompass/rules` from `cli` dependencies until it provides real value.
**Proposed fix (long-term):** Phase 2 — populate both packages with real content.
**Success metric:** Both packages export meaningful public APIs consumed by at least one other package.

---

### AF-08 — Missing ast/utils.ts Exports from common

**Area:** `packages/common/src/index.ts`
**Issue:** `createPosition`, `normalizePath` in `ast/utils.ts` are not re-exported from the package entry point.
**Impact:** `core/tests/setup.test.ts` imports `createPosition` from `@ngcompass/common` — this fails against published builds.
**Root cause:** `ast/utils.ts` was added to the package but not wired into the index barrel.
**Rule violated:** Public API completeness
**Proposed fix:** Add `export * from './ast/utils.js'` to `packages/common/src/index.ts`.
**Success metric:** `import { createPosition } from '@ngcompass/common'` resolves in both ESM and CJS builds.

---

### AF-09 — All Type-Aware ESLint Rules Disabled

**Area:** `.eslintrc.cjs`
**Issue:** `recommended-requiring-type-checking` is in `extends` but all its rules are set to `'off'`. ESLint provides no type-safety value.
**Impact:** `any` proliferation, uncaught unsafe operations, `console.error` in hot paths — all pass ESLint silently.
**Root cause:** Rules were disabled to stop noisy errors during initial scaffolding; never re-enabled.
**Rule violated:** Quality Gate, Fail Fast
**Proposed fix:**
  Phase 1 (warn): Enable `no-explicit-any: warn`, `no-floating-promises: warn`, `no-console: warn`.
  Phase 2 (error): After violations fixed, promote to `error`.
**Success metric:** `pnpm lint` fails when `any` is introduced in a new file. Zero `console.*` in non-CLI packages.

---

### AF-10 — TypeScript in Core Production Dependencies (Not Peer)

**Area:** `packages/core/package.json`, `packages/common/src/ast/utils.ts`
**Issue:** `typescript` is a production dep in `core` and an undeclared runtime dep in `common`.
**Impact:** Version conflicts; `@ngcompass/common` alone causes `MODULE_NOT_FOUND: typescript` in downstream projects.
**Root cause:** `typescript` was added as a production dep for convenience; the undeclared dep in `common` was an oversight.
**Rule violated:** Dependency model (peerDeps for host tools)
**Proposed fix:** Move to `peerDependencies` in both packages.
**Success metric:** `pnpm --filter @ngcompass/common pack` + install in a fresh project with `typescript@^5` works.

---

### AF-11 — Cross-Package Source References in tsconfig

**Area:** `packages/rules/tsconfig.json`, `packages/core/tsconfig.json`
**Issue:** `rules/tsconfig.json` includes `../core/src/rules/domains` (cross-package, non-existent path). `core/tsconfig.json` includes two stale explicit `.ts` file paths.
**Impact:** Build confusion; if the directory is ever created, compilation breaks unexpectedly.
**Root cause:** Refactor moved rule files from `domains/` to `migration/`; tsconfig was not updated.
**Rule violated:** Package boundaries
**Proposed fix:** Remove all cross-package `../` paths and stale explicit paths from all tsconfig include arrays.
**Success metric:** Zero `../` entries in any `tsconfig.json` include array. Verified by grep CI gate.

---

### AF-12 — CI Does Not Use Turbo (Wasted Performance)

**Area:** Both CI workflows
**Issue:** Both workflows run sequential `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — bypassing Turbo entirely.
**Impact:** Full rebuild/retest on every CI run, even for trivial changes. Estimated 40–60% CI time wasted.
**Root cause:** Turbo was added after the CI workflows were written; the workflows were not updated.
**Rule violated:** Build performance, DRY (Turbo already configured, not used)
**Proposed fix:** Replace sequential pnpm calls with `pnpm exec turbo lint typecheck test build --concurrency=4` in CI. Add `TURBO_TOKEN` secret for remote cache.
**Success metric:** CI time < 3 min for a branch touching 1–2 packages (vs estimated 8–12 min today).

---

### AF-13 — require() in ESM Source

**Area:** `packages/core/src/cache/key-context.ts`
**Issue:** `require('oxc-parser/package.json')` inside an ESM module. ESM `dist/index.js` will get `ReferenceError: require is not defined` in native ESM runtime, silently falling back to `parserVersion = 'unknown'`.
**Impact:** Cache key integrity: if `parserVersion` is always `'unknown'`, cache entries are not invalidated on parser upgrades.
**Root cause:** `package.json` files may not be importable as sub-path ESM in older oxc-parser versions.
**Rule violated:** Module system consistency
**Proposed fix:** Replace `require()` with a dynamic `import()` with JSON assertion, or inject the version at build time via tsup `define`.
**Success metric:** No `require()` calls in `dist/index.js`. `parserVersion` is correct in ESM builds.

---

### AF-14 — Unused tsup.config.ts Factory

**Area:** `tsup.config.ts` (root)
**Issue:** The file exports a `createConfig()` factory for all packages to use. Zero packages import it. Each runs tsup with inline CLI flags.
**Impact:** Build configuration drift; the global dependency causes cache invalidation without effect.
**Root cause:** Factory was created proactively; packages were never migrated to use it.
**Rule violated:** YAGNI, DRY
**Proposed fix:** Either migrate all packages to use it, or delete it and remove from `turbo.json` `globalDependencies`.
**Success metric:** All packages produce builds via `createConfig()`, OR the file is deleted and removed from globalDependencies.

---

### AF-15 — Overlapping CI Workflows with Different Configurations

**Area:** `.github/workflows/ci.yml` + `.github/workflows/test.yml`
**Issue:** Two workflows, inconsistent branches (master vs main), inconsistent Node matrix (18+20 vs 18+20+22), duplicate pnpm install steps.
**Impact:** CI confusion; double CI minutes on `develop` branch; coverage uploaded twice.
**Root cause:** `test.yml` was added later as an enhancement but `ci.yml` was not consolidated.
**Proposed fix:** Merge both into a single `ci.yml` with `[18.x, 20.x, 22.x]` matrix and `[main, develop]` triggers. Delete `test.yml`.
**Success metric:** One CI workflow file. All matrix jobs pass.

---

## 3. Top Risk Registry

Ranked by **Impact × Likelihood** (I = impact 1–5, L = likelihood 1–5, Score = I × L):

| Rank | Finding | I | L | Score | Status |
|------|---------|---|---|-------|--------|
| 1 | **AF-01**: CI never fires on `main` | 5 | 5 | **25** | 🔴 Critical |
| 2 | **AF-02**: pnpm v8 vs pnpm@10 lockfile conflict | 5 | 5 | **25** | 🔴 Critical |
| 3 | **AF-03**: Missing `check-coverage.js` script | 4 | 5 | **20** | 🔴 Critical |
| 4 | **AF-05**: Side-effect registration on any core import | 5 | 4 | **20** | 🔴 High |
| 5 | **AF-10**: `typescript` undeclared in `common` (runtime fail) | 5 | 3 | **15** | 🔴 High |
| 6 | **AF-08**: `createPosition` not exported from `common` | 4 | 4 | **16** | 🔴 High |
| 7 | **AF-06**: `reporters` → `core` layer violation | 4 | 3 | **12** | 🟠 Medium |
| 8 | **AF-09**: ESLint type-safety rules all disabled | 4 | 3 | **12** | 🟠 Medium |
| 9 | **AF-04**: Core god-package | 3 | 4 | **12** | 🟠 Medium |
| 10 | **AF-12**: No Turbo in CI | 3 | 4 | **12** | 🟠 Medium |
| 11 | **AF-11**: tsconfig cross-package paths | 3 | 3 | **9** | 🟠 Medium |
| 12 | **AF-13**: `require()` in ESM | 3 | 3 | **9** | 🟠 Medium |
| 13 | **AF-15**: Overlapping CI workflows | 2 | 4 | **8** | 🟠 Medium |
| 14 | **AF-07**: Stub packages | 2 | 3 | **6** | 🟡 Low |
| 15 | **AF-14**: Unused tsup.config.ts | 1 | 4 | **4** | 🟡 Low |

---

## 4. Refactor Backlog — Tickets

All tickets are tagged with their Phase (P0 = immediate, P1 = boundary stabilization, P2 = structural).

---

### TICKET-A01 — Fix CI Branch Trigger (P0)

**Title:** Fix `ci.yml` to trigger on `main` instead of `master`
**Scope:** `.github/workflows/ci.yml`
**Priority:** 🔴 Critical
**Effort:** 5 min

**Problem:** `ci.yml` triggers on `branches: [master, develop]`. The `master` branch does not exist. Every push to `main` skips CI entirely.

**Steps:**
1. In `.github/workflows/ci.yml`, change `branches: [master, develop]` → `branches: [main, develop]` in both the `push` and `pull_request` trigger blocks.

**Definition of Done:**
- [ ] `ci.yml` push trigger: `branches: [main, develop]`
- [ ] `ci.yml` pull_request trigger: `branches: [main, develop]`
- [ ] A test push to `main` triggers the `CI` workflow in GitHub Actions
- [ ] Workflow completes successfully

**Tests/Checks:** GitHub Actions run log shows the CI workflow triggered on push to `main`.

---

### TICKET-A02 — Fix pnpm Version in test.yml (P0)

**Title:** Fix pnpm version mismatch in `test.yml`
**Scope:** `.github/workflows/test.yml`
**Priority:** 🔴 Critical
**Effort:** 5 min

**Problem:** `test.yml` installs pnpm v8 against a pnpm@10 lockfile format.

**Steps:**
1. In `test.yml`, change:
   ```yaml
   - uses: pnpm/action-setup@v2
     with:
       version: 8
   ```
   to:
   ```yaml
   - uses: pnpm/action-setup@v4   # reads packageManager from package.json
   ```
2. Remove the `version` field entirely — pnpm@v4 of the action reads `packageManager` from root `package.json`.

**Definition of Done:**
- [ ] `test.yml` uses `pnpm/action-setup@v4` with no `version` field
- [ ] `pnpm install --frozen-lockfile` succeeds in CI

---

### TICKET-A03 — Create check-coverage.js or Remove Broken Step (P0)

**Title:** Fix broken coverage gate in `test.yml`
**Scope:** `.github/workflows/test.yml`, `scripts/check-coverage.js`
**Priority:** 🔴 Critical
**Effort:** 30 min

**Problem:** `test.yml` calls `node scripts/check-coverage.js` which doesn't exist. CI always fails at this step.

**Steps (Option A — preferred):**
1. Create `scripts/check-coverage.js`:
   ```javascript
   import { readFileSync } from 'node:fs';
   const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
   const { lines, functions, branches, statements } = summary.total;
   const thresholds = { lines: 90, functions: 90, branches: 85, statements: 90 };
   let failed = false;
   for (const [key, min] of Object.entries(thresholds)) {
       const pct = summary.total[key]?.pct ?? 0;
       if (pct < min) { console.error(`${key}: ${pct}% < ${min}%`); failed = true; }
   }
   process.exit(failed ? 1 : 0);
   ```
2. Add `"type": "module"` to `scripts/package.json` or use `.mjs` extension.

**Steps (Option B — simpler):**
1. Remove the `node scripts/check-coverage.js` step from `test.yml`.
2. Add `--coverage.thresholds.lines=90` etc. directly to the `vitest run --coverage` command (already configured in `vitest.config.ts`).

**Definition of Done:**
- [ ] CI coverage gate step completes without `MODULE_NOT_FOUND` error
- [ ] Build fails when coverage drops below 90% lines
- [ ] `pnpm test:coverage` exits non-zero when thresholds not met

---

### TICKET-A04 — Consolidate CI Workflows + Add Turbo (P0/P1)

**Title:** Merge `ci.yml` + `test.yml` into single Turbo-powered workflow
**Scope:** `.github/workflows/`
**Priority:** 🔴 High
**Effort:** 2 hr

**Problem:** Two overlapping CI workflows with different configs; neither uses Turbo.

**Steps:**
1. Create new `.github/workflows/ci.yml` based on template in `target-architecture.md §7`.
2. Delete `.github/workflows/test.yml`.
3. Add `TURBO_TOKEN` and `TURBO_TEAM` as repository secrets (see Turbo docs for setup).
4. Replace sequential pnpm calls with `pnpm exec turbo lint typecheck test build --concurrency=4`.
5. Add `pnpm audit --audit-level moderate` step.
6. Add `codecov/codecov-action@v4` upload on Node 20 only.

**Definition of Done:**
- [ ] Single `ci.yml` workflow file (`.github/workflows/test.yml` deleted)
- [ ] Triggers on `main` and `develop`
- [ ] Matrix: Node `[18.x, 20.x, 22.x]`
- [ ] Uses `pnpm/action-setup@v4` (reads packageManager)
- [ ] Runs via `turbo` command (not sequential pnpm)
- [ ] Security audit step present
- [ ] Coverage uploaded on Node 20
- [ ] Full CI run completes successfully

**Tests/Checks:** PRs to `main` and `develop` show the consolidated CI workflow in GitHub Actions.

---

### TICKET-A05 — Export ast/utils.ts from @ngcompass/common (P0)

**Title:** Add missing `createPosition` / `normalizePath` exports to common's public API
**Scope:** `packages/common/src/index.ts`
**Priority:** 🔴 High
**Effort:** 15 min

**Problem:** `ast/utils.ts` exports are not re-exported from `index.ts`, breaking `import { createPosition } from '@ngcompass/common'` in published builds.

**Steps:**
1. Add to `packages/common/src/index.ts`:
   ```typescript
   export * from './ast/utils.js';
   ```
2. Run `pnpm --filter @ngcompass/common typecheck` — verify zero errors.
3. Run `pnpm --filter @ngcompass/core typecheck` — verify `core/tests/setup.test.ts` import resolves.

**Definition of Done:**
- [ ] `export * from './ast/utils.js'` present in `common/src/index.ts`
- [ ] `import { createPosition } from '@ngcompass/common'` resolves in both CJS and ESM builds
- [ ] `pnpm --filter @ngcompass/common typecheck` zero errors

---

### TICKET-A06 — Fix Stale tsconfig Include Paths (P0)

**Title:** Remove cross-package and stale include paths from tsconfig files
**Scope:** `packages/rules/tsconfig.json`, `packages/core/tsconfig.json`
**Priority:** 🟠 Medium
**Effort:** 30 min

**Problem:** `rules/tsconfig.json` includes `../core/src/rules/domains` (cross-package, non-existent). `core/tsconfig.json` includes two stale explicit `.ts` paths that don't exist.

**Steps:**
1. In `packages/rules/tsconfig.json`, remove `"../core/src/rules/domains"` from `include` array.
2. In `packages/core/tsconfig.json`, remove `"src/rules/domains/prefer-on-push.ts"` and `"src/rules/domains/template-no-call-expression.ts"` from `include` array.
3. Run typecheck for both packages to verify no compilation regressions.
4. Add a CI gate (grep step) to fail if any `tsconfig.json` contains `../` in its `include` array.

**Definition of Done:**
- [ ] `rules/tsconfig.json` `include` has no `../` paths
- [ ] `core/tsconfig.json` `include` has no stale explicit paths
- [ ] `pnpm --filter @ngcompass/rules typecheck` passes
- [ ] `pnpm --filter @ngcompass/core typecheck` passes (excluding pre-existing TS6133)
- [ ] CI grep gate added: `grep -r '"../' packages/*/tsconfig.json` exits non-zero

---

### TICKET-A07 — Remove Unused CLI Dependencies (P0)

**Title:** Remove `chalk` and `ora` from `@ngcompass/cli` production dependencies
**Scope:** `packages/cli/package.json`
**Priority:** 🟠 Medium
**Effort:** 15 min

**Problem:** `chalk@^5.0.0` and `ora@^7.0.0` are production dependencies of `@ngcompass/cli` but are not imported anywhere in `cli/src/`.

**Steps:**
1. `pnpm --filter @ngcompass/cli remove chalk ora`
2. `pnpm --filter @ngcompass/cli build` — verify no missing module errors
3. `pnpm --filter @ngcompass/cli typecheck` — verify clean

**Definition of Done:**
- [ ] `chalk` and `ora` absent from `packages/cli/package.json` dependencies
- [ ] Build and typecheck pass

---

### TICKET-A08 — Remove jest/ts-jest Leftovers from common (P0)

**Title:** Remove Jest devDependencies from `@ngcompass/common` (workspace uses Vitest)
**Scope:** `packages/common/package.json`
**Priority:** 🟠 Medium
**Effort:** 15 min

**Problem:** `jest@^30.2.0`, `ts-jest@^29.4.6`, `@types/jest@^30.0.0` are in `@ngcompass/common` devDependencies but the workspace uses Vitest. `@types/jest` conflicts with vitest global types.

**Steps:**
1. `pnpm --filter @ngcompass/common remove jest ts-jest @types/jest`
2. Remove `tsconfig.spec.json` at repo root (ts-jest config — no longer needed).
3. Verify `pnpm --filter @ngcompass/common typecheck` still passes.

**Definition of Done:**
- [ ] `jest`, `ts-jest`, `@types/jest` absent from `packages/common/package.json` devDependencies
- [ ] `tsconfig.spec.json` deleted
- [ ] `pnpm --filter @ngcompass/common typecheck` passes with zero errors

---

### TICKET-A09 — Move Result-Shape Types to common (P1)

**Title:** Move `RuleFailure`, `RuleResult`, `RuleSeverity` from core to common
**Scope:** `packages/core/src/rules/types.ts` → `packages/common/src/result-types.ts`
**Priority:** 🔴 High
**Effort:** 2–3 hr

**Problem:** `reporters` imports `RuleFailure`/`RuleResult`/`RuleSeverity` from `@ngcompass/core`, coupling the output layer to the full engine.

**Steps:**
1. Create `packages/common/src/result-types.ts` with the extracted types:
   ```typescript
   // RuleFailure, RuleResult, RuleSeverity (and related supporting types)
   ```
2. Export from `packages/common/src/index.ts`: `export * from './result-types.js'`.
3. In `packages/core/src/rules/types.ts`, add re-exports for backward compat:
   ```typescript
   export type { RuleFailure, RuleResult, RuleSeverity } from '@ngcompass/common';
   ```
4. Update `packages/reporters/src/types.ts` to import from `@ngcompass/common` instead of `@ngcompass/core`.
5. Remove `@ngcompass/core` from `packages/reporters/package.json` dependencies.
6. Run full typecheck across all packages.

**Definition of Done:**
- [ ] `RuleFailure`, `RuleResult`, `RuleSeverity` exported from `@ngcompass/common`
- [ ] `packages/reporters/package.json` has no `@ngcompass/core` dependency
- [ ] `pnpm --filter @ngcompass/reporters typecheck` passes
- [ ] All other packages typecheck clean

**Tests/Checks:**
- Integration test: `@ngcompass/reporters` can be installed in a fresh project without `@ngcompass/core`.

---

### TICKET-A10 — Remove Side-Effect Registration from core Barrel (P1)

**Title:** Replace implicit `register-all.js` import with explicit `registerAllBuiltinRules()` function
**Scope:** `packages/core/src/index.ts`, `packages/cli/src/bin/ngcompass.ts`
**Priority:** 🔴 High
**Effort:** 2 hr

**Problem:** `import './rules/register-all.js'` in `core/src/index.ts` fires on any import from `@ngcompass/core`, polluting test state and blocking tree-shaking.

**Steps:**
1. In `core/src/rules/register-all.ts`, export a function:
   ```typescript
   export function registerAllBuiltinRules(): void {
       getGlobalRegistry().registerMany([...all rules...]);
   }
   ```
2. Remove `import './rules/register-all.js'` from `core/src/index.ts`.
3. Export `registerAllBuiltinRules` from `core/src/index.ts`.
4. In `cli/src/bin/ngcompass.ts`, add `registerAllBuiltinRules()` call before command execution.
5. Update any test setup files that relied on the implicit registration.
6. Add `"sideEffects": false` to `packages/core/package.json`.

**Definition of Done:**
- [ ] No top-level side-effect `import` in `core/src/index.ts`
- [ ] `registerAllBuiltinRules()` exported from `@ngcompass/core`
- [ ] `cli/src/bin/ngcompass.ts` calls it at startup
- [ ] `"sideEffects": false` in `core/package.json`
- [ ] Unit test: importing `CacheContext` from `@ngcompass/core` does not register any rules

---

### TICKET-A11 — Move typescript to peerDependencies (P1)

**Title:** Declare `typescript` as a peer dependency in `common` and `core`
**Scope:** `packages/common/package.json`, `packages/core/package.json`
**Priority:** 🔴 High
**Effort:** 1 hr

**Problem:** `typescript` is a production dep in `core` and undeclared in `common`. Consumers of `common` get a runtime `MODULE_NOT_FOUND`.

**Steps:**
1. In `packages/common/package.json`:
   - Add `"peerDependencies": { "typescript": ">=4.7.0" }`
   - Move `typescript` from devDependencies back to devDependencies (keep it there for local testing), ensure it's declared in `peerDependencies`.
2. In `packages/core/package.json`:
   - Move `typescript` from `dependencies` to `peerDependencies: { "typescript": ">=4.7.0" }`.
   - Keep in devDependencies for local builds.
3. Run `pnpm install` to update lockfile.
4. Run full typecheck.

**Definition of Done:**
- [ ] `typescript` absent from `core` `dependencies`
- [ ] `typescript` in `peerDependencies` for both `common` and `core`
- [ ] `pnpm install` in a fresh project with `typescript@^5` resolves correctly
- [ ] Full typecheck passes

---

### TICKET-A12 — Add eslint-plugin-boundaries (P1)

**Title:** Add `eslint-plugin-boundaries` to enforce package dependency rules
**Scope:** `.eslintrc.cjs`, root devDependencies
**Priority:** 🟠 Medium
**Effort:** 2 hr

**Problem:** No automated enforcement of the dependency rules documented in `target-architecture.md`. Any developer can accidentally import `@ngcompass/core` from `reporters`.

**Steps:**
1. `pnpm add -D -w eslint-plugin-boundaries`
2. Configure in `.eslintrc.cjs` (warn mode initially):
   ```javascript
   plugins: ['boundaries'],
   settings: { 'boundaries/elements': [...] },
   rules: { 'boundaries/element-types': ['warn', { ... }] }
   ```
   (Full config in `target-architecture.md §5.1`)
3. Run `pnpm lint` — collect and triage all warnings.
4. After existing violations are fixed, switch to `'error'`.

**Definition of Done:**
- [ ] `eslint-plugin-boundaries` installed
- [ ] Running in warn mode with zero new warnings
- [ ] Promoted to error mode after Phase 1 boundary fixes complete

---

### TICKET-A13 — Enable ESLint Type-Safety Rules (P1)

**Title:** Re-enable `no-explicit-any`, `no-floating-promises`, `no-console` in warn mode
**Scope:** `.eslintrc.cjs`
**Priority:** 🟠 Medium
**Effort:** 3 hr

**Problem:** All type-aware ESLint rules are disabled. `any` proliferation and `console.error` in hot paths are invisible to linting.

**Steps:**
1. In `.eslintrc.cjs`, change from `'off'` to `'warn'`:
   - `'@typescript-eslint/no-explicit-any': 'warn'`
   - `'@typescript-eslint/no-floating-promises': 'warn'`
   - `'no-console': ['warn', { allow: ['warn', 'error'] }]`
2. Run `pnpm lint` — collect all new warnings into a tracking issue.
3. Fix violations package by package.
4. Promote to `'error'` once resolved.

**Definition of Done:**
- [ ] `no-explicit-any: warn` enabled
- [ ] `no-floating-promises: warn` enabled
- [ ] `no-console: warn` enabled (allow: `['warn', 'error']`)
- [ ] No new violations in a clean `main` branch
- [ ] Tracking issue created for existing violations

---

### TICKET-A14 — Populate @ngcompass/rules with Built-in Rules (P2)

**Title:** Migrate built-in rule implementations from `core` to `rules`
**Scope:** `packages/core/src/rules/migration/` → `packages/rules/src/rules/`
**Priority:** 🟠 Medium
**Effort:** 1–2 days

**Problem:** All 19 rule implementations live in `@ngcompass/core`. The `rules` package is a stub. This is the god-package's primary concern.

**Steps:**
1. Create `packages/rules/src/rules/migration/` directory.
2. Move all `*.rule.ts` files from `core/src/rules/migration/` to `rules/src/rules/migration/`.
3. Update imports within moved files (they import from `@ngcompass/core` — verify no circular dep).
4. Update `core/src/rules/register-all.ts` to import from `@ngcompass/rules`.
5. Update `rules/src/index.ts` to export all rule classes and a `BUILT_IN_RULES` array.
6. Move rule unit tests from `core/tests/rules/` to `rules/tests/rules/`.
7. Update Turbo and build configs if needed.

**Definition of Done:**
- [ ] `core/src/rules/migration/` is empty (all rules in `rules/src/rules/migration/`)
- [ ] `@ngcompass/rules` exports 19+ rule implementations
- [ ] Rule tests pass in `rules` package
- [ ] `pnpm turbo test --filter=@ngcompass/rules` green
- [ ] `core/src/` has zero `.rule.ts` files

---

### TICKET-A15 — Implement @ngcompass/testing Utilities (P2)

**Title:** Replace `testing` stub with real rule test harness
**Scope:** `packages/testing/src/`
**Priority:** 🟠 Medium
**Effort:** 1 day

**Problem:** `@ngcompass/testing` exports a single string constant. Rule authors have no shared test utilities.

**Steps:**
1. Implement `createTestRule(ruleClass, config?)` — factory that wires a rule into a synthetic context.
2. Implement `createMockCacheContext()` — in-memory cache (all drivers backed by Map) for test isolation.
3. Implement `createMockAnalyzerConfig(overrides?)` — builder for default NormalizedAnalyzerConfig.
4. Implement `RuleTestHarness.run(filePath, source)` — returns `RuleFailure[]` for assertion.
5. Export all from `testing/src/index.ts`.
6. Add unit tests for the harness itself.
7. Update `rules/tests/` to use `@ngcompass/testing` harness.

**Definition of Done:**
- [ ] `@ngcompass/testing/src/index.ts` exports `createTestRule`, `createMockCacheContext`, `createMockAnalyzerConfig`, `RuleTestHarness`
- [ ] All exports have JSDoc documentation
- [ ] `rules/tests/` use `@ngcompass/testing` instead of ad-hoc setup
- [ ] Coverage ≥ 90% for testing package itself

---

### TICKET-A16 — Remove redundant common devDependencies (P0)

**Title:** Remove `eslint`, `rimraf`, `tsup` from `@ngcompass/common` devDependencies — inherit from root
**Scope:** `packages/common/package.json`
**Priority:** 🟡 Low
**Effort:** 10 min

**Steps:**
1. Remove `eslint`, `rimraf`, `tsup` from `packages/common/package.json` devDependencies.
2. `pnpm install`
3. `pnpm --filter @ngcompass/common build` — verify tools resolve from root.

**Definition of Done:**
- [ ] `eslint`, `rimraf`, `tsup` absent from `common` devDependencies
- [ ] `pnpm --filter @ngcompass/common build` succeeds

---

### TICKET-A17 — Add sideEffects Field to All Packages (P1, after A10)

**Title:** Declare `"sideEffects"` in all package.json files after removing core side-effect
**Scope:** All `packages/*/package.json`
**Priority:** 🟠 Medium
**Effort:** 30 min (after TICKET-A10)
**Depends on:** TICKET-A10 (side-effect import removed from core)

**Steps:**
1. Add `"sideEffects": false` to `common`, `core`, `reporters`, `rules`, `testing`.
2. For `cli` (binary, not bundled): `"sideEffects": true` or omit.
3. Rebuild all packages and run full test suite.

**Definition of Done:**
- [ ] All packages except `cli` declare `"sideEffects": false`
- [ ] Tree-shaking test: importing `CacheContext` from a bundled consumer does not include rule code

---

### TICKET-A18 — Fix require() ESM Hazard in key-context.ts (P1)

**Title:** Replace `require('oxc-parser/package.json')` with ESM-compatible alternative
**Scope:** `packages/core/src/cache/key-context.ts`
**Priority:** 🟠 Medium
**Effort:** 1 hr

**Steps:**
1. Replace `require()` with a dynamic `import()` or build-time injection:
   ```typescript
   // Option A: dynamic import (requires top-level await or Promise chain)
   const parserVersion = await import('oxc-parser/package.json', { assert: { type: 'json' } })
       .then(m => m.default.version)
       .catch(() => 'unknown');
   ```
2. Remove the `eslint-disable-next-line @typescript-eslint/no-require-imports` comment.
3. Enable `@typescript-eslint/no-require-imports: error` rule.

**Definition of Done:**
- [ ] No `require()` in `key-context.ts`
- [ ] `parserVersion` correctly reports the oxc-parser version in ESM builds
- [ ] `@typescript-eslint/no-require-imports: error` passes

---

### TICKET-A19 — Implement pnpm catalog: for Shared Tool Versions (P2)

**Title:** Centralize build tool versions via pnpm catalog protocol
**Scope:** `pnpm-workspace.yaml`, all `packages/*/package.json`
**Priority:** 🟡 Low
**Effort:** 1 hr

**Steps:**
1. Add `catalog:` block to `pnpm-workspace.yaml` for `typescript`, `tsup`, `eslint`, `@types/node`, `vitest`.
2. Replace version strings in package.json devDependencies with `catalog:`.
3. `pnpm install` to regenerate lockfile.
4. Verify all builds and typechecks pass.

**Definition of Done:**
- [ ] `pnpm-workspace.yaml` has `catalog:` section
- [ ] At minimum `typescript`, `tsup`, `vitest` use `catalog:` protocol
- [ ] `pnpm install` resolves cleanly

---

### TICKET-A20 — Standardize Test File Extensions (P0)

**Title:** Rename `reporters` test files from `.spec.ts` to `.test.ts`
**Scope:** `packages/reporters/tests/*.spec.ts`
**Priority:** 🟡 Low
**Effort:** 15 min

**Steps:**
1. Rename `config-reporter.spec.ts` → `config-reporter.test.ts`
2. Rename `console-reporter.spec.ts` → `console-reporter.test.ts`
3. Rename `json-reporter.spec.ts` → `json-reporter.test.ts`
4. Verify `pnpm vitest run` picks up the renamed files.

**Definition of Done:**
- [ ] All test files use `.test.ts` extension
- [ ] `pnpm test:coverage` counts all test files

---

### TICKET-A21 — Adopt Shared tsup.config.ts Factory (P2)

**Title:** Migrate all package build scripts to use the root `tsup.config.ts` factory
**Scope:** All `packages/*/package.json` build scripts, root `tsup.config.ts`
**Priority:** 🟡 Low
**Effort:** 2 hr

**Steps:**
1. Audit and update the root `tsup.config.ts` `createConfig()` factory to support all package needs (multiple entry points, `external`, `define`).
2. Create `packages/<name>/tsup.config.ts` in each package that calls `createConfig()`.
3. Update each package's build script to `tsup --config tsup.config.ts`.
4. Verify all 6 packages build correctly.
5. Update `turbo.json` `globalDependencies` — confirm the factory is still needed there.

**Definition of Done:**
- [ ] All packages use `createConfig()` from root `tsup.config.ts`
- [ ] No per-package tsup CLI flags that differ from the factory
- [ ] All builds produce identical outputs to current

---

## 5. System-Level Test Recommendations

### ST-01 — Package API Contract Tests

**Goal:** Prevent internal module leakage regressions. Verify that only declared exports are accessible.

```typescript
// For each package: verify import resolves only from root entry
import * as core from '@ngcompass/core';
it('exports only public API', () => {
    expect(core).not.toHaveProperty('createCacheContext.__internal');
    expect(Object.keys(core)).not.toContain('register-all');
});

// Verify no src-path import works
it('does not expose src paths', () => {
    expect(() => require('@ngcompass/core/src/cache/context')).toThrow();
});
```

### ST-02 — Cross-Package Workflow Integration Test

**Goal:** Verify the full analysis pipeline works end-to-end after boundary refactors.

```typescript
// Full pipeline smoke test
it('analyzes a synthetic Angular project', async () => {
    const config = await resolveConfig({ cwd: fixturePath });
    const files = await scan({ rootDir: fixturePath, ... });
    const rules = await resolveRules(config.config!);
    const plan = await buildExecutionPlan({ files: files.data.files, rules: ... });
    const result = await runAnalysis(plan, { ... });
    expect(result.ok).toBe(true);
    expect(result.data.stats.totalFiles).toBeGreaterThan(0);
});
```

### ST-03 — Bundle Regression Test

**Goal:** Detect bundled duplicate dependencies; enforce size budgets.

Add to CI:
```yaml
- run: pnpm exec size-limit
```

With config:
```json
[
    { "path": "packages/core/dist/index.js", "limit": "300 KB" },
    { "path": "packages/reporters/dist/index.js", "limit": "50 KB" }
]
```

Companion check: `pnpm exec bundlewatch --config bundlewatch.json` to detect duplicate deps in bundles.

### ST-04 — CI Reproducibility Test

**Goal:** Ensure `pnpm install --frozen-lockfile` succeeds in a clean environment.

```yaml
- name: Verify lockfile is up to date
  run: pnpm install --frozen-lockfile
  # This fails if package.json was changed without running pnpm install
```

This catches the "I added a dep to package.json but didn't run pnpm install" scenario that breaks CI for collaborators.

### ST-05 — Security Vulnerability Gate

**Goal:** Block merges when a high/critical CVE is introduced.

```yaml
- name: Security audit
  run: pnpm audit --audit-level high
  # Fails CI on HIGH or CRITICAL CVEs; MODERATE is logged but not blocking
```

Augment with Dependabot alerts enabled on the GitHub repository for automated PR creation on new CVEs.

---

## 6. Quick-Win Summary

Actions completable in under 30 minutes each, with zero architectural risk:

| # | Action | Time | Ticket |
|---|--------|------|--------|
| 1 | Fix `ci.yml` branch: `master` → `main` | 5 min | A01 |
| 2 | Fix `test.yml` pnpm version | 5 min | A02 |
| 3 | Remove `chalk` + `ora` from cli deps | 15 min | A07 |
| 4 | Remove `jest`/`ts-jest`/`@types/jest` from common | 15 min | A08 |
| 5 | Export `createPosition` from `common/src/index.ts` | 15 min | A05 |
| 6 | Remove stale tsconfig include paths | 20 min | A06 |
| 7 | Standardize test file extensions to `.test.ts` | 15 min | A20 |
| 8 | Remove redundant `eslint`/`rimraf`/`tsup` from common devDeps | 10 min | A16 |
| 9 | Delete `tsconfig.spec.json` | 5 min | Part of A08 |

**Total estimated time for all quick wins: ~1.5 hours**
**Zero breaking changes. All are isolated, non-architectural cleanup.**

---

*Generated from source analysis on branch `feat_quality`. Re-run after each phase completion to track debt reduction.*
*Companion files: `architecture-inventory.md` · `boundary-violations.md` · `dependency-governance.md` · `build-quality-report.md` · `target-architecture.md`*
