# ngcompass — Architecture Status Report (Current State)

> **Date:** 2026-02-28
> **Auditor:** Automated structural review
> **Scope:** Full monorepo — 11 packages (Post-Q1 Fixes)
> **Prior document:** [`ARCH_STATUS_2026-Q1.md`](./ARCH_STATUS_2026-Q1.md)

---

## 1. Executive Summary

This report serves as an update to the Q1 2026 Architecture Status Report following a dedicated remediation phase. The monorepo has seen significant improvements, particularly regarding CI/CD automation, build system consistency, and engine safety.

Out of the 13 backlog tickets spanning CI pipelines, type-safety, engine resilience, and build processes, 8 critical tickets were fully resolved.

### What Changed Since the Last Report:
- **CI/CD Resurrected:** The broken and divergent CI pipelines (`ci.yml`, `test.yml`) have been successfully merged into a single, unified Turbo-powered workflow running on `main` and `develop`. This successfully gates deployments and ensures regressions are caught early.
- **Build Configurations Unified:** All 11 packages have natively adopted the shared `tsup.config.ts` factory, eliminating configuration drift and unlocking robust, consistent multi-format outputs (`cjs`, `esm`, `dts`) via SWC.
- **Engine Resilience Hardened:** The engine hot-loop no longer leaks unguarded `console.error` logs. Instead, it utilizes a structured `InfrastructureErrorCollector` mechanism which captures failing rules explicitly.
- **Type-Safety Re-engaged:** The critical ESLint type-safety rules (e.g., `no-explicit-any`, `no-floating-promises`) were bumped from `off` to `warn`, setting up a clear path to fully enforcing strict types.
- **Shared Utilities Extracted:** Duplicated logic like `groupTasksByFile` was appropriately relocated to `@ngcompass/planner/src/utils.ts`.

---

## 2. Updated Risk Registry

Ranked by **Impact × Likelihood** (I = impact 1–5, L = likelihood 1–5, Score = I × L). Most high-priority risks have now been completely neutralized.

| Rank | Finding | I | L | Score | Status |
|------|---------|---|---|-------|--------|
| 1 | **N-04**: `@ngcompass/testing` is still a stub | 3 | 4 | **12** | 🟠 Medium — Open |
| 2 | **AF-07**: Rule test harness missing | 2 | 4 | **8** | 🟡 Low — Open |
| 3 | **Rule Coverage Gaps**: Missing `prefer-signal-outputs`, `no-inner-html`, etc. | 2 | 3 | **6** | 🟡 Low — Open |
| 4 | **AF-13**: Promote ESLint type-safety warnings to errors | 1 | 4 | **4** | 🟡 Low — Open |

**Resolved in this iteration:**
- **AF-01**: CI never fires on `main` (✅ Fixed)
- **AF-02**: pnpm v8 vs pnpm@10 lockfile mismatch (✅ Fixed)
- **AF-03**: Missing `check-coverage.js` script (✅ Fixed / Cleaned)
- **AF-15**: Overlapping workflows (no unified CI) (✅ Fixed)
- **AF-12**: No Turbo in CI (✅ Fixed)
- **AF-14**: tsup.config.ts factory unused (✅ Fixed)
- **N-01**: Phantom `@ngcompass/engine` in config package (✅ Fixed)
- **N-02**: Worker file not in exports map (✅ Fixed)
- **N-03**: `console.error` in engine hot loop (✅ Fixed)
- **N-05**: groupTasksByFile duplicated (✅ Fixed)

---

## 3. Current Strengths Analysis

### Package Architecture & Hygiene
- **Strict Single Responsibility:** Every package does exactly one thing. Dependencies strictly flow downwards to Foundation, bypassing cross-layer cyclic dependencies.
- **Shared Build Tooling:** The introduction of the `createConfig` pattern from the root `tsup.config.ts` combined with `pnpm catalog:` has completely standardized build outputs. A change in one library cascades effectively to all 11 packages instantly.
- **Topological Scaling:** Dependencies like `@ngcompass/reporters` cleanly build without triggering phantom dependencies, leading to ultra-fast incremental builds via Turbo.

### Confidence via CI/CD
- **Unified Pipeline:** We now run a standardized CI pipeline that executes matrix builds (Node 18.x, 20.x, 22.x) with aggressive caching. Tests, types, and automated checks gate PRs successfully.

---

## 4. Current Weaknesses Analysis

### ❌ The `@ngcompass/testing` Stub
The single largest weakness left in the system is the testing infrastructure. Developing new rules still requires manual, duplicated setup of AST test harnesses in each rule's spec file. Providing `createTestRule`, `RuleTestHarness`, and `createMockCacheContext` from a unified testing package remains critical for scaling to 50+ rules securely.

### ⚠️ Incomplete Rule Set coverage
Key framework upgrades like `prefer-signal-outputs` and security concerns like `no-inner-html` are lacking implementation.

### ⚠️ Warn-Only ESLint Target
While ESLint type rules were enabled, they exist only as warnings. The codebase is not fully forced to adhere to strict typing for instances like float-promises.

---

## 5. Summary Scorecard (Star System)

A detailed 10-star rating system benchmarking the existing codebase architecture.

| Dimension | Score | Rating | Analysis |
|-----------|-------|--------|----------|
| **Package Architecture** | **9/10** | ⭐⭐⭐⭐⭐⭐⭐⭐⭐⬛ | Exceptional separation of concerns; no god-packages. |
| **Dependency Hygiene** | **9/10** | ⭐⭐⭐⭐⭐⭐⭐⭐⭐⬛ | Flawless dependency hierarchy (`pnpm catalog`, explicit peer deps). |
| **Build System** | **9/10** | ⭐⭐⭐⭐⭐⭐⭐⭐⭐⬛ | Shared `tsup` configurations, highly optimized ESBuild/SWC integrations, fine-grained Turborepo tasks. |
| **Boundary Enforcement** | **8/10** | ⭐⭐⭐⭐⭐⭐⭐⭐⬛⬛ | Zero cyclic dependencies. Boundaries heavily fortified down to the AST parsing layer. |
| **CI/CD & Automation** | **9/10** | ⭐⭐⭐⭐⭐⭐⭐⭐⭐⬛ | Matrix-tested CI integrated tightly with Turbo caching and robust node managers. |
| **ESLint Safety Net** | **6/10** | ⭐⭐⭐⭐⭐⭐⬛⬛⬛⬛ | Foundational plugins enabled, but strict-type rules are currently set to `warn` instead of `error`. |
| **Rule Coverage** | **6/10** | ⭐⭐⭐⭐⭐⭐⬛⬛⬛⬛ | Healthy migration-related core rules, but lacking a few modern/structural rule coverages. |
| **Test Infrastructure** | **4/10** | ⭐⭐⭐⭐⬛⬛⬛⬛⬛⬛ | Stubbed `@ngcompass/testing` package; rule developers presently duplicate harness code. |

**Overall Architecture Score:** **60 / 80**  (Current Status: Highly Robust, Execution-Ready)
