# ngcompass — Clean-Code & Architecture Audit Report

> **Date:** 2026-02-27
> **Auditor:** Automated static + structural review (Claude Sonnet 4.6)
> **Branch audited:** `feat_quality` (head: `2d1fcab`)
> **Scope:** Full monorepo — 6 packages, ~4 000 LOC TypeScript
> **Methodology:** Source reading, cross-reference analysis, principle mapping against the 40-rule rubric (DRY / KISS / SOLID / LoD / Fail Fast / Boy Scout Rule / CQS / etc.)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Hotspot Registry (`hotspots.md`)](#2-hotspot-registry)
3. [Audit Findings (`audit-findings.md`)](#3-audit-findings)
4. [Refactor Backlog (Tickets)](#4-refactor-backlog)
5. [Test Plans for Top-3 Hotspots](#5-test-plans-for-top-3-hotspots)
6. [Tooling Recommendations](#6-tooling-recommendations)

---

## 1. Executive Summary

`ngcompass` is a well-structured Angular static analysis tool with clear package boundaries, functional programming patterns, a `Result<T,E>` error model, and documented performance contracts. The architecture is largely sound. The issues found are concentrated in **type-safety escapes**, **error-handling inconsistency**, **DRY violations**, and **magic values** — all of which carry regression risk as the rule-set and cache layer grow.

### Severity Breakdown

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 High | 5 | Regression-risk or broken contract |
| 🟠 Medium | 8 | Maintainability debt, likely to rot |
| 🟡 Low | 6 | Style / clarity / future friction |

### Principles Most Violated

| Principle | Hotspot Count | Notes |
|-----------|--------------|-------|
| DRY | 4 | Duplication in cache, engine, CLI step functions |
| Type Safety / Intent-Revealing Names | 6 | `any` escapes and positional booleans |
| Error Handling as One Thing | 3 | Three different strategies in one pipeline |
| SRP | 3 | Functions doing multiple jobs |
| No Magic Values | 4 | Hard-coded thresholds inside function bodies |

---

## 2. Hotspot Registry

### HS-01 — `packages/cli/src/commands/analyze.ts`

| Field | Value |
|-------|-------|
| **Module/Path** | `packages/cli/src/commands/analyze.ts` |
| **Lines** | 296 |
| **Why it's a hotspot** | Central pipeline orchestrator — all 7 analysis phases pass through this file. Every new feature or option touches it. |
| **Primary risks** | Type erasure via `config: any`; `process.exit()` inside helper functions couples error handling to CLI exit semantics; known inaccuracy in `cachedTasks` counter (commented "Approximation"). |
| **Principles violated** | DRY, SRP, Intent-Revealing Names, No Magic Strings, Fail Fast |
| **Suggested refactor direction** | Extract step options into a typed `StepContext`; replace `config: any` with `NormalizedAnalyzerConfig`; move `process.exit` to the top-level action handler; extract default pattern to a constant. |
| **Testing gaps** | No test for the `--rule` filter override path; no test verifying that a config validation failure exits with code 1 rather than throwing; no integration test covering the full 7-step pipeline. |

---

### HS-02 — `packages/core/src/planner/builder.ts`

| Field | Value |
|-------|-------|
| **Module/Path** | `packages/core/src/planner/builder.ts` |
| **Lines** | 617 |
| **Why it's a hotspot** | Largest single file in the monorepo; responsible for plan building, caching, worker dispatch, hash calculation, serialization, and incremental filtering. High cyclomatic complexity. |
| **Primary risks** | Magic numbers `10000` and `4` baked into `buildAllTasks`; `as unknown as ExecutionPlanOutput` double-cast bypasses type system; fragile multi-candidate worker path resolution; `any` types on rule parameters hide schema mismatches at compile time. |
| **Principles violated** | SRP, DRY, No Magic Numbers, Intent-Revealing Names, Law of Demeter |
| **Suggested refactor direction** | Extract constants `PARALLEL_TASK_BUILD_THRESHOLD` and `PLANNER_WORKER_COUNT` to `constants.ts`; replace `any` in rule maps with `ResolvedRule`; split `tryLoadPlanFromCache` into `checkAnalysisCache` + `checkPlanCache`; move `groupTasksByFile` to a shared utility (it is duplicated in `worker-pool.ts`). |
| **Testing gaps** | No test for cache corruption self-heal path; no test for the parallel/sequential branch switch at the 10 000 threshold; no test for worker path resolution fallback. |

---

### HS-03 — `packages/core/src/rules/engine/single-pass-engine.ts`

| Field | Value |
|-------|-------|
| **Module/Path** | `packages/core/src/rules/engine/single-pass-engine.ts` |
| **Lines** | 252 |
| **Why it's a hotspot** | Performance-critical hot path — executed once per analyzed file. Any regression here affects all rules. Uses `console.error` directly in a hot loop; budget violations are tracked but not enforced or surfaced to the caller. |
| **Primary risks** | `console.error` in rule-crash handler pollutes stdout/stderr with unstructured output in production; budget-violation array is returned in `PerformanceReport` but no caller currently checks or acts on it; `resetComponentCacheStats()` is a global side effect that makes the function non-idempotent. |
| **Principles violated** | Error Handling as One Thing, SRP, DRY (dispatch loops), No Side Effects |
| **Suggested refactor direction** | Replace `console.error` with injected `errorCollector.record()`; add optional `onBudgetViolation` callback to the options or surface violations in the returned result with a flag; extract dispatch-and-time loop body to a shared helper to eliminate the duplication between the main walk and `dispatchTemplateHandlers`. |
| **Testing gaps** | No test verifying that a crashing rule is isolated and does not stop other rules; no test that `budgetViolations` is populated correctly; no test for `resetComponentCacheStats` side-effect isolation between calls. |

---

### HS-04 — `packages/core/src/cache/context.ts`

| Field | Value |
|-------|-------|
| **Module/Path** | `packages/core/src/cache/context.ts` |
| **Lines** | 163 |
| **Why it's a hotspot** | Initializes all 8 cache layers and exposes `clear`, `clearType`, `getInfo`, and `prune`. Shared state is a source of hard-to-reproduce bugs in test suites and long-running processes. |
| **Primary risks** | `clear()` and `clearType('all')` bodies are identical — any new cache layer added to one will be silently missed in the other; `getInfo()` omits `plans`, `meta`, `files`, and `analysis` from size tallying; global singleton `getCacheContext` can leak state between test runs; `process.cwd()` called at factory time makes the path non-deterministic under test. |
| **Principles violated** | DRY, SRP, Fail Fast (incomplete stats), Least Astonishment (singleton leak) |
| **Suggested refactor direction** | Extract the driver list to a typed array and iterate it in both `clear` and `clearType`; fix `getInfo` to aggregate all drivers; make `defaultBaseDir` an injected parameter with a sensible default; add `resetGlobalCache()` export for test teardown. |
| **Testing gaps** | No test for `clearType('results')` verifying that `analysisDriver` is also cleared; no test asserting `getInfo().totalSize` includes all layers; no test isolating singleton behavior. |

---

### HS-05 — `packages/common/src/logger.ts`

| Field | Value |
|-------|-------|
| **Module/Path** | `packages/common/src/logger.ts` |
| **Lines** | 182 |
| **Why it's a hotspot** | Cross-cutting dependency — imported by every package. Bugs here affect all diagnostic output. Namespace parse logic has a counterintuitive fallback. |
| **Primary risks** | `parseNamespaces` returns `'all'` when *no* valid namespace is found — enabling all logging on a typo (e.g. `DEBUG=ngcompass:typo`); `_level` parameter is named to suppress the lint error but is completely unused, meaning `warn` and `error` messages are indistinguishable from `debug` in output; `...args: any[]` on public methods. |
| **Principles violated** | Fail Fast, Intent-Revealing Names, KISS (unused level param) |
| **Suggested refactor direction** | Fix `parseNamespaces` fallback to return an empty set (disabled) rather than `'all'`; remove `_level` suppression and either implement level-based filtering or remove the parameter; replace `...args: any[]` with `...args: unknown[]`. |
| **Testing gaps** | No test for `DEBUG=ngcompass:nonexistent` behavior; no test for `DEBUG=ngcompass:cache,ngcompass:scanner` multi-namespace parsing; no test for `enable()` → `disable()` round-trip. |

---

### HS-06 — `packages/core/src/planner/task-builder.ts`

| Field | Value |
|-------|-------|
| **Module/Path** | `packages/core/src/planner/task-builder.ts` |
| **Lines** | 431 |
| **Why it's a hotspot** | Core rule-to-file matching logic; called for every file in every analysis run. Contains positional boolean arguments and type-safety escapes. |
| **Primary risks** | `discoverResources(filePath, true, true, true, true, ...)` — 4 unnamed positional booleans; `resolveAstRequirements` uses `?? ({} as any)` escaping the type system; `shouldApplyRule` and `evaluateRuleApplicability` overlap in intent. |
| **Principles violated** | Intent-Revealing Names, No Magic Values, DRY (dual applicability check) |
| **Suggested refactor direction** | Replace positional booleans in `discoverResources` call with a named options object; give `resolveAstRequirements` a typed return and remove the `any` cast; merge `shouldApplyRule` into `evaluateRuleApplicability`. |
| **Testing gaps** | No property-based test for `shouldApplyRule × FileType` matrix; no test for the `componentGraph` fast-path vs directory-scan slow-path. |

---

## 3. Audit Findings

### F-01 — Type Safety Escapes (`any` Proliferation)

**Severity:** 🔴 High
**Principle:** Intent-Revealing Names, Type Safety, YAGNI
**Files affected:**

| File | Location | Pattern |
|------|----------|---------|
| ~~`analyze.ts`~~ | ~~L51, L138, L151, L179~~ | ~~`config: any`, `configResult.config as any`~~ | ✅ Fixed (TICKET-01) |
| `builder.ts` | L183, L337, L338, L357, L374 | `ReadonlyMap<string, any>`, `applicable: any[]` |
| `task-builder.ts` | L270 | `?? ({} as any)` in `resolveAstRequirements` |
| `cache/context.ts` | L46, L54 | `createAtomicDriver<any>`, `createDiskDriver<any>` |
| `single-pass-engine.ts` | L68, L117 | `ReadonlyArray<any>`, `RuleHandler<any>` |

**Impact:** Type errors in rule metadata, cache payloads, or config shape are silently ignored at compile time and surface as runtime crashes.

**Fix direction:** Replace `config: any` in `analyze.ts` with the exported `NormalizedAnalyzerConfig`. Use `ResolvedRule` in builder functions. Constrain cache generic parameters at driver creation sites.

---

### F-02 — DRY: `clear()` vs `clearType('all')` Duplication

**Severity:** 🔴 High
**Principle:** DRY
**File:** `packages/core/src/cache/context.ts:87-124`

`clear()` (L87–100) and the `'all'` branch of `clearType()` (L113–124) contain identical lists of driver clear calls. Adding a new cache layer (e.g., a future `embeddingDriver`) requires updating both places — the second will routinely be forgotten.

```
// BOTH blocks contain:
sourceDriver.clear();
astL1.clear();
await astL2.clear();
await resultDriver.clear();
await configDriver.clear();
await metaDriver.clear();
await planDriver.clear();
await fileDriver.clear();
await analysisDriver.clear();
```

**Fix direction:** Extract to `clearAllDrivers()` and call it from both sites.

---

### F-03 — DRY: `groupTasksByFile` Duplicated

**Severity:** 🟠 Medium
**Principle:** DRY
**Files:** `packages/core/src/planner/builder.ts:603–616` and `packages/core/src/engine/worker-pool.ts` (confirmed by agent exploration)

The `groupTasksByFile` utility is implemented twice. Any change to grouping logic must be applied in both places.

**Fix direction:** Move to `planner/utils.ts` and import from both.

---

### F-04 — Error Handling Inconsistency

**Severity:** 🔴 High
**Principle:** Error Handling as One Thing, Fail Fast

Three distinct error strategies coexist in the same pipeline:

| File | Strategy | Problem |
|------|----------|---------|
| `analyze.ts:128,134` | `process.exit(1)` inside step helpers | Step helpers know too much about the CLI host |
| `single-pass-engine.ts:92,190` | `console.error(...)` | Unstructured; bypasses `errorCollector`; pollutes output |
| `orchestrator.ts:177–181` | `errorCollector.record(createInfrastructureError(...))` | Correct pattern |
| `builder.ts:133–137` | `return Err(new Error(...))` | Correct pattern |

A rule that crashes takes three possible paths depending on *where* in the pipeline it is caught. The `budgetViolations` array in `PerformanceReport` is populated but no caller currently checks or acts on it — budget enforcement is effectively dead code.

**Fix direction:** Standardise on `errorCollector.record()` for infrastructure errors inside the engine. Reserve `process.exit` for the top-level CLI action handler only. Wire `budgetViolations` to a reporter or to `errorCollector`.

---

### F-05 — Magic Numbers / Values Inline

**Severity:** 🟠 Medium
**Principle:** No Magic Strings/Numbers

| File | Line | Value | Problem |
|------|------|-------|---------|
| `builder.ts` | 377–378 | `10000`, `4` | Parallel task build thresholds — undocumented and untestable |
| `cache/context.ts` | 34 | `200` | AST L1 cache size — should be in `CacheConfig` defaults |
| `console-reporter.ts` | 61 | `160` | `FIXED_WIDTH` inside `buildIndexedSeparator` body |
| ~~`analyze.ts`~~ | ~~161~~ | ~~`'src/**/*.ts'`~~ | ~~Hard-coded default include pattern~~ | ✅ Fixed (TICKET-01) |

---

### F-06 — Positional Boolean Arguments

**Severity:** 🟠 Medium
**Principle:** Intent-Revealing Names, KISS
**File:** `packages/core/src/planner/task-builder.ts:319–326`

```typescript
const discovered = await discoverResources(
    filePath,
    true,   // ← needsTemplate?
    true,   // ← needsStyles?
    true,   // ← needsSpec?
    true,   // ← ???
    context?.directoryCache
);
```

Four adjacent `true` literals — a reader cannot know what each controls without navigating to the `discoverResources` signature.

**Fix direction:** Change `discoverResources` to accept a named options object: `{ template: boolean; styles: boolean; spec: boolean; imports: boolean }`.

---

### ~~F-07 — Logger Namespace Fallback Inversion~~ ✅ Fixed (TICKET-03)

**Severity:** 🔴 High → ✅ Resolved
**Principle:** Fail Fast, Least Astonishment
**File:** `packages/common/src/logger.ts`

~~`return namespaces.size > 0 ? namespaces : 'all'; // ← BUG`~~

`parseNamespaces` now always returns the `Set`. `initializeFromEnv` derives `enabled` from the result. `DEBUG=ngcompass:typo` → zero output. `KNOWN_NAMESPACES` constant added with `satisfies Namespace[]` compile-time guard. `console.warn` emitted on unrecognised tokens.

`_level` parameter (unused, same output for all levels) remains a known limitation tracked under the audit's long-tail items.

---

### F-08 — SRP: `loadConfigurationStep` Does Too Much

**Severity:** 🟠 Medium
**Principle:** SRP
**File:** `packages/cli/src/commands/analyze.ts:108–148`

`loadConfigurationStep` performs:
1. Config resolution (`resolveConfig`)
2. Config validation report rendering
3. Plugin list extraction (with `as any` cast)
4. Plugin loading
5. Timing instrumentation

This is five distinct concerns. Plugin loading in particular is a separate phase that has different error semantics (a failed plugin should not necessarily abort the whole analysis).

---

### F-09 — SRP: `tryLoadPlanFromCache` Does Too Much

**Severity:** 🟠 Medium
**Principle:** SRP
**File:** `packages/core/src/planner/builder.ts:211–301`

One function handles:
1. Global hash calculation
2. Precomputed analysis cache check (early return with hard-coded empty indexes)
3. Plan cache lookup
4. Deserialization
5. Cache corruption recovery (delete + record error)
6. Debug timing output

The hard-coded empty `indexes` object in the precomputed-analysis short-circuit (L231–256) is a known semantic gap — callers that inspect index stats will see all zeros even when real results are returned.

---

### F-10 — `getInfo()` Incomplete Cache Statistics

**Severity:** 🟠 Medium
**Principle:** Fail Fast, Self-Documenting Code
**File:** `packages/core/src/cache/context.ts:128–147`

`getInfo()` tallies size from only 4 of the 8 drivers (`astL1`, `astL2`, `configDriver`, `resultDriver`). The `plans`, `meta`, `files`, and `analysis` drivers are excluded from `totalSize`. The `cache info` CLI subcommand therefore reports an undercount, which will mislead users running `ngcompass cache info` to diagnose disk usage.

---

### F-11 — `console.error` in Performance-Critical Hot Path

**Severity:** 🔴 High
**Principle:** Error Handling as One Thing, No Side Effects
**File:** `packages/core/src/rules/engine/single-pass-engine.ts:92,190`

```typescript
} catch (e) {
    console.error(`Rule ${handler.name} failed on template node:`, e);
}
```

This is inside the innermost loop of the single-pass engine (O(N × R)). Problems:
- Writes to `console.error` directly, bypassing the structured `errorCollector`
- Output format is not structured and cannot be filtered or suppressed
- Swallows the error after printing, so callers have no visibility into which rules failed
- Identical pattern appears in two places (AST loop L189–191 and template dispatch L91–93)

---

### F-12 — `process.exit()` Inside Step Helpers

**Severity:** 🟠 Medium
**Principle:** SRP, Fail Fast
**File:** `packages/cli/src/commands/analyze.ts:128, 134, 170, 205, 234, 265`

Step functions like `loadConfigurationStep`, `discoverFilesStep`, etc. call `process.exit(1)` then `return null`. The `return null` after `process.exit` is unreachable dead code. More importantly, these helpers couple themselves to the CLI process lifetime, making them untestable in isolation and preventing graceful cleanup (e.g., flushing telemetry).

**Fix direction:** Remove `process.exit` from step helpers. Return `null` (or an `Err`) and let the top-level `.action()` handler call `process.exit`.

---

### F-13 — Global Singleton Pattern in Cache and Registry

**Severity:** 🟡 Low
**Principle:** Dependency Inversion, Least Astonishment
**Files:** `cache/context.ts:151–162`, `rules/registry/rule-registry.ts`

Both the `CacheContext` and the global rule registry are module-level singletons. This makes unit tests order-dependent and requires manual teardown. There is no `resetGlobalCache()` or `resetGlobalRegistry()` exported for test isolation.

---

### F-14 — `cachedTasks` Approximation Bug

**Severity:** 🟠 Medium
**Principle:** Accuracy, Self-Documenting Code
**File:** `packages/cli/src/commands/analyze.ts:86`

```typescript
cachedTasks: plan.precomputedAnalysis ? plan.tasks.length : undefined, // Approximation if precomputed
```

When a precomputed analysis is returned, `plan.tasks` is an empty array (`[]` — set in `tryLoadPlanFromCache:233`), so `cachedTasks` reports `0` instead of the real cached count. The summary reporter therefore shows incorrect cache hit counts to the user.

---

### F-15 — `groupFailuresByFile` O(N²) Spread in Reduce

**Severity:** 🟡 Low
**Principle:** Performance, KISS
**File:** `packages/reporters/src/reporters/console-reporter.ts:111–116`

```typescript
return failures.reduce<Map<string, RuleFailure[]>>((map, failure) => {
    const existing = map.get(relativePath) ?? [];
    return map.set(relativePath, [...existing, failure]); // ← O(N) spread per item
}, new Map());
```

The spread `[...existing, failure]` allocates a new array on every iteration. For a file with 100 violations, this allocates 100 arrays. The pattern should use `existing.push(failure)` with `map.set` only when the key is new.

---

## 4. Refactor Backlog

---

### TICKET-01 — Replace `any` types in analyze.ts with `NormalizedAnalyzerConfig` ✅ DONE

**Title:** Refactor `analyze.ts` to use typed config instead of `config: any`
**Scope:** `packages/cli/src/commands/analyze.ts`
**Priority:** 🔴 High
**Status:** ✅ Implemented — `feat_quality` branch, 2026-02-28

**Problem:** `config: any` is passed through `discoverFilesStep`, `resolveRulesStep`, and `buildPlanStep`. Type errors in config shape are invisible at compile time.

**Steps:**
1. Import `NormalizedAnalyzerConfig` from `@ngcompass/common`
2. Change return type of `loadConfigurationStep` to `{ config: NormalizedAnalyzerConfig } | null`
3. Update all downstream step signatures to accept `NormalizedAnalyzerConfig`
4. Remove the `as any` cast when accessing `.plugins` — add `plugins` to the type if missing
5. Replace hard-coded `['src/**/*.ts']` with `DEFAULT_INCLUDE_PATTERNS` from `@ngcompass/common`

**Definition of Done:**
- [x] `config: any` removed from all step function signatures
- [x] `(configResult.config as any).plugins` cast removed — `NormalizedAnalyzerConfig.plugins` accessed directly
- [x] `loadConfigurationStep` returns `{ config: NormalizedAnalyzerConfig } | null` (narrowed, no `undefined` leak)
- [x] `discoverFilesStep` and `resolveRulesStep` param typed as `NormalizedAnalyzerConfig`
- [x] `resolveRulesStep` local reassignment replaced with typed `effectiveConfig` variable
- [x] `'src/**/*.ts'` magic string replaced with `DEFAULT_INCLUDE_PATTERNS` from `@ngcompass/common`
- [x] Pre-existing `saveToCacheStep` `RuleResult[]` mutability error fixed (`readonly RuleResult[]`)
- [x] `pnpm --filter @ngcompass/cli typecheck` passes with zero errors
- [ ] Existing CLI integration tests pass _(no tests exist yet — covered by TP-01)_
- **Note:** Two `as any` casts remain at L80–81 (`reporter.parseErrors` / `reporter.report`). These are a cross-package type alignment issue (`@ngcompass/core` vs `@ngcompass/reporters` `RuleResult`/`ParseError` definitions) outside this ticket's scope.

**Tests:**
- Unit test: `loadConfigurationStep` returns typed result when config is valid
- Unit test: step functions accept `NormalizedAnalyzerConfig` and access `.include` without cast

**Risk/Mitigation:** Low — changes are purely type-level. No runtime behaviour changes. Roll out in a single PR.

---

### TICKET-02 — Move `process.exit` to top-level CLI action handler ✅ DONE

**Title:** Refactor `analyze.ts` step helpers to remove `process.exit` calls
**Scope:** `packages/cli/src/commands/analyze.ts`
**Priority:** 🟠 Medium
**Status:** ✅ Implemented — `feat_quality` branch, 2026-02-28

**Problem:** Step functions call `process.exit(1)` followed by unreachable `return null`. This prevents test isolation and blocks graceful shutdown hooks.

**Steps:**
1. Remove all `process.exit(1)` calls inside step helpers
2. Each helper should return `null` on error (pattern already exists)
3. In the top-level `.action()` handler, check each result — call `process.exit(1)` in one place at the end
4. Add a `finally` block in the top-level handler to flush telemetry before exit

**Definition of Done:**
- [x] All 6 `process.exit(1)` calls removed from step helpers (`loadConfigurationStep` ×2, `discoverFilesStep`, `resolveRulesStep`, `buildPlanStep`, `runAnalysisStep`)
- [x] `process.exit` called exactly **once**, inside the `.action()` handler's `finally` block (L111)
- [x] `let exitCode = 0` introduced; each early-exit guard sets `exitCode = 1` before returning
- [x] `finally` block guarantees `process.exit` fires even after an early `return` from inside `try`
- [x] `catch` block sets `exitCode = 1` instead of calling `process.exit` directly
- [x] `analysis.stats.totalErrors > 0` path sets `exitCode = 1` instead of calling `process.exit`
- [x] TODO comment added for future telemetry flush in the `finally` block
- [x] `pnpm --filter @ngcompass/cli typecheck` passes with zero errors
- [ ] Unit test: `loadConfigurationStep` returns `null` (not `exit`) on invalid config _(covered by TP-01)_
- [ ] Integration test: exit code is 1 when config is missing _(covered by TP-01)_

**Risk/Mitigation:** Low. The user-visible behaviour (exit code 1 on failure, 0 on success) is unchanged.

---

### TICKET-03 — Fix `parseNamespaces` fallback inversion in Logger ✅ DONE

**Title:** Fix Logger namespace fallback: empty set instead of `'all'`
**Scope:** `packages/common/src/logger.ts`
**Priority:** 🔴 High
**Status:** ✅ Implemented — `feat_quality` branch, 2026-02-28

**Problem:** `parseNamespaces` returns `'all'` (enable everything) when no matching namespaces are found. A typo in `DEBUG=ngcompass:typo` silently enables all logging.

**Steps:**
1. Change the final return in `parseNamespaces` from `namespaces.size > 0 ? namespaces : 'all'` to `namespaces` (always return the set)
2. Update `initializeFromEnv` to set `enabled = false` when the set is empty and `debugEnv` is non-empty (user intended a filter but got nothing)
3. Optionally emit a single `console.warn` when an unrecognized namespace is encountered

**Definition of Done:**
- [x] `parseNamespaces` always returns the `Set` — ternary fallback to `'all'` removed (L179)
- [x] `initializeFromEnv` derives `enabled` from `namespaces === 'all' || namespaces.size > 0` — the fragile `debugEnv.includes('ngcompass')` string check is gone (L75)
- [x] `DEBUG=ngcompass:nonexistent` → `enabled=false`, zero output (empty set, size=0)
- [x] `DEBUG=ngcompass:cache` → `enabled=true`, only `cache` namespace logged
- [x] `DEBUG=ngcompass` / `DEBUG=*` / `DEBUG=ngcompass:*` → `enabled=true`, `namespaces='all'`
- [x] `console.warn` emitted once per unrecognised token (avoids self-recursive logging, L170–174)
- [x] `KNOWN_NAMESPACES: ReadonlySet<string>` constant added with `satisfies Namespace[]` compile-time guard (L48–54) — keeps runtime validation in sync with the `Namespace` union type
- [x] `part.replace('ngcompass:', '')` replaced with `part.slice('ngcompass:'.length)` (no regex, O(1))
- [x] `pnpm --filter @ngcompass/common typecheck` passes with zero errors
- [x] `pnpm --filter @ngcompass/cli typecheck` passes with zero errors
- [ ] Unit tests cover all four cases _(covered by TP-05 test plan)_
- **Note:** Two pre-existing `TS6133` errors in `@ngcompass/core` (`worker-pool.ts:12`, `rxjs-require-take-until-destroyed.rule.ts:11`) are unrelated unused-import warnings that existed before this ticket — confirmed via `git diff --name-only`.

**Tests:**
- `parseNamespaces('ngcompass:nonexistent')` → empty set, logger disabled
- `parseNamespaces('ngcompass:cache,ngcompass:scanner')` → set with `['cache', 'scanner']`
- `parseNamespaces('*')` → `'all'`
- `parseNamespaces('ngcompass')` → `'all'`

**Risk/Mitigation:** 🔴 Behaviour change — users relying on the broken fallback will lose debug output. Document in CHANGELOG. Low blast radius since `DEBUG` env is opt-in.

---

### TICKET-04 — Eliminate DRY violation in `CacheContext.clear()` ✅ DONE

**Title:** Refactor `cache/context.ts` to eliminate `clear` / `clearType('all')` duplication
**Scope:** `packages/core/src/cache/context.ts`
**Priority:** 🔴 High
**Status:** ✅ Implemented — `feat_quality` branch, 2026-02-28

**Problem:** `clear()` and `clearType('all')` contain identical driver-clear sequences. New cache layers will routinely be added to one but not the other.

**Steps:**
1. Extract internal `clearAllDrivers()` async arrow function capturing all drivers in scope
2. Call `clearAllDrivers()` from both `clear` and the `'all'` branch of `clearType`
3. Fix `getInfo()` to include all 8 drivers in `totalSize` calculation (currently misses `plans`, `meta`, `files`, `analysis`)
4. Add `resetGlobalCache()` export that sets `globalCache = null`

**Definition of Done:**
- [x] `clear()` and `clearType('all')` delegate to a single shared `clearAllDrivers()` async arrow function
- [x] Adding a new driver requires one change (in `clearAllDrivers`) instead of two
- [x] `getInfo().totalSize` now sums all 8 drivers: `astL1 + astL2 + configDriver + resultDriver + metaDriver + planDriver + fileDriver + analysisDriver`
- [x] `getInfo()` uses `Promise.all([...])` to fetch the 7 async driver stats concurrently
- [x] `resetGlobalCache()` exported — sets `globalCache = null` for test isolation
- [x] `pnpm --filter @ngcompass/core typecheck` passes — only the two pre-existing TS6133 errors (unrelated) remain
- [ ] Unit test: `clearType('all')` clears the `analysis` cache _(covered by TP-02)_
- [ ] Unit test: `getInfo().totalSize` equals sum of all 8 driver sizes _(covered by TP-02)_
- [ ] Unit test: after `resetGlobalCache()`, `getCacheContext()` creates a fresh instance _(covered by TP-02)_

**Tests:**
- Unit test: `clearType('all')` clears the `analysis` cache (was omitted before)
- Unit test: `getInfo().totalSize` equals sum of all 8 driver sizes
- Unit test: after `resetGlobalCache()`, `getCacheContext()` creates a fresh instance

**Risk/Mitigation:** Low. All changes are internal to the context factory.

---

### TICKET-05 — Extract shared `groupTasksByFile` utility

**Title:** Deduplicate `groupTasksByFile` between planner and engine
**Scope:** `packages/core/src/planner/builder.ts`, `packages/core/src/engine/worker-pool.ts`
**Priority:** 🟠 Medium

**Problem:** `groupTasksByFile` is implemented in at least two locations. Divergence would cause silent grouping inconsistencies.

**Steps:**
1. Create `packages/core/src/planner/utils.ts` with the canonical implementation
2. Export `groupTasksByFile` from `packages/core/src/planner/index.ts`
3. Replace both usages with the shared import
4. Delete the duplicate implementations

**Definition of Done:**
- [ ] Single implementation in `planner/utils.ts`
- [ ] Both consumers import from the same source
- [ ] Unit test covers grouping correctness (multiple tasks per file, single task)

**Tests:**
- `groupTasksByFile([...tasks])` → Map where keys are unique file paths
- Tasks for the same file are in the same group
- Tasks for different files are in separate groups

**Risk/Mitigation:** Low. Pure function extraction with no semantics change.

---

### TICKET-06 — Replace `console.error` in single-pass engine with structured error collection

**Title:** Refactor `single-pass-engine.ts` to use `errorCollector` instead of `console.error`
**Scope:** `packages/core/src/rules/engine/single-pass-engine.ts`
**Priority:** 🔴 High

**Problem:** `console.error` in the hot loop produces unstructured output that cannot be filtered, suppressed, or acted on programmatically. Budget violations are tracked but never enforced or surfaced.

**Steps:**
1. Add optional `errorCollector?: InfrastructureErrorCollector` to `runSinglePassAnalysis` options parameter
2. Replace both `console.error` calls with `errorCollector?.record(createInfrastructureError('ParseError', ...))`
3. Extract the timing/dispatch block into a shared `dispatchAndTime(handler, node, context, ...)` function to eliminate DRY violation between the two loops
4. Add a `hasBudgetViolations` boolean flag to `PerformanceReport` for easy conditional checks by callers
5. Document that `budgetViolations` requires CI enforcement in the engine runner

**Definition of Done:**
- [ ] Zero `console.error` calls in `single-pass-engine.ts`
- [ ] A crashing rule is recorded in `errorCollector` and does not prevent other rules from running
- [ ] `dispatchTemplateHandlers` and the main walk share the same dispatch helper
- [ ] `PerformanceReport.hasBudgetViolations` is populated

**Tests:**
- A rule that throws is isolated: other rules still return results
- `errorCollector` receives one entry per crashing rule
- `budgetViolations` is non-empty when traversal exceeds budget
- Template handler dispatch errors are also collected

**Risk/Mitigation:** 🟠 Medium — changes the engine's error output format. Callers that parse stderr will see different output. No functional regression for end users.

---

### TICKET-07 — Replace positional booleans in `discoverResources` call

**Title:** Refactor `task-builder.ts` to use named options in `discoverResources`
**Scope:** `packages/core/src/planner/task-builder.ts`, `packages/core/src/planner/resources.ts`
**Priority:** 🟡 Low

**Problem:** Four adjacent `true` values are unreadable and error-prone to reorder.

**Steps:**
1. Add `DiscoverOptions { template: boolean; styles: boolean; spec: boolean; imports: boolean }` to `resources.ts`
2. Update `discoverResources` signature to accept `DiscoverOptions` instead of positional params
3. Update the single call site in `task-builder.ts`

**Definition of Done:**
- [ ] `discoverResources` signature uses named options
- [ ] TypeScript enforces that all fields are provided
- [ ] No other call sites exist (confirm with grep)

**Tests:**
- Existing resource discovery tests continue to pass
- Property test: `discoverResources({ template: false, ... })` never returns a template

**Risk/Mitigation:** Low. Single call site. Purely mechanical rename.

---

### TICKET-08 — Fix `cachedTasks` counter in `ResultSummary`

**Title:** Fix inaccurate `cachedTasks` count in `analyze.ts` summary
**Scope:** `packages/cli/src/commands/analyze.ts`, `packages/core/src/planner/builder.ts`
**Priority:** 🟠 Medium

**Problem:** When a precomputed analysis is returned, `plan.tasks` is `[]` (empty by design), so `cachedTasks` is always reported as `0`, even though 100% of work was cached.

**Steps:**
1. Add `totalTaskCount?: number` to `ExecutionPlanOutput` — populated during plan build, preserved in the precomputed-analysis short-circuit
2. In `tryLoadPlanFromCache`, set `totalTaskCount` from the full file list length × average rules (or from a stored metadata field)
3. In `analyze.ts`, use `plan.totalTaskCount ?? plan.tasks.length` for `cachedTasks`

**Definition of Done:**
- [ ] `ngcompass analyze` on a fully-cached project reports `cachedTasks > 0` in summary
- [ ] Unit test: precomputed analysis path yields `cachedTasks === totalTasks`

**Tests:**
- Simulate a precomputed analysis hit; assert summary shows `cachedTasks === totalFiles × avgRules`

**Risk/Mitigation:** Low. Only affects UI output.

---

### TICKET-09 — Fix `groupFailuresByFile` O(N²) spread allocation

**Title:** Optimize `groupFailuresByFile` in `console-reporter.ts` to avoid O(N²) array allocation
**Scope:** `packages/reporters/src/reporters/console-reporter.ts`
**Priority:** 🟡 Low

**Problem:** `[...existing, failure]` allocates a new array on every iteration.

**Steps:**
1. Replace the `reduce` body with an imperative `Map.get`/`push`/`set` pattern
2. Keep the function pure (no external state)

**Definition of Done:**
- [ ] `groupFailuresByFile` does not allocate intermediate arrays per failure
- [ ] Output is identical to the previous implementation

**Tests:**
- Property test: grouped results match `failures.filter(f => path.relative(cwd, f.filePath) === key)` for each key
- Benchmark: < 1ms for 1 000 failures (was potentially > 10ms with O(N²))

**Risk/Mitigation:** Negligible. Pure function with identical semantics.

---

## 5. Test Plans for Top-3 Hotspots

### TP-01 — `packages/cli/src/commands/analyze.ts`

**Context:** CLI orchestrator; 7 sequential steps; multiple error exit paths.

| # | Test | Type | Goal |
|---|------|------|------|
| 1 | `loadConfigurationStep` returns `null` when config validation fails; does not call `process.exit` | Unit | Fail Fast isolation |
| 2 | `discoverFilesStep` returns file list when `scan()` resolves | Unit | Happy path |
| 3 | `resolveRulesStep` with `--rule signal-effect-must-be-destroy-scoped` overrides config rules | Unit | `--rule` filter path |
| 4 | Full pipeline: config OK → files found → rules resolved → plan built → analysis runs → exit 0 | Integration | Happy path E2E |
| 5 | Full pipeline: analysis returns errors → `process.exit(1)` called once at top-level | Integration | Error exit |

---

### TP-02 — `packages/core/src/planner/builder.ts`

**Context:** Plan builder with caching, parallel workers, serialization, and cache-corruption recovery.

| # | Test | Type | Goal |
|---|------|------|------|
| 1 | With a valid cache hit, `buildExecutionPlan` returns the deserialized plan without calling `buildAllTasks` | Unit | Cache short-circuit |
| 2 | When deserialization throws, the corrupted key is deleted and a cold rebuild proceeds | Unit | Cache corruption self-heal |
| 3 | `buildAllTasks` uses sequential path when `files.length < 10000` | Unit | Branch decision at threshold |
| 4 | `buildAllTasks` falls back to sequential when `resolveWorkerPath` returns null | Unit | Worker fallback |
| 5 | `groupTasksByFile` produces no duplicate file keys | Unit | Grouping correctness |

---

### TP-03 — `packages/core/src/rules/engine/single-pass-engine.ts`

**Context:** Single-pass AST engine; O(N) traversal; per-rule timing; budget enforcement.

| # | Test | Type | Goal |
|---|------|------|------|
| 1 | A rule that throws during `handle()` does not prevent other rules from returning results | Unit | Rule isolation / Fail Fast |
| 2 | `budgetViolations` is empty for a fast traversal and non-empty when total exceeds `BUDGET_MS_PER_FILE_WITHOUT_TYPES` | Unit | Budget tracking |
| 3 | `resetComponentCacheStats()` is called before each analysis; stats from run N do not bleed into run N+1 | Unit | Side-effect isolation |
| 4 | Template expression handlers receive template nodes; AST-only handlers do not | Unit | Stream dispatch correctness |
| 5 | A rule that produces `Array<RuleFailure>` (not a single failure) has all items collected | Unit | Array-return handling |

---

## 6. Tooling Recommendations

| Category | Tool | Rationale |
|----------|------|-----------|
| **Complexity** | `eslint complexity` rule (max: 10) | `tryLoadPlanFromCache` and `buildAllTasks` already exceed 8; CI gate prevents growth |
| **Duplication** | `jscpd --min-tokens 50` | Would flag `clear()`/`clearType('all')` and `groupTasksByFile` immediately |
| **Dependency boundaries** | `eslint-plugin-boundaries` | Enforce that `@ngcompass/cli` never imports from `@ngcompass/reporters` implementation internals |
| **Dead code** | `ts-prune` | Would surface the unused `_level` parameter pattern in `logger.ts` |
| **Type coverage** | `typescript-strict-plugin` + `@typescript-eslint/no-explicit-any: error` | Prevent new `any` escapes at PR time |
| **Mutation testing** | `Stryker` on `task-builder.ts` and `visitor.ts` | High-value targets: rule-application logic and AST traversal |
| **Property tests** | `fast-check` (already a devDep) | `shouldApplyRule × FileType` matrix; `groupTasksByFile` invariants |

---

## Appendix: Principle Mapping Legend

| Code | Full Name |
|------|-----------|
| DRY | Don't Repeat Yourself |
| KISS | Keep It Simple |
| YAGNI | You Aren't Gonna Need It |
| SRP | Single Responsibility Principle |
| OCP | Open/Closed Principle |
| DIP | Dependency Inversion Principle |
| ISP | Interface Segregation Principle |
| LoD | Law of Demeter |
| CQS | Command-Query Separation |
| SOC | Separation of Concerns |
| FF | Fail Fast |
| BSR | Boy Scout Rule |

---

*Report generated from source analysis on branch `feat_quality`. Re-run after each sprint to track debt reduction.*
