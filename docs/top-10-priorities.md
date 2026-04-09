# ngcompass — Top 10 Priorities

> **Cross-referenced against actual codebase, March 2026.**
> Issues marked ✅ RESOLVED have been removed. Only active items appear here.

---

## How priorities were scored

Each item is ranked on three axes:

| Axis | Weight |
|------|--------|
| **Blocks v1 release** (CI is red, users get wrong output) | 40% |
| **Impact on users** (affects correctness, performance, DX) | 35% |
> **Effort** (days of work, solo developer) | 25%

---

## #1 — Fix the 15 still-failing test files (CI is red)

**Type:** Blocker | **Effort:** 1–2 days

The full test suite is at **49 failing tests across 15 files**. Nothing else matters if CI is red when you ship.

**Broken files and root causes:**

| File | Root Cause |
|------|-----------|
| `packages/planner/tests/indexes.test.ts` | `severity: 'moderate'` used in `makeTask()` — invalid `RuleSeverity` |
| `packages/planner/tests/serialize.test.ts` | Same + invalid `tasksBySeverityLevel` keys (`low`, `high`, `critical`) |
| `packages/config/tests/config-core.spec.ts` | Assertion mismatch after config pipeline refactor |
| `packages/config/tests/extends-validation.spec.ts` | Same |
| `packages/reporters/tests/console-reporter.spec.ts` | Expects fix recommendation format that changed |
| `packages/reporters/tests/json-reporter.spec.ts` | Uses `critical` severity which doesn't exist in `RuleSeverity` |
| `packages/scanner/tests/scan.test.ts` | `vi.mocked().mockResolvedValueOnce` API incompatibility in mock setup |
| `packages/cli/tests/bin/ngcompass.test.ts` | `run()` calls `process.exit(1)` on unhandled rejection — needs `vi.mock` guard |
| `packages/testing/tests/e2e/**` | Integration tests import `@ngcompass/config` which requires a built dist |

**Fix strategy:** Planner tests need `severity: 'warn'` in fixtures. Reporters tests need `RuleSeverity`-valid fixture data. Scanner mock needs correct Vitest API (`vi.mock` factory pattern). CLI test needs `process.exit` mocked.

---

## #2 — Wire existing rules to ProjectContext (CTX-008)

**Type:** Core value | **Effort:** 3–4 days

CTX-001 through CTX-004 were fully implemented — import graph, reverse graph, NgModule map, standalone component set, component↔template cross-reference are all pre-computed every run. **Zero existing rules consume any of this data.**

The infrastructure is live and costs CPU time on every analysis. Without rules using it, users pay the build cost with no benefit.

**Immediate upgrade candidates (highest false-positive reduction):**

| Rule | What to add | Benefit |
|------|------------|---------|
| `rxjs-prefer-to-signal-for-template-state` | Only flag if the observable property is actually bound in the template (`crossRef.templateReferences`) | Eliminates false positives on private streams |
| `rxjs-no-subscribe-in-component` | Skip if subscription is in a service injected from outside (`importGraph`) | Reduces noise in delegation patterns |
| `prefer-on-push` | Group results by NgModule, report "3/5 components in SharedModule missing OnPush" | Makes output actionable |
| `template-no-call-expression` | Skip known-safe pure helper calls verified via `crossRef.publicMembers` | Reduces false positives on pipe-like methods |

**Acceptance criteria:** At least 3 rules upgraded. False positive count drops measurably on a real Angular project.

---

## #3 — Per-rule isolation tests for all 29 rules

**Type:** Quality / correctness | **Effort:** 3–5 days

Current state: **9 test files, one per category.** Each file runs a handful of happy-path checks against multiple rules. There are zero negative-case tests (code that must NOT trigger a rule) and zero line/column position tests.

This is the highest accuracy risk for v1. A rule silently matching the wrong pattern will ship and generate user complaints that are hard to triage.

**Required for each of the 29 rules:**
1. At least one test that triggers the rule — verifies correct `filePath`, `line`, `column`
2. At least one test with code that looks similar but must NOT trigger (false-positive guard)
3. One test with an empty file / edge-case input (crash guard)

**Start with highest-complexity rules:** `rxjs-avoid-behaviorsubject-for-local-state`, `signal-prefer-model`, `rxjs-no-nested-subscribe`, `prefer-inject`.

---

## #4 — Config package test coverage (3 tests / 24 source files)

**Type:** Quality / user trust | **Effort:** 2 days

Config is the first thing every user touches (`ngcompass.config.json`). It has a `0.125` test-to-source ratio — the worst in the codebase. A parsing or validation bug here silently disables entire rule categories with no error message.

**Missing test scenarios:**
- Circular `extends` chains (`a extends b, b extends a`)
- Missing file in `extends` array
- Unknown rule ID in `rules` object (should warn, not throw)
- Per-file override merging (does `overrides[0]` correctly override base `rules`?)
- Invalid severity value (`rules: { 'prefer-on-push': 'critical' }`) — should be caught
- Empty config file `{}`

---

## #5 — CTX-005: Post-Analysis Aggregation Rules

**Type:** Capability / differentiator | **Effort:** 3–4 days

This is the feature that separates ngcompass from every other Angular linter. No existing tool (ESLint, angular-eslint, Nx) can run rules that see all files simultaneously and report project-level patterns.

**What it unlocks immediately** (using already-built `ProjectContext.importGraph`):
- `project-no-circular-dependencies` — 30% of Angular enterprise projects have at least one import cycle
- `project-no-orphan-components` — components not declared in any NgModule or standalone imports array
- `project-consistent-change-detection` — flag modules where only some components use OnPush

**Implementation surface:** Add `PostAnalysisRule` interface + a post-analysis dispatch loop in `orchestrator.ts` after the per-file phase completes. The `ProjectContext` is already available. New rules receive `(results: RuleResult[], project: ProjectContext)` and return `RuleFailure[]`.

---

## #6 — `StreamType.ClassMember` (CTX-010)

**Type:** Architecture / code quality | **Effort:** 1 day

Three rules (`rxjs-avoid-behaviorsubject-for-local-state`, `rxjs-avoid-subject-as-event-bus`, `rxjs-prefer-to-signal-for-template-state`) manually iterate `class.body.body` inside their handlers. This is:
- Duplicated traversal logic the engine already does
- Invisible to the visitor registry (can't be counted, profiled, or skipped)
- A pattern all v2 reactivity rules will copy if not fixed now

**Fix:** Add `StreamType.ClassMember` to `visitor-registry.ts` — dispatch individual `PropertyDefinition` and `MethodDefinition` nodes with their parent class as context. Refactor the three rules to receive one member at a time instead of iterating themselves.

**Side effect:** Makes writing field-level rules trivial for v2.

---

## #7 — CTX-011: Confidence Scoring on Rule Failures

**Type:** Differentiator / trust | **Effort:** 1 day

Every failure today is reported with equal weight. But `rxjs-no-subscribe-in-component` without TypeChecker is a pattern match — it will false-positive on `customClass.subscribe()`. A TypeChecker-verified failure is categorically different.

Adding `confidence: 'high' | 'medium' | 'low'` to `RuleFailure` (optional field, zero breaking change) enables:
- Users to route low-confidence findings to a separate triage queue
- `--min-confidence medium` CLI flag for CI gates
- Console reporter to render `[!]` / `[?]` / `[~]` prefixes

**This is a differentiator.** No other linter exposes confidence. Teams dealing with 300+ findings on a large codebase need a triage signal beyond severity.

---

## #8 — Auto-fix infrastructure (market table blocker)

**Type:** Market readiness | **Effort:** 4–5 days

Every major market comparison (ESLint, Biome, Prettier) shows `--fix` support as a baseline expectation. The market-readiness evaluation listed this as a **critical gap for v1 adoption**.

**Minimal viable auto-fix (v1 scope):**
- Add optional `fix?: { description: string; replacement: string }` to `RuleFailure`
- Add `--fix` flag to CLI `analyze` command
- Apply fixes in-memory, write changed files
- Start with 5 mechanical rules: `template-prefer-control-flow`, `signal-prefer-input-signal`, `signal-prefer-output-function`, `spec-no-focused-test`, `template-no-async-pipe-duplication`

These 5 rules have deterministic, safe transformations. No TypeChecker needed for the fix.

---

## #9 — CTX-009: Cache the ProjectContext between runs

**Type:** Performance | **Effort:** 2–3 days

`ProjectContext` is rebuilt from scratch every run: `ts.createProgram()` + import graph walk + NgModule scan. On a 2,000-file project this adds **200–400ms before a single rule executes**.

For a tool users want to run on every save (pre-commit, IDE integration), that latency is a dealbreaker.

**Implementation:**
- Compute `globalHash = hash(sorted file paths + content hashes of all .ts files)`
- Store serialized `ProjectContext` in the existing `@ngcompass/cache` disk layer under `globalHash`
- On next run: compare hash → cache hit returns in < 5ms
- Invalidate: file added/removed/renamed forces full recompute; content-only change only invalidates that file's import edges

**Prerequisite for CTX-012 (watch mode).**

---

## #10 — Stale documentation creates incorrect mental model

**Type:** Maintainability / team clarity | **Effort:** 4 hours

Several docs contain numbers that are now wrong, creating confusion about what is actually done vs. what remains:

| Document | Stale Claim | Actual |
|----------|-------------|--------|
| `rules-evaluation-report.md` | "20 registered rules" | 29 rules |
| `rules-evaluation-report.md` | "severity taxonomy inconsistent (error vs critical)" | `RuleSeverity = 'warn' \| 'error' \| 'off'` — only 3 values, never was inconsistent |
| `rules-roadmap.md` | References 19-rule baseline | 29 rules |
| `testing-coverage-evaluation.md` | "60–70 failing tests" | 49 failing tests (was never 60–70) |
| `testing-coverage-evaluation.md` | "untracked test files" in engine/tests/ | Files exist and run in CI |
| `architecture-evaluation.md` | "type-aware concurrency hard-coded to 1" | Fixed — now `effectiveMaxWorkers` |
| `architecture-evaluation.md` | "no evict() / LRU cache" | Fixed — LRU + explicit evict() |
| `engine-evaluation-report.md` | "getStyle() is a non-functional stub" | Fixed — `parseCss()` is wired |

**Action:** Update each doc in one pass. Replace wrong numbers, mark resolved items. Takes a few hours but prevents future confusion about what's been built.

---

## Summary

| # | Priority | Type | Effort | Blocks v1? |
|---|----------|------|--------|-----------|
| 1 | Fix 49 failing tests | Blocker | 2d | **Yes** |
| 2 | Wire rules to ProjectContext (CTX-008) | Core value | 3–4d | No |
| 3 | Per-rule isolation tests (29 rules) | Quality | 3–5d | No |
| 4 | Config package test coverage | Quality | 2d | No |
| 5 | Post-analysis rules (CTX-005) | Capability | 3–4d | No |
| 6 | ClassMember stream type (CTX-010) | Architecture | 1d | No |
| 7 | Confidence scoring (CTX-011) | Differentiator | 1d | No |
| 8 | Auto-fix infrastructure | Market readiness | 4–5d | No |
| 9 | Cache ProjectContext (CTX-009) | Performance | 2–3d | No |
| 10 | Stale documentation cleanup | Clarity | 4h | No |

**v1 ship criteria:** Priority #1 must be green. Priorities #3 and #4 should be at least partially addressed. Everything else is post-v1 roadmap material.
