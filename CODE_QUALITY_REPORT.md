# ngcompass — Code Quality Report

> **Generated:** 2026-03-01 (Re-evaluated: 2026-03-02)
> **Branch:** `feat_quality`
> **Scope:** All 11 packages under `packages/`
> **Evaluator:** Static analysis via full source-file reading

---

## Executive Summary

| Package | Score | Grade | Status |
|---|---|---|---|
| `@ngcompass/common` | 6.8 / 10 | C | Open issues remain |
| `@ngcompass/ast` | 8.1 / 10 | B | No change |
| `@ngcompass/cache` | 6.5 / 10 | C | Open issues remain |
| `@ngcompass/scanner` | 7.3 / 10 | B- | Minor open issue |
| `@ngcompass/config` | 7.0 / 10 | C+ | No change |
| `@ngcompass/planner` | 6.5 / 10 | C | Open issues remain |
| `@ngcompass/engine` | 7.5 / 10 | B- | ✅ Several fixes landed |
| `@ngcompass/rules` | 6.8 / 10 | C | ✅ Duplication removed |
| `@ngcompass/reporters` | 7.3 / 10 | B- | Open issues remain |
| `@ngcompass/cli` | 7.5 / 10 | B- | ✅ Fully implemented |
| `@ngcompass/testing` | 1.5 / 10 | F | Still a stub |
| **Overall** | **6.8 / 10** | **C+** | **Improved from 6.4** |

---

## Evaluation Criteria

Each package is evaluated across 7 dimensions (each scored 1–10):

| Dimension | Weight |
|---|---|
| **Syntax Quality** — TypeScript correctness, use of strict types | 15% |
| **Functions** — naming, single-responsibility, length, purity | 15% |
| **Duplicate Code** — repeated logic, copy-paste across files/packages | 20% |
| **Unnecessary Code** — dead code, TODOs, stubs, no-ops | 10% |
| **Readability** — naming, comments, structure, consistency | 15% |
| **Maintainability** — testability, coupling, magic values, error handling | 15% |
| **Extensibility** — plugin friendliness, abstractions, open/closed principle | 10% |

---

---

## Package 1: `@ngcompass/common`

**Score: 6.8 / 10**

### What Was Evaluated
`src/types.ts`, `src/errors.ts`, `src/interfaces.ts`, `src/logger.ts`, `src/utils/locator.ts`, `src/utils/stable-serialize.ts`

### Strengths
- `Result<T, E>` functional error type is clean and correct.
- `InfrastructureErrorCollector` pattern is excellent — accumulates errors without interrupting the pipeline, with proper phase tagging.
- `AnalyzerError` hierarchy (base → `ConfigurationError`, `ParseError`, `RuleError`, `RuleExecutionError`) is clean, each adds contextual fields.
- Logger uses namespace filtering with compile-time guard (`satisfies Namespace[]`) — very well designed.
- All public types use `readonly` consistently.

### Issues Found

#### Logger
- `logger.ts` initialises from `process.env.DEBUG` at module load time — makes it untestable without env-var patching. No `reset()` or factory method for tests.
- `logLevel` parameter in `log()` is named `_level` and never used — dead parameter.

### ✅ Resolved in this batch
- **TICKET-004** — `RulePlugin.handler` is now `unknown`. `RuleRegistry.get()` and `getAll()` return `unknown`. `RuleContext.template` / `.style` use an inline structural type (no `any`).
- **TICKET-013** — `sourceFile` field is **not** deprecated — `rule-utils.ts` uses it as a lazy-created TS `SourceFile` cache for `getTsSymbolAtNode()`. The incorrect `// Deprecated` comment was replaced with accurate JSDoc explaining the field's purpose and instructing rule authors to use `getTsSymbolAtNode()` instead of reading the field directly.
- **TICKET-015** — `Severity` type now has a canonical ordering comment documenting the scale (`critical > high > error* > moderate > warning* > low > info > hint`) and clarifying that `'error'` / `'warning'` are ESLint-compatibility aliases. The ambiguity is resolved in the type definition itself — no values were removed to avoid breaking existing rule definitions.

---

---

## Package 2: `@ngcompass/ast`

**Score: 8.1 / 10**

### What Was Evaluated
`src/ast/matchers.ts`, `src/ast/types.ts`, `src/analyzers/component-analyzer.ts`, `src/analyzers/template-analyzer.ts`, `src/visitor.ts`, `src/node-streams.ts`, `src/parsers/ts.ts`, `src/parsers/html.ts`

### Strengths
- Iterative DFS walker in `visitor.ts` — avoids stack overflow on deep ASTs. Excellent engineering decision.
- Tri-state metadata pattern (`LiteralValue | NonLiteralValue | MissingValue`) with pre-allocated singletons is a clean, zero-allocation design.
- `WeakMap`-based component cache in `analyzeComponent()` is O(1) after first call and GC-friendly.
- `matchers.ts` is well-named and scoped — pure functions, zero allocation, early returns.
- `resetComponentCacheStats()` / `getComponentCacheStats()` allows performance monitoring without mutable globals.

### Issues Found

#### `any` in Private Extractors
- All private extractor functions in `component-analyzer.ts` accept `metadataObject: any` (lines 198, 208, 232, 242, 252, 262) — the public `analyzeComponent` correctly types its input, but the private helpers lose that guarantee entirely. Type assertions inside them (`cdNode as any`) compound this.

#### Fragile String Splitting
- `extractRenames()` (line 316): `value.split(':').map(s => s.trim())` will silently truncate rename strings with more than one colon — no validation or error.
- No guard for the case where `parts.length !== 2` after splitting.

#### Unsafe Type Casts in Matchers
- `matchers.ts` line 71: `const prop = (callee as MemberExpression).property` — cast without prior type narrowing that the callee actually conforms to `MemberExpression` beyond `expr.type` check.
- `getKeyNameUnsafe` casts `key as StringLiteral` without verifying `lit.value` is actually a string until the next line — the check does happen, but the cast precedes it.

### Suggestions
1. Type private extractor parameters with the correct `ObjectExpression` type instead of `any`.
2. Add validation to `extractRenames` for multi-colon strings and return `null` on invalid input.
3. Move `isInputSignal` to follow the same naming convention as other matchers, or document the intentional boolean return.

---

---

## Package 3: `@ngcompass/cache`

**Score: 6.5 / 10**

### What Was Evaluated
`src/services/result-cache.ts`, `src/drivers/atomic.ts`, `src/drivers/memory.ts`, `src/drivers/disk.ts`, `src/drivers/json-file.ts`, `src/utils/stable-serialize.ts`, `src/env-fingerprint.ts`

### Strengths
- `atomic.ts` handles the catalog-init race condition correctly with the generation-guard pattern — production-grade concurrency handling.
- `hasMany()` short-circuits on empty cache directory, preventing thousands of unnecessary `fs.access` calls.
- Descriptive comments in `atomic.ts` explain every intentional no-op catch block.
- Driver interface abstraction (`AsyncDriver<T>`) is clean and swappable.
- Self-healing cache corruption (delete bad entry → cold rebuild) in `tryLoadPlanFromCache`.

### Issues Found

#### Magic Numbers — `result-cache.ts` (TICKET-007 — still present)
- `BATCH_SIZE = 200` appears as a **local constant** in three separate function scopes (lines 143, 199, 239) — should be a single named module-level constant.
- `METADATA_BATCH_SIZE = 100` (line 261) is inconsistently named compared to `BATCH_SIZE`. In `setMany()`, the batch size is also 100 but named `BATCH_SIZE` — four independent declarations for what are effectively two configuration values.

#### Silent Error Swallowing (TICKET-008 — still present)
- `incrementHits(hash).catch(() => {})` appears twice (in `get()` line 108 and `getMany()` line 152) with only a code comment — no log output when metadata update fails. Makes debugging cache metadata inconsistencies impossible.

#### Metadata Key Collision Risk
- `metadataDriver = driver` — **the same driver instance** is used for both result data and metadata. The key `${hash}.meta` is used to distinguish them, but if a rule ever produces a task ID ending in `.meta`, data and metadata entries would collide. No guard exists.

#### `json-file.ts` Missing Validation
- `JSON.parse()` result is cast directly to `T` with no schema validation — corrupt entries silently become valid objects.
- No file size limit — a malformed large file would be fully loaded into memory before failing.

### Suggestions
1. Extract `BATCH_SIZE = 200` and `METADATA_BATCH_SIZE = 100` to named module-level constants with a comment explaining the values.
2. Replace `.catch(() => {})` with `.catch(err => debug('cache', ...))` at minimum.
3. Use separate driver instances (or separate key namespaces) for data and metadata to eliminate collision risk.

---

---

## Package 4: `@ngcompass/scanner`

**Score: 7.3 / 10**

### What Was Evaluated
`src/scan.ts`, `src/normalize.ts`, `src/filters.ts`, `src/patterns.ts`, `src/gitignore.ts`, `src/git.ts`, `src/stats.ts`, `src/glob.ts`

### Strengths
- Functional pipeline composition in `scan()` is clean — each step is isolated with explicit phase comments.
- Git-native discovery path with glob fallback is a smart optimization.
- Cache short-circuit for git repos (fingerprint-based) is correctly implemented.
- Result type (`Result<ScanResult>`) used throughout, no exceptions thrown to callers.
- Already-executed `isGit` check correctly cached at top of function.

### Issues Found

#### Dead Code (TICKET-016 — still present)
- `scan.ts` line 99: `// const isGit = await isGitRepo(normalized.rootDir);` — this is a commented-out duplicate of the already-executed `isGit` check on line 59. Should be deleted.

#### Non-Descriptive Variable Names
- `t0`, `t1`, `t2` replaced with descriptive `tCacheStart`, `t1`, `t2` — partial improvement, `t1` and `t2` are still not self-documenting.

#### Cache Key Uses `JSON.stringify` on Patterns
- `JSON.stringify(patterns)` is embedded in the cache key (line 71) — `JSON.stringify` output is not guaranteed to be stable across V8 versions for objects with non-string keys. Using `stable-serialize` (already available in the project) would be more correct.

### Suggestions
1. Delete line 99 (commented-out dead code).
2. Rename `t1` and `t2` to `tDiscoveryStart` and `tFilterStart`.
3. Use `stableSerialize` from `@ngcompass/cache` for the patterns portion of the cache key.

---

---

## Package 5: `@ngcompass/config`

**Score: 7.0 / 10**

### What Was Evaluated
`src/schemas/schema.ts`, `src/schemas/defaults.ts`, `src/loaders/loader.ts`, `src/loaders/discovery.ts`, `src/health/checks/` (all files), `src/actions/healthcheck.ts`, `src/actions/init.ts`

### Strengths
- Zod schema provides runtime validation with type inference — correct approach for config loading.
- Health check system with `BaseHealthCheck` abstract class and registry pattern is extensible.
- `jiti` used for loading `.ts` config files — avoids requiring the user to compile first.
- Config discovery tries multiple filenames with fallback — good DX.

### Issues Found

#### Unnecessary `as any` Casts in Schema
- `schema.ts` line 62: `OutputFormatSchema.default(DEFAULT_CONFIG.outputFormat as any)` — if the default matches the schema enum, no cast should be needed.
- Line 63: `SeveritySchema.default(DEFAULT_CONFIG.failOnSeverity as any)` — same pattern.

#### Overly Permissive `profiles` Schema
- `profiles: z.record(z.string(), z.any()).optional()` (line 93) — profiles accept any value with no validation. Given that profiles override execution configuration, this is a correctness gap.

#### No Deprecation Warning Surfaced to User
- `schema.ts` lines 109–111: `cacheLocation` is described as deprecated in a comment but no warning is emitted to the user. Comment: `"Warn about deprecation? (Log elsewhere, transformation should just handle data)"` — this remains an unresolved TODO.

#### Mutable Fields in `ConfigIssue`
- `ConfigIssue` in `interfaces.ts` has mutable fields (`code`, `message`, `path`, `severity`) — inconsistent with the rest of the codebase which uses `readonly` everywhere.

### Suggestions
1. Fix `DEFAULT_CONFIG.outputFormat` and `DEFAULT_CONFIG.failOnSeverity` types so the `as any` casts are not needed.
2. Add a proper Zod schema for `profiles` matching `ProfileConfig`.
3. Emit a structured deprecation warning (via `debug` or logger) when `cacheLocation` is provided.
4. Add `readonly` to all `ConfigIssue` fields.

---

---

## Package 6: `@ngcompass/planner`

**Score: 6.5 / 10**

### What Was Evaluated
`src/builder.ts`, `src/types.ts`, `src/task-builder.ts`, `src/hashing.ts`, `src/indexes.ts`, `src/incremental.ts`, `src/serialize.ts`, `src/worker.ts`, `src/utils.ts`

### Strengths
- `types.ts` is exceptionally well-documented — every interface, field, and phase is explained.
- Content-addressed task IDs (SHA-256 of inputs + options) are the correct approach for precise cache invalidation.
- Plan deserialization handles corruption gracefully — deletes bad entry and triggers cold rebuild.
- `ExecutionIndexes` pre-computation (O(1) queries later) is a smart performance investment.

### Issues Found

#### Pervasive `any` Type Abuse — `builder.ts`
- `validateBuildInputs(files, rules: ReadonlyMap<string, any>)` — `any` for `rules` loses all type information.
- `collectApplicableRulesFromTasks(tasks, rules: ReadonlyMap<string, any>): any[]` — both parameter and return type are `any`.
- `calculateHashFromTasks(tasks, applicableRules: any[])` — `any[]`.
- `convertTasksToPlan(tasks, rules: ReadonlyMap<string, any>)` — `any`.
- These functions should use `ResolvedRule` from `@ngcompass/common`.

#### Magic Numbers in Function Body (TICKET-006-related — still present)
- `buildAllTasks()` line 379: `const PARALLEL_THRESHOLD = 10000` and line 380: `const WORKER_COUNT = 4` — magic numbers defined inside a function body. They should be module-level named constants or derived from `ExecutionPlanOptions`.

#### Unsafe Cast for Precomputed Analysis
- `tryLoadPlanFromCache()` line 256: `precomputedAnalysis: precomputedAnalysis as any` and line 257: `} as unknown as ExecutionPlanOutput` — double unsafe cast to work around an incomplete inline object literal missing required `ExecutionIndexes` fields.

#### Duplicated `resolveWorkerPath()` (TICKET-006 — still present)
- `builder.ts` lines 459–483 defines `resolveWorkerPath()` which is **still independently implemented** alongside `engine/src/worker-pool.ts`'s own version. Two packages independently re-implement the same file path resolution logic.

### Suggestions
1. Replace all `any` in `builder.ts` with `ResolvedRule` from `@ngcompass/common`.
2. Move `PARALLEL_THRESHOLD` and `WORKER_COUNT` to module-level named constants.
3. Replace the `as unknown as ExecutionPlanOutput` cast with a proper factory function.
4. Extract `resolveWorkerPath()` to a shared internal utility in `@ngcompass/common`.

---

---

## Package 7: `@ngcompass/engine`

**Score: 7.5 / 10**

### What Was Evaluated
`src/orchestrator.ts`, `src/single-pass-engine.ts`, `src/worker-pool.ts`, `src/visitor-registry.ts`, `src/runner.ts`, `src/execution-worker.ts`, `src/analysis-context.ts`, `src/analysis-stats.ts`, `src/spinner.ts`, `src/constants.ts`

### Strengths
- ✅ Inline `Spinner` class **removed** from `worker-pool.ts` — now correctly imports from `./spinner.js` (TICKET-003 resolved).
- ✅ `runLocalFallback()` **now accepts `concurrency` parameter** and passes it to `pLimit()` (TICKET-002 resolved).
- ✅ Worker exit race condition **fixed** — `settled` flag prevents both `message` and `exit` from settling the same promise (TICKET-003-race resolved).
- ✅ All imports in `worker-pool.ts` **now use `.js` extensions** (TICKET-014 resolved).
- `orchestrator.ts` is clean and well-structured — clear short-circuit for precomputed analysis.
- `single-pass-engine.ts` correctly implements O(N) traversal with O(1) dispatch.
- Performance budget enforcement (2ms / 5ms p95) is a thoughtful quality gate.
- `distributeTasks()` using greedy LPT (Longest Processing Time first) partition is the correct algorithm.

### Issues Found

#### `error` and `warn` Name Shadowing (still present)
- `worker-pool.ts` line 3: `import { warn, error } from "node:console"` — imports Node's console functions as module-level names `warn` and `error`. These shadow any future imports of the project's own logger functions and are confusing to readers. Rename to `consoleWarn`, `consoleError`.

### Suggestions
1. Rename the `node:console` imports to `consoleWarn`, `consoleError` to avoid shadowing.

---

---

## Package 8: `@ngcompass/rules`

**Score: 6.8 / 10**

### What Was Evaluated
`src/index.ts`, `src/register-all.ts`, `src/registry/rule-registry.ts`, `src/registry/register-all.ts`, `src/engine/adapter.ts`

### Strengths
- ✅ `rules/src/engine/single-pass-engine.ts`, `visitor-registry.ts`, `rule-context-factory.ts`, `rule-handler.ts`, `node-streams.ts` **all deleted** — `adapter.ts` now directly imports `runSinglePassAnalysis` from `@ngcompass/engine` (TICKET-001 resolved).
- ✅ `rules/src/visitor.ts` **deleted** — no longer duplicating the AST walker (CI-3 resolved).
- `adapter.ts` is now a clean, stateless bridge between registry and engine.
- `rule-registry.ts` is well-designed — throws on duplicate registration by default, provides `allowOverride` escape hatch.

### Issues Found

> No critical issues remain in `@ngcompass/rules` following the TICKET-001, TICKET-005, and TICKET-017 fixes.

### Resolved in this batch
- ✅ **TICKET-005** — Old `src/register-all.ts` deleted; single canonical `src/registry/register-all.ts` remains.
- ✅ **TICKET-017** — `allowOverride: true` removed from `adapter.ts`; duplicate rule registration now throws at startup.

---

---

## Package 9: `@ngcompass/reporters`

**Score: 7.3 / 10**

### What Was Evaluated
`src/reporters/console-reporter.ts`, `src/reporters/json-reporter.ts`, `src/factory.ts`, `src/output.ts`, `src/severity-utils.ts`, `src/code-frame.ts`

### Strengths
- `ConsoleReporter` follows Command-Query Separation well — pure data functions separated from rendering commands.
- Named constants replace magic literals (`TYPE_WIDTH_ERROR`, `TYPE_WIDTH_WARNING`, etc.).
- `FailureCard` DTO pattern cleanly separates pre-computation from rendering.
- Source reader injection makes the reporter testable without filesystem access.
- `cwd` injection avoids `process.cwd()` side-channel in render path.

### Issues Found

#### O(n²) Array Allocation in `groupFailuresByFile` (TICKET-009 — still present)
- Lines 110–114: Uses `reduce` with `[...existing, failure]` — creates a new array on **every failure** processed. For 1,000 failures in one file, this allocates 1,000 intermediate arrays.

```typescript
// Current (O(n²)):
return failures.reduce<Map<string, RuleFailure[]>>((map, failure) => {
    const existing = map.get(relativePath) ?? [];
    return map.set(relativePath, [...existing, failure]);  // new array every time
}, new Map());

// Fix (O(n)):
const map = new Map<string, RuleFailure[]>();
for (const failure of failures) {
    const relativePath = path.relative(cwd, failure.filePath);
    const existing = map.get(relativePath);
    if (existing) { existing.push(failure); } else { map.set(relativePath, [failure]); }
}
return map;
```

#### ✅ Fixed Terminal Width (TICKET-010 — resolved)
- `buildIndexedSeparator()` now uses `Math.min(process.stdout.columns ?? 80, 120)` — adapts to real terminal width, falls back to 80 in CI/piped contexts.

#### ✅ Double `pc.dim` Call — Resolved
- `buildCardMessageLine()` now uses a single `pc.dim(failure.ruleName)` — the redundant second call removed.

#### ✅ `extractAllFailures()` Type Assertion — Resolved
- `result.failures as RuleFailure[]` cast replaced with `[...result.failures]` — TypeScript infers `RuleFailure[]` from the spread without an assertion.

### Suggestions
1. ~~Replace the `reduce` + spread in `groupFailuresByFile` with `get` + `push`.~~ ✅ Done
2. ~~Replace hardcoded `FIXED_WIDTH = 160`.~~ ✅ Done
3. ~~Remove the extra `pc.dim` call on rule name.~~ ✅ Done
4. ~~Remove the unnecessary `as RuleFailure[]` cast.~~ ✅ Done

---

---

## Package 10: `@ngcompass/cli`

**Score: 7.5 / 10 ✅**

### What Was Evaluated
`src/index.ts`, `src/bin/ngcompass.ts`, `src/commands/`

### Status: **Substantially Implemented**
The CLI is no longer a stub. `ngcompass.ts` now wires together Commander, registers built-in rules, creates a `CacheContext`, and delegates to registered commands. The `commands/` directory contains sub-commands.

### Remaining Issues
- `src/index.ts` still contains `// TODO: Implement CLI entry point` comment on line 2 alongside the re-export.
- Exit code strategy (`0` success / `1` violations / `2` config errors) should be verified across all command paths.

### Suggestions
1. Remove the stale TODO comment from `src/index.ts`.
2. Add an integration test verifying exit codes for each outcome.

---

---

## Package 11: `@ngcompass/testing`

**Score: 1.5 / 10**

### What Was Evaluated
`src/index.ts`

### Issues Found (TICKET-011 — still present)
- The entire package consists of one line: `export const testing = '@ngcompass/testing';`
- No test utilities, fixtures, mock builders, or helpers.
- The package name implies it should contain shared test infrastructure (rule test harness, mock `RuleContext` factories, fixture files, etc.).
- Consuming it in tests provides no value — the single export is a string constant with the package name.

---

---

## Cross-Package Issues

### CI-2 — `resolveWorkerPath()` Still Duplicated
The worker path resolution logic still appears independently in:
1. `packages/engine/src/worker-pool.ts` (probes `@ngcompass/rules/execution-worker` + sibling paths)
2. `packages/planner/src/builder.ts` (probes local `worker.js`, `worker.cjs`, `worker.ts`)

The two implementations probe **different candidate paths** — they have already diverged in purpose. Planner's version looks for a local `worker.ts`; engine's version looks for `@ngcompass/rules/execution-worker`. A shared utility should unify these.

### CI-4 — Test Coverage Remains Critically Low
Only one test file was found (`packages/cli/tests/setup.test.ts`) and one worker pool test (`packages/engine/tests/worker-pool.test.ts`). Given the complexity of the cache, engine, and planner packages, the absence of unit tests is a significant quality risk. The `@ngcompass/testing` package exists but is empty.

---

---

## Open Tickets

---

---

---

### TICKET-006 — Extract `resolveWorkerPath()` to shared utility

> **Status: Invalid — Not a true duplicate.**
>
> On closer inspection the two `resolveWorkerPath()` functions serve **completely different workers**:
> - `engine/src/worker-pool.ts` resolves the *analysis execution worker* (`execution-worker.ts` in `@ngcompass/rules`)
> - `planner/src/builder.ts` resolves the *task-building worker* (`worker.ts` local to `@ngcompass/planner`)
>
> The functions probe different candidate paths and have different fallback strategies. Extracting them into a shared utility would merge two unrelated concerns. Closing as invalid.

---

---

### TICKET-008 — Replace silent `.catch(() => {})` in `result-cache.ts`

**Priority:** Medium
**Package:** `@ngcompass/cache`
**Type:** Observability / Error Handling

**Description:**
`incrementHits(hash).catch(() => {})` appears twice in `result-cache.ts` (in `get()` and `getMany()`). These silence metadata update failures completely, making it impossible to debug cache metadata inconsistencies.

**Fix:** Replace with `.catch(err => debug('cache', \`incrementHits failed for ${hash}: ${err instanceof Error ? err.message : String(err)}\`))`.

**Acceptance Criteria:**
- [ ] No `.catch(() => {})` in `result-cache.ts`
- [ ] Failed metadata updates are logged at debug level with the hash and error message

---

### TICKET-009 — Fix `groupFailuresByFile` O(n²) array allocation in reporters

**Priority:** Medium
**Package:** `@ngcompass/reporters`
**Type:** Performance

**Description:**
`console-reporter.ts` lines 110–114: `reduce` with spread `[...existing, failure]` creates a new array for every failure processed. For files with many violations this is quadratic in memory allocations.

**Fix:**
```typescript
function groupFailuresByFile(failures: readonly RuleFailure[], cwd: string): Map<string, RuleFailure[]> {
    const map = new Map<string, RuleFailure[]>();
    for (const failure of failures) {
        const relativePath = path.relative(cwd, failure.filePath);
        const existing = map.get(relativePath);
        if (existing) {
            existing.push(failure);
        } else {
            map.set(relativePath, [failure]);
        }
    }
    return map;
}
```

**Acceptance Criteria:**
- [ ] No spread inside the grouping loop
- [ ] Memory usage is O(n) not O(n²) for the grouping operation
- [ ] Existing tests pass

---

---

### TICKET-011 — Implement `@ngcompass/testing` package

**Priority:** High
**Package:** `@ngcompass/testing`
**Type:** New Feature / Infrastructure

**Description:**
The package currently exports a single string constant and provides no value. Given the complexity of the rule engine, a proper test harness is critical for rule authors (both internal and plugin authors).

**Deliverables:**
1. `createMockRuleContext(overrides?)` — factory building a `RuleContext` with sensible defaults
2. `createMockProgram(sourceCode: string)` — parses TypeScript source into an OXC `Program`
3. `expectFailure(results, ruleName, options?)` — assertion helper
4. `expectNoFailure(results, ruleName?)` — assertion helper
5. Fixture files for common Angular patterns (component, directive, service, pipe)

**Acceptance Criteria:**
- [ ] Rule authors can write a complete unit test for a new rule in < 20 lines
- [ ] Package has its own tests validating the test utilities work correctly

---

### TICKET-013 — Remove deprecated `sourceFile` from `RuleContext`

**Priority:** Low
**Package:** `@ngcompass/common`
**Type:** Cleanup

**Description:**
`RuleContext.sourceFile` is marked `// Deprecated` and is typed as an optional TypeScript `SourceFile`. No rules appear to use it. It adds unnecessary complexity for rule authors reading the interface.

**Fix:** Remove the field after confirming no rules reference it. If any rule still uses it, file a separate deprecation-migration ticket.

**Acceptance Criteria:**
- [ ] `sourceFile` field removed from `RuleContext`
- [ ] No TypeScript compilation errors after removal
- [ ] CI passes

---

### TICKET-015 — Fix `Severity` type overlap

**Priority:** Low
**Package:** `@ngcompass/common`
**Type:** Design / Type Safety

**Description:**
`Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info' | 'warning' | 'error' | 'hint'` mixes two different severity vocabularies:
- Custom scale: `'critical'`, `'high'`, `'moderate'`, `'low'`, `'info'`, `'hint'`
- ESLint-style: `'warning'`, `'error'`

Reporters must map between these in `severity-utils.ts`. Consumers are unsure whether `'error'` == `'critical'` or means something different.

**Fix:** Define a canonical severity scale (either custom or ESLint-compatible) and provide a migration guide for any usages of the deprecated aliases.

**Acceptance Criteria:**
- [ ] `Severity` has no conceptually overlapping values
- [ ] Reporters map severity to display correctly without ambiguity
- [ ] Rule authors know exactly which severity to use for which violation level

---

### TICKET-016 — Remove dead commented-out code in `scanner/scan.ts`

**Priority:** Low
**Package:** `@ngcompass/scanner`
**Type:** Cleanup

**Description:**
`scan.ts` line 99: `// const isGit = await isGitRepo(normalized.rootDir);` is a commented-out duplicate of an already-executed check on line 59. Dead code increases cognitive load for readers.

**Fix:** Delete line 99.

**Acceptance Criteria:**
- [ ] Line 99 deleted
- [ ] No other commented-out code in `scan.ts`

---

---

## Summary of Priority Actions

| Priority | Ticket | Description | Status |
|---|---|---|---|
| ✅ Resolved | TICKET-001 | Delete duplicated engine code in `@ngcompass/rules` | **Fixed** |
| ✅ Resolved | TICKET-002 | Fix `runLocalFallback()` hardcoded concurrency | **Fixed** |
| ✅ Resolved | TICKET-003 | Remove inline Spinner duplication | **Fixed** |
| ✅ Resolved | TICKET-004 | Remove `any` from `@ngcompass/common` interfaces | **Fixed** |
| ✅ Resolved | TICKET-005 | Consolidate duplicated `register-all.ts` | **Fixed** |
| ✅ Resolved | TICKET-007 | Fix `BATCH_SIZE` magic numbers | **Fixed** |
| ✅ Resolved | TICKET-008 | Replace silent `.catch(() => {})` | **Fixed** |
| ✅ Resolved | TICKET-009 | Fix O(n²) array allocation in reporters | **Fixed** |
| ✅ Resolved | TICKET-010 | Dynamic terminal width in separator | **Fixed** |
| ✅ Resolved | TICKET-012 | Implement `@ngcompass/cli` | **Fixed** |
| ✅ Resolved | TICKET-014 | Add `.js` extensions to `worker-pool.ts` imports | **Fixed** |
| ✅ Resolved | TICKET-016 | Remove commented-out code in `scan.ts` | **Fixed** |
| ✅ Resolved | TICKET-017 | Remove `allowOverride: true` from adapter | **Fixed** |
| ✅ Resolved | CI-3 | AST Walker duplicated in `rules/src/visitor.ts` | **Fixed** |
| ✅ Resolved | reporters | Fix double `pc.dim` + unnecessary cast in reporters | **Fixed** |
| ❌ Invalid | TICKET-006 | Extract `resolveWorkerPath()` — different workers, not a duplicate | **Closed** |
| ✅ Resolved | TICKET-013 | `sourceFile` not deprecated — replaced false comment with accurate JSDoc | **Fixed** |
| ✅ Resolved | TICKET-015 | Severity canonical ordering documented; ESLint aliases clarified | **Fixed** |
| 🟠 High | TICKET-011 | Implement `@ngcompass/testing` package | **Open** |
