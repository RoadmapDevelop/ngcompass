# @ngcompass/engine — Package Evaluation Report

**Date:** 2026-03-05
**Package:** `packages/engine`
**Total source:** 14 files · 1,935 LOC (excl. package.json)
**Evaluator:** Architecture & code-quality audit

---

## 1. Score: **7.5 / 10**

| Dimension | Score | Note |
|-----------|-------|------|
| Architecture | 9/10 | Excellent O(N) single-pass + O(1) dispatch model |
| Performance design | 9/10 | Budgets, memoization, worker pool, pLimit |
| Type safety | 5/10 | Several `any` casts and a poorly-typed public API surface |
| Error handling | 6/10 | Two silent-failure patterns mask real errors |
| Completeness | 5/10 | CSS style analysis is a no-op stub |
| Testability | 4/10 | No unit tests; `--passWithNoTests` CI flag |
| Code hygiene | 7/10 | Minor DRY violations; one dead constant |

**Overall: 7.5 — Production-ready architecture, pre-release code quality.**
The engine is architecturally stronger than any comparable Angular-specific tool, but several type-safety and correctness issues must be resolved before calling the analysis results reliable.

---

## 2. Competitive Landscape

| Tool | Traversal | Angular-specific | Performance budgets | Worker threads | CSS analysis |
|------|-----------|-----------------|--------------------|--------------|-|
| **ngcompass/engine** | O(N) single-pass | ✓ | ✓ enforced | ✓ dynamic pool | ✗ stub |
| angular-eslint | O(N) per rule | ✓ | ✗ | ✗ | ✗ |
| ESLint (generic) | O(N) per rule | ✗ | ✗ | ✗ | ✗ |
| oxlint | O(N) single-pass | ✗ | ✗ | ✓ | ✗ |
| SonarQube (cloud) | Multi-pass | ✓ | ✗ | cloud-side | partial |

**Key differentiators:**
- **Single-pass O(N) + O(1) dispatch** — every node visited exactly once; rules pay only the node-type filter cost, not a full traversal.
- **Worker pool with graceful fallback** — automatic parallelisation above a configurable threshold; transparent fallback to sequential execution if the worker script is unavailable.
- **Memoized analysis context** — file reads, TypeScript programs, and HTML parses are computed once per file per run, even if multiple rules need the same resource.
- **Performance budget enforcement** — 2ms/5ms p95 per-file limits with instrumented per-rule timing.

---

## 3. Architecture Strengths

### 3.1 O(N) Single-Pass with O(1) Dispatch (`single-pass-engine.ts`, `visitor-registry.ts`)

`buildVisitorMap()` creates a `Map<nodeType, VisitorEntry[]>` at startup.
During traversal each node gets a single `Map.get()` lookup — **no switch, no iteration, no branching per rule**.
Template handlers (HTML/CSS) run in a separate post-walk phase to keep the primary walk free of different-parser overhead.

TypeScript exhaustiveness checking on `StreamType` ensures adding a new stream type without a `STREAM_TO_NODE_TYPE` entry produces a compile error, not a silent miss.

### 3.2 Dependency Injection Anti-Cycle (`rule-executor.ts`)

The engine ↔ rules circular dependency is broken cleanly:
- `engine` defines `BatchRuleExecutorFn` (a function signature)
- `rules` calls `configureRuleExecutor()` once at startup
- `engine` uses the injected function — no top-level import of `@ngcompass/rules`

This enables the engine to remain a standalone package usable in isolation or with custom rule sets.

### 3.3 Memoised Analysis Context (`analysis-context.ts`)

Four independent Map-backed caches (file text, TS program, HTML parse, CSS parse) return the same `Promise<T>` for repeated requests. Cache misses trigger computation and immediately memoize the Promise — concurrent callers for the same file coalesce onto one I/O operation.

### 3.4 Dynamic Worker Pool (`worker-pool.ts`)

- Task count > threshold → distributed across `Math.max(MIN_WORKERS, cpus().length)` worker threads.
- File groups are kept intact (Longest Processing Time partitioning).
- Graceful fallback to local `pLimit` execution if worker script is not found.
- Settled-flag pattern prevents double-resolution on worker exit.

### 3.5 Centralized Constants (`constants.ts`)

All magic numbers (`WORKER_POOL_TASK_THRESHOLD`, `LOCAL_CONCURRENCY_LIMIT`, `MIN_WORKER_COUNT`, `SPINNER_FRAME_INTERVAL_MS`) live in one file — easy to tune without hunting through source.

### 3.6 Instrumented Performance (`single-pass-engine.ts`)

Per-rule invocation times tracked with `performance.now()`. Budget violations collected (not thrown) and returned in `PerformanceReport`. Enables CI ratcheting and rule-author feedback without breaking analysis.

---

## 4. Issues & Gaps

### 4.1 P0 — Pre-MVP Blockers

#### ENGINE-001 — `any` casts in `analysis-stats.ts`
```typescript
// analysis-stats.ts line 22, 24
const totalErrors = results.flatMap(r => r.failures).filter((f: any) => isErrorSeverity(f.severity)).length;
const totalWarnings = results.flatMap(r => r.failures).filter((f: any) => isWarningSeverity(f.severity)).length;
```
`RuleFailure` is fully typed; the `any` casts are unnecessary and suppress type-checker feedback. Should be:
```typescript
.filter((f: RuleFailure) => isErrorSeverity(f.severity))
```

#### ENGINE-002 — `RuleContext.template` / `.style` typed as structural `any`-equivalent
```typescript
// common/src/types.ts
readonly template?: { readonly type: string; readonly start?: number; readonly end?: number };
readonly style?: { readonly type: string; readonly start?: number; readonly end?: number };
```
These inline structural types are documented as intentional (to avoid circular dep), but they expose none of the AST node fields that rules actually use (children, attributes, value, etc.). Rule authors must `as any`-cast to access real node properties. The correct fix is to either:
- Export a minimal `AstNode` interface from `@ngcompass/common`, or
- Publish a separate `@ngcompass/ast-types` stub package with no runtime code.

#### ENGINE-003 — `getStyle()` is a non-functional stub
```typescript
// analysis-context.ts line 83
getStyle: (_filePath: string) => Promise.resolve(undefined),
```
CSS/SCSS style analysis is completely absent. Every style file returns `undefined`. Rules that request style AST (`requires.cssAst`) will silently receive nothing. This should be either:
- Implemented (call `@ngcompass/ast`'s CSS parser), or
- Explicitly gated with a runtime guard that returns `Err(new Error('CSS analysis not yet supported'))`.

---

### 4.2 P1 — Sprint 1

#### ENGINE-004 — `readFileSafe` silently swallows I/O errors
```typescript
// analysis-context.ts line 102-103
} catch {
    return ''; // Returns empty string on any read failure
}
```
An unreadable file (permissions, deletion mid-scan) makes the engine silently analyze an empty string. The rule sees valid-but-empty TypeScript and produces no failures — a false negative. Should propagate the error via `Result<string>` or re-throw so the `InfrastructureErrorCollector` can surface it.

#### ENGINE-005 — `isRuleResult()` cache guard is too permissive
```typescript
// orchestrator.ts lines 36-40
const isRuleResult = (val: unknown): val is RuleResult =>
    typeof val === 'object' && val !== null && 'ruleName' in val && 'failures' in val;
```
This guard accepts any object with `ruleName` and `failures` keys. A corrupted cache entry (e.g. `{ ruleName: 42, failures: "oops" }`) passes the check. Should validate:
- `typeof val.ruleName === 'string'`
- `Array.isArray(val.failures)`
- Each failure has the expected `filePath`, `line`, `column`, `severity` fields.

#### ENGINE-006 — Budget constants duplicated in `single-pass-engine.ts`
```typescript
// single-pass-engine.ts lines 37-38
const BUDGET_MS_PER_FILE_WITHOUT_TYPES = 2;
const BUDGET_MS_PER_FILE_WITH_TYPES = 5;
```
These are not in `constants.ts`, so they are out of sync with the centralized file. Any change to timing budgets must be made in two places. Import from `constants.ts` or move there.

#### ENGINE-007 — `MIN_WORKER_COUNT` exported but never read
```typescript
// constants.ts line 13
export const MIN_WORKER_COUNT = 2;
```
`worker-pool.ts` hard-codes `Math.max(2, os.cpus().length)` instead of importing this constant. Either use it or remove it.

---

### 4.3 P2 — Sprint 2

#### ENGINE-008 — Duplicate interface definitions in `worker-pool.ts`
```typescript
// worker-pool.ts lines 12-13 (approximate)
interface WorkerData { ... }   // Duplicates @ngcompass/rules shape
interface WorkerResult { ... } // Duplicates @ngcompass/rules shape
```
These exist to break the circular import. The correct fix is to move them to `@ngcompass/common` so both packages import from a shared location. This is strictly better than the current duplication.

#### ENGINE-009 — Zero unit test coverage
`package.json` runs `vitest --passWithNoTests`, meaning CI never fails due to missing tests. Files most in need of coverage:
- `runner.ts` — batching, severity override, error collection
- `single-pass-engine.ts` — dispatch, budget violation detection
- `orchestrator.ts` — routing logic, cache short-circuit
- `worker-pool.ts` — local fallback path, task distribution

#### ENGINE-010 — Cache deserialization has no schema validation
When a cached `AnalysisResult` is retrieved from the L1 analysis cache, it is cast directly to the result type without structural validation. A schema version mismatch after a tool upgrade could produce corrupted results without any error surfacing. Add a lightweight validation step (similar to the plan cache's `deserializePlan` approach).

---

### 4.4 P3 — Sprint 3

#### ENGINE-011 — Performance budget assertions not wired to CI
Budget violations are collected in `PerformanceReport.budgetViolations` and `hasBudgetViolations`, but nothing in the test/CI pipeline asserts on them. Adding a CI job that runs against a synthetic fixture and fails if `hasBudgetViolations === true` would create a regression safety net.

#### ENGINE-012 — Cache hit rate not surfaced in analysis output
`retrieveSkippedResults()` gathers skipped-task results from cache but the hit rate is not included in `AnalysisResult.stats`. CLI consumers have no visibility into how much work was avoided. Add `cacheHitRate` (0–1 float) to the stats object.

#### ENGINE-013 — Implement CSS / SCSS style analysis
`getStyle()` is a permanent stub. The `@ngcompass/ast` package reportedly has a CSS parser. Wiring it into `analysis-context.ts` would unlock the `template-no-object-literal-binding`, `template-no-array-literal-binding`, and any future style rules that require CSS AST.

---

## 5. Priority Ticket Summary

### Pre-MVP (P0) — Fix before first release

| ID | Title | File | Effort |
|----|-------|------|--------|
| ENGINE-001 | Replace `any` casts in `analysis-stats.ts` | `analysis-stats.ts` | XS |
| ENGINE-002 | Properly type `RuleContext.template` & `.style` | `common/src/types.ts` | S |
| ENGINE-003 | Replace `getStyle()` stub with typed gate or real implementation | `analysis-context.ts` | M |

### Sprint 1 (P1) — Before production

| ID | Title | File | Effort |
|----|-------|------|--------|
| ENGINE-004 | Surface I/O errors from `readFileSafe` via Result/collector | `analysis-context.ts` | S |
| ENGINE-005 | Harden `isRuleResult()` cache guard with full field validation | `orchestrator.ts` | S |
| ENGINE-006 | Import budget constants from `constants.ts`; remove duplicates | `single-pass-engine.ts` | XS |
| ENGINE-007 | Use or remove `MIN_WORKER_COUNT` | `constants.ts`, `worker-pool.ts` | XS |

### Sprint 2 (P2) — Quality improvements

| ID | Title | File | Effort |
|----|-------|------|--------|
| ENGINE-008 | Move shared worker types to `@ngcompass/common` | `worker-pool.ts`, `common` | S |
| ENGINE-009 | Add unit test suite for runner, orchestrator, engine | `*.test.ts` (new) | L |
| ENGINE-010 | Add schema validation for analysis cache deserialization | `orchestrator.ts` | M |

### Sprint 3 (P3) — Long-term

| ID | Title | File | Effort |
|----|-------|------|--------|
| ENGINE-011 | Wire performance budget assertions to CI | `single-pass-engine.ts`, CI | M |
| ENGINE-012 | Expose `cacheHitRate` in `AnalysisResult.stats` | `orchestrator.ts`, `types.ts` | S |
| ENGINE-013 | Implement CSS/SCSS analysis in `getStyle()` | `analysis-context.ts` | L |

---

## 6. Execution Flow (Reference Diagram)

```
buildExecutionPlan() → ExecutionPlanOutput
        │
        ▼
  runAnalysis(plan, options)          ← orchestrator.ts
        │
        ├─ plan.precomputedAnalysis?  → return immediately (L1 cache hit)
        │
        ├─ tasks.length > 150?
        │     ├─ YES → runAnalysisParallel()   ← worker-pool.ts
        │     │         └─ Worker threads × N
        │     │             └─ executeBatchedTasks()   ← runner.ts
        │     │
        │     └─ NO  → executeTasksLocally()   ← orchestrator.ts helper
        │               └─ pLimit(4) × file groups
        │                   └─ executeBatchedTasks()   ← runner.ts
        │
        ▼
  executeBatchedTasks(tasks, ctx)
        │
        ├─ Group by options key (stable serialize)
        ├─ Build RuleContext (RuleContextFactory.build)
        │     ├─ readFile()     (memoized)
        │     ├─ getProgram()   (memoized Oxc parse)
        │     └─ getTemplate()  (memoized HTML parse)
        │
        └─ getConfiguredExecutor()(ruleNames, ctx)
              └─ runSinglePassAnalysis()        ← single-pass-engine.ts
                    ├─ buildVisitorMap()        ← visitor-registry.ts
                    ├─ Walk AST once (O(N))
                    │     └─ Map.get(nodeType) → O(1) dispatch
                    └─ dispatchTemplateHandlers()
```

---

## 7. MVP Readiness Assessment

**Is `@ngcompass/engine` MVP-ready?** — **Conditionally YES**

The core execution loop is correct and performant. The three P0 blockers (ENGINE-001, ENGINE-002, ENGINE-003) do not prevent analysis from running, but they degrade reliability:
- `any` casts bypass compile-time safety in the most critical module (stats aggregation).
- The template/style type gap forces rule authors into unsafe casts.
- The `getStyle()` stub means any style-related rule is silently dead.

Fix the P0 tickets and the engine is shipable. The P1 tickets should follow immediately in Sprint 1 — especially ENGINE-004 (silent I/O failures) and ENGINE-005 (cache guard), both of which could cause incorrect analysis results under adverse conditions.
