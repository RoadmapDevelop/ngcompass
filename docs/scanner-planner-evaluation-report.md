# ngcompass Scanner & Planner Packages — Evaluation Report

**Date:** 2026-03-05
**Packages:** `@ngcompass/scanner` · `@ngcompass/planner`
**Scanner LOC:** ~1 061 · **Planner LOC:** ~3 519

---

## 1. Overall Scores

| Package | Score | Verdict |
|---|---|---|
| **Scanner** | **7.5 / 10** | ✅ MVP-Ready with minor gaps |
| **Planner** | **7.0 / 10** | ⚠️ MVP-Ready but carries technical debt |
| **Integration (combined)** | **7.0 / 10** | No monorepo/angular.json awareness; no end-to-end progress |

---

## 2. Scanner — Deep Evaluation

### 2.1 Architecture Overview

```
scan()
  ├─ normalizeOptions()          pure, applies defaults
  ├─ expandPatterns()            pure, forward-slash normalisation
  ├─ access check (rootDir)      async I/O guard
  ├─ isGitRepo()                 spawns git rev-parse
  ├─ tryLoadFromCache()          fingerprint-keyed
  ├─ discoverFiles()
  │   ├─ Git path: git ls-files  spawn (no 10 MB exec limit)
  │   └─ Glob path: tinyglobby
  │       └─ filterByGlob()      minimatch post-filter
  ├─ applyFilters()              gitignore + deduplicate
  ├─ saveToCache()
  ├─ calculateStats()            Promise.allSettled per-file stat
  └─ Ok(ScanResult)
```

### 2.2 Dimension Scores

| Dimension | Score | Notes |
|---|---|---|
| Correctness | 9/10 | Pure functions, Result types, no silent failures |
| Performance | 8/10 | git ls-files is 10× faster than glob; streaming spawn |
| Caching | 7/10 | Fingerprints work but `getDirectoryFingerprint` is too weak |
| Error handling | 9/10 | Every I/O returns Result<T>; graceful fallback to glob |
| Extensibility | 5/10 | Hard-coded defaults; no hooks; no angular.json awareness |
| Test coverage | 7/10 | Core logic tested; integration path not verified end-to-end |
| Documentation | 9/10 | Clear JSDoc on every public function |

---

### 2.3 What Is Good

#### Git-First Discovery (`git.ts`)
`git ls-files -c -o --exclude-standard` via `spawn` (not `exec`) sidesteps the Node.js 10 MB buffer ceiling. For a 200 000-file monorepo this is 10–20× faster than glob and respects `.gitignore` natively. The graceful fallback to tinyglobby means the tool works on non-Git directories without configuration.

#### Fingerprint-Based Cache Invalidation
Git repos: `HEAD-{.git/index mtime}`. This is precise — any staged change bumps the index mtime, any commit updates HEAD. False positives (stale cache hits) are essentially impossible in normal development workflows.

#### Pure Functional Core
`filters.ts`, `patterns.ts`, `normalize.ts`, and `stats.ts` are entirely side-effect free. Every transformation is a pure function over immutable types. This makes testing trivial and the code easy to reason about.

#### Result<T> Error Handling
No `throw` in any public function. Every fallible operation returns `Ok(data) | Err(error)`. Callers are forced to handle both paths at compile time.

---

### 2.4 What Is Missing / Needs Improvement

#### SCAN-001 · `getDirectoryFingerprint` Uses mtime Only
**File:** `packages/scanner/src/git.ts`

For non-Git directories the fingerprint is `dir-{mtime}` of the root directory only. This is weak: adding a file inside a deeply nested subdirectory does not necessarily update the root mtime on all OS/filesystem combinations (Linux `ext4` only updates the direct parent). Result: stale cache hits in non-Git workspaces.

**Fix:** Hash `{mtime}-{size}-{count}` of immediate children, or walk one extra level.

---

#### SCAN-002 · No `tsconfig.json` / `angular.json` Integration
The scanner always applies its own include/exclude patterns. Angular projects define their file sets in `tsconfig.json` (`include`/`exclude`/`files`) and `angular.json` (`projects.*.architect.build.options.tsConfig`). Ignoring these leads to scanning test files, build artefacts, and generated files that Angular itself excludes.

**Fix:** Add an optional `tsConfigPath` option; read `include`/`exclude` from it and merge with user patterns.

---

#### SCAN-003 · Only Root `.gitignore` Is Read
`gitignore.ts` loads a single `.gitignore` from `rootDir`. Git itself reads `.gitignore` at every directory level (plus `~/.gitignore_global` and `.git/info/exclude`). Large monorepos with per-package `.gitignore` files will have files incorrectly included.

**Fix:** Walk the directory tree and merge `.gitignore` files using the `ignore` library's `add()` method. This is the same approach used by ESLint's `FlatESLint`.

---

#### SCAN-004 · No Monorepo / Workspace Awareness
There is no concept of an `angular.json` workspace, Nx `project.json`, or pnpm workspace. In a monorepo the user must manually specify `rootDir` per-project. The scanner treats the entire tree as one flat file set.

**Fix:** Accept an optional `workspaceFile` ('angular.json' / 'nx.json') and derive per-project scan roots from it.

---

#### SCAN-005 · Hard-Coded Default Patterns Miss Styles
Default `include` is `['**/*.ts', '**/*.html']`. Style files (`.css`, `.scss`, `.sass`, `.less`) are not included by default. Rules that inspect inline styles or template-style co-location cannot receive them.

**Fix:** Change default to `['**/*.ts', '**/*.html', '**/*.scss', '**/*.css', '**/*.sass', '**/*.less']`.

---

#### SCAN-006 · No Progress Reporting API
For large codebases (10 000+ files) the `scan()` call is a black box — no progress events, no streaming partial results. CLI users see nothing while the scan runs.

**Fix:** Add an optional `onProgress(phase, count)` callback to `ScanOptions`.

---

#### SCAN-007 · `calculateTotalSize` Has No Concurrency Limit
`stats.ts` fires `fs.stat()` on every file simultaneously with `Promise.allSettled`. On a 50 000-file project this opens 50 000 file descriptors concurrently, which exceeds the OS default limit (`ulimit -n` is typically 1024–4096).

**Fix:** Batch with `p-limit(128)` (already a workspace dependency in planner).

---

### 2.5 Competition Comparison — Scanner

| Feature | ngcompass/scanner | ESLint (glob) | Nx affected | TypeScript Language Service |
|---|---|---|---|---|
| Git-optimised discovery | ✅ git ls-files | ❌ glob only | ✅ git diff | ❌ |
| tsconfig.json respect | ❌ | ✅ | ✅ | ✅ |
| angular.json awareness | ❌ | ❌ | ✅ | ❌ |
| Per-dir .gitignore | ❌ root only | ✅ | ✅ | ❌ |
| Fingerprint caching | ✅ | ❌ | ✅ | ❌ |
| Monorepo workspace | ❌ | ⚠️ workspaces | ✅ | ❌ |
| Progress events | ❌ | ❌ | ✅ | ❌ |
| Streaming results | ❌ | ❌ | ❌ | ❌ |
| Result<T> error model | ✅ | ❌ throws | ❌ | ❌ |

**Summary:** ngcompass scanner leads in Git integration and error model. It lags on project-config awareness and monorepo support — the two things every real Angular project needs.

---

## 3. Planner — Deep Evaluation

### 3.1 Architecture Overview

```
buildExecutionPlan(files, rules, options)
  ├─ calculateGlobalHash()               SHA256(files+rules+version)
  ├─ tryLoadPlanFromCache(globalHash)
  │   ├─ L1: precomputedAnalysis hit      short-circuit entire run
  │   └─ L2: plan hit                     deserialize → skip build
  ├─ ComponentDependencyGraph.build()    O(N) single pass
  ├─ buildAllTasks()
  │   ├─ < 10 000 files → sequential
  │   └─ ≥ 10 000 files → worker threads (with fallback)
  │       └─ for each file:
  │           ├─ detectFileType()        pure, naming convention
  │           └─ for each rule:
  │               └─ buildTask()
  │                   ├─ getOrDiscoverResources()  graph O(1) / fallback O(N)
  │                   ├─ hashFile() × N             xxhash WASM
  │                   └─ calculateTaskId()          SHA256(versioned inputs)
  ├─ filterCachedTasks()                 L3: per-task result cache
  ├─ convertTasksToPlan()                file-centric view
  ├─ buildIndexes()                      O(1) engine queries
  └─ Ok(ExecutionPlanOutput)
```

### 3.2 Dimension Scores

| Dimension | Score | Notes |
|---|---|---|
| Correctness | 8/10 | Content addressing is solid; file-type detection has edge cases |
| Performance | 8/10 | Graph + workers + stat-first hashing; hardcoded thresholds |
| Caching | 9/10 | Best-in-class multi-level; self-healing; version-scoped |
| Error handling | 8/10 | Result types throughout; one VersionContext typed as `any` |
| Code organisation | 5/10 | builder.ts (623L) and task-builder.ts (447L) are god classes |
| Extensibility | 5/10 | No custom resolver; no rule dependency graph |
| Test coverage | 6/10 | Unit tests on isolated functions; integration tests sparse |
| Documentation | 8/10 | Good JSDoc; types are self-documenting |

---

### 3.3 What Is Good

#### Content-Addressed Task IDs
`taskId = SHA256(toolVersion + parserVersion + ruleName + tsHash + templateHash + styleHashes + specHash + options)`

This is the most sophisticated piece of engineering in the entire codebase. Implications:
- A task's ID is identical regardless of which machine computed it → cache sharing across CI nodes
- Renaming a file without changing its content produces the same task ID → no false cache misses
- Upgrading the tool version changes every task ID → no stale results after tool upgrades

#### Three-Level Cache Hierarchy
```
L1: Analysis cache   → key: globalHash    → value: complete AnalysisResult (skip everything)
L2: Plan cache       → key: globalHash    → value: serialized ExecutionPlanOutput
L3: Result cache     → key: taskId        → value: per-task rule findings
```
Hitting L1 means a completely identical codebase + ruleset produces instant results. Hitting L2 means task building is skipped but rule execution runs only on changed inputs. L3 is standard incremental analysis.

#### StringInterner / ReferenceInterner Serialisation
Rule names, file paths, and hashes are interned: stored once in an array, referenced by index. On a 500-component project with 20 rules this reduces the serialised plan JSON by 60–70%. Cache storage is no longer a concern.

#### ComponentDependencyGraph
Built in a single O(N) pass over the file list before any rule-matching begins. Each `buildTask()` call is then O(1) for resource discovery instead of an O(N) directory scan per file. Without this, building tasks for a 1 000-component project would require 1 000 directory reads.

#### Stat-First Hash Warmup
`warmupHashCache` checks `mtime + size` before reading file content. Files whose mtime and size match the stored metadata skip the read entirely — crucial for large codebases where reading every TypeScript file is slow.

#### Pre-Computed ExecutionIndexes
Every query the engine might make is answered in O(1):
- "Which files need TypeScript AST parsing?" → `filesNeedingTsAst`
- "Which tasks belong to file X?" → `tasksByFile[x]`
- "Which files are components?" → `filesByType.component`
- "How many error-severity tasks?" → `tasksBySeverity.error`

The engine never has to iterate the plan at runtime.

---

### 3.4 What Is Missing / Needs Improvement

#### PLAN-001 · `builder.ts` Is a 623-Line God Class
**File:** `packages/planner/src/builder.ts`

`buildExecutionPlan` handles: input validation, cache I/O, graph construction, sequential task building, parallel worker management, incremental filtering, backward-compat conversion, index building, and result packaging. This is 8 responsibilities in one file. Any change to caching, workers, or incremental logic requires touching the same file — high merge conflict risk and cognitive load.

**Fix:** Extract into:
- `PlanCacheManager` — L1/L2 cache read/write
- `WorkerOrchestrator` — parallel worker management
- `PlanBuilder` — pure orchestration (wire the above)

---

#### PLAN-002 · `task-builder.ts` Is a 447-Line Mixed-Concern Module
**File:** `packages/planner/src/task-builder.ts`

Contains rule applicability logic, input hashing, resource discovery, and task ID calculation in one file. `buildTask()` alone has 7 steps.

**Fix:** Split into:
- `rule-applicability.ts` — `shouldApplyRule()`
- `input-resolver.ts` — `buildTaskInputsWithHashes()`
- The rest stays in `task-builder.ts` (the actual task assembly)

---

#### PLAN-003 · Worker Threshold Hardcoded at 10 000 Files
**File:** `packages/planner/src/builder.ts` line ~200

```ts
const useParallel = files.length >= 10_000 && workerCount > 0;
```

This threshold is not configurable. A project with 9 999 files gets sequential processing; one with 10 001 gets workers. The real break-even point depends on CPU count, file sizes, and rule complexity — not a fixed file count.

**Fix:** Expose `parallelThreshold` in `PlanOptions`. Default: `10_000`. Let power users tune it.

---

#### PLAN-004 · No Partial Plan Invalidation
When a single file changes, the entire plan is rebuilt from scratch (because the `globalHash` changes). The plan cache is an all-or-nothing hit. There is no mechanism to rebuild tasks only for changed files while reusing tasks for unchanged files.

**Fix:** Introduce a file-level `planEntry` cache keyed by `{filePath}-{fileHash}`. On plan build, check each file individually. Only rebuild tasks for files whose hash changed. The global plan is then assembled from mixed cached + fresh entries.

---

#### PLAN-005 · Manual Worker Serialisation Is Fragile
**File:** `packages/planner/src/builder.ts` · `worker.ts`

`Map` objects cannot be transferred via `structuredClone` (used by Worker threads), so the code serialises them as `[string, ResolvedRule][]` arrays and reconstructs on the worker side. This is brittle and will silently produce wrong results if the shape of `ResolvedRule` gains a non-clonable property.

**Fix:** Use `SharedArrayBuffer` + `Atomics` for large read-only rule sets, or adopt `worker_threads` `MessageChannel` with `transferList`. Alternatively use `postMessage` with `{ rules: Object.fromEntries(rulesMap) }` and validate reconstruction with a schema.

---

#### PLAN-006 · `detectFileType` Falls Through to `'logic'` for Unrecognised Files
**File:** `packages/planner/src/file-type.ts`

Any file that doesn't match a known Angular suffix becomes `'logic'`. The `shouldApplyRule` function in `task-builder.ts` applies "standalone" and "imports" dependency-typed rules to `'logic'` files. This means rules intended for components will accidentally run on config files, barrel exports, and utilities.

**Fix:** Add an explicit `'unknown'` type. Change `shouldApplyRule` to skip `'unknown'` files for component-only rules, and add a `warnUnknownFileTypes` option.

---

#### PLAN-007 · `VersionContext` Typed as `any` in Critical Hashing Path
**File:** `packages/planner/src/hashing.ts`

```ts
export function calculateTaskId(ruleName: string, inputs: TaskInputs, options: ..., ctx: any): string
```

`ctx` is typed `any`. This is the most security-sensitive function in the package — a wrong shape silently produces a different hash, causing either stale cache hits (missed violations) or unnecessary cache misses (performance). The type should be the narrowest possible interface.

**Fix:** Define and export a `HashingContext` interface with the exact fields used (`toolVersion`, `parserVersion`). Remove `any`.

---

#### PLAN-008 · No `angular.json` / Project-Graph Integration
Like the scanner, the planner has no knowledge of `angular.json` project boundaries. In a monorepo with 10 apps, all 10 are treated as one flat file set. There is no way to run analysis per-project or exclude test projects.

**Fix:** Accept an optional `workspaceRoot` and `projectName` in `PlanOptions`. Use the scanner's (future) workspace-aware file discovery to scope the file list to the correct project.

---

#### PLAN-009 · No Plan Diff / Change Summary
After running incremental analysis, the planner knows exactly which files changed (tasks not in L3 cache). This information is never surfaced. The user sees the final list of violations but never "3 files changed since last run."

**Fix:** Add a `changedFiles: string[]` and `skippedFiles: string[]` field to `ExecutionPlanOutput`. Report these in the CLI output.

---

#### PLAN-010 · Hardcoded Hash Warmup Batch Size
**File:** `packages/planner/src/hashing.ts`

```ts
const BATCH_SIZE = 500;
```

Hardcoded and undocumented. On machines with NVMe storage (high concurrent I/O) this is too conservative; on network drives it may be too aggressive.

**Fix:** Derive from CPU count × I/O multiplier, or expose as an option.

---

### 3.5 Competition Comparison — Planner

| Feature | ngcompass/planner | ESLint (lint-cache) | Nx computation cache | Angular CLI builder |
|---|---|---|---|---|
| Content-addressed task IDs | ✅ SHA256(inputs+version) | ❌ path-based | ✅ | ❌ |
| Multi-level cache (3 levels) | ✅ | ❌ 1 level | ✅ 2 levels | ❌ |
| Cross-CI cache sharing | ✅ content-addressed | ❌ | ✅ Nx Cloud | ❌ |
| Incremental (skip unchanged) | ✅ L3 result cache | ✅ `.eslintcache` | ✅ | ❌ |
| Version-scoped invalidation | ✅ toolVersion+parserVersion | ⚠️ manual cache clear | ✅ | ❌ |
| Worker threads for planning | ✅ (≥10k files) | ❌ | ✅ | ❌ |
| Pre-computed execution indexes | ✅ | ❌ | ❌ | ❌ |
| Rule dependency graph | ❌ | ❌ | ✅ task deps | ❌ |
| Partial plan invalidation | ❌ | ⚠️ per-file | ✅ | ❌ |
| angular.json awareness | ❌ | ❌ | ✅ | ✅ |
| Plan diff reporting | ❌ | ❌ | ✅ | ❌ |

**Summary:** ngcompass planner is industry-leading on cache sophistication and task indexing. It lags on project-graph awareness, partial invalidation, and code organisation.

---

## 4. Integration Assessment

### 4.1 Data Flow Integrity

```
Scanner → [files: string[]] → Planner → [ExecutionPlanOutput] → Engine → [AnalysisResult]
```

The contract between packages is clean and well-typed. Scanner returns `string[]`; Planner accepts `string[]` + `Map<string, ResolvedRule>`. There are no hidden shared globals or implicit coupling.

### 4.2 Cache Layer Coordination

The scanner and planner use the same `CacheContext` interface but maintain **separate** cache namespaces. There is no cross-pollination. The planner's L3 task cache is completely independent of the scanner's file-list cache — correct by design.

### 4.3 What Is Missing at the Integration Level

| Gap | Impact |
|---|---|
| No end-to-end progress events | CLI user sees nothing for 5–30s on large codebases |
| No shared `angular.json` parsing | Both packages reinvent project discovery |
| Scanner caches file paths; Planner caches tasks — no unified invalidation primitive | Two separate stale-cache scenarios |
| No `ScanResult → PlanOptions` adapter | Caller (CLI) must manually bridge the two APIs |

---

## 5. Priority Tickets

---

### 🔴 CRITICAL — P0

---

#### SCANNER-001: Fix `getDirectoryFingerprint` — mtime Only Is Unreliable
**File:** `packages/scanner/src/git.ts`
**Problem:** Non-Git directory fingerprint uses only root `mtime`. Deeply nested file additions don't update root mtime on Linux `ext4` → stale cache hits → missed violations.
**Action:** Fingerprint first-level children: `{mtime}-{count}-{totalSize}` of immediate subdirectories.
**Effort:** S (2h)

---

#### SCANNER-002: Add `tsconfig.json` Respect for Include/Exclude Patterns
**File:** `packages/scanner/src/normalize.ts` + `scan.ts`
**Problem:** Angular projects define their file sets in `tsconfig.json`. The scanner ignores this and may include test fixtures, build outputs, and generated files.
**Action:** Accept optional `tsConfigPath`. Parse `include`/`exclude`/`files` arrays and merge with user patterns. Fall back gracefully if not provided.
**Effort:** M (1 day)

---

#### PLAN-001: Split `builder.ts` (623 Lines) into Focused Modules
**File:** `packages/planner/src/builder.ts`
**Problem:** 8 responsibilities in one file. Cache I/O, worker management, task building, incremental filtering, and index construction are all entangled.
**Action:** Extract `PlanCacheManager` (cache read/write), `WorkerOrchestrator` (parallel workers), keep `builder.ts` as thin wiring.
**Effort:** M (1 day)

---

#### PLAN-007: Type `VersionContext` — Remove `any` from Hashing Critical Path
**File:** `packages/planner/src/hashing.ts`
**Problem:** `calculateTaskId` and `calculateGlobalHash` take `ctx: any`. Wrong shapes silently produce wrong hashes → stale or missed cache hits.
**Action:** Define `HashingContext { toolVersion: string; parserVersion: string }`. Replace all `any` usages.
**Effort:** S (1h)

---

### 🟠 HIGH — P1

---

#### SCANNER-003: Read Per-Directory `.gitignore` Files
**File:** `packages/scanner/src/gitignore.ts`
**Problem:** Only root `.gitignore` is read. Monorepos with per-package `.gitignore` files have incorrect inclusions.
**Action:** Walk directory tree collecting all `.gitignore` files; merge with the `ignore` library's `add()`.
**Effort:** M (4h)

---

#### SCANNER-004: Add Monorepo / `angular.json` Workspace Awareness
**Files:** `packages/scanner/src/scan.ts` + new `workspace.ts`
**Problem:** In a monorepo with 10 apps, all files are scanned as one flat set.
**Action:** Accept optional `workspaceFile`. Parse `angular.json` or `nx.json` project map. Derive per-project `rootDir` + `tsConfigPath`.
**Effort:** L (2–3 days)

---

#### PLAN-002: Split `task-builder.ts` (447 Lines) into Focused Modules
**File:** `packages/planner/src/task-builder.ts`
**Problem:** Rule applicability, input hashing, resource discovery, and task assembly in one module.
**Action:** Extract `rule-applicability.ts` and `input-resolver.ts`.
**Effort:** S (3h)

---

#### PLAN-003: Make Worker Threshold Configurable
**File:** `packages/planner/src/builder.ts`
**Problem:** `parallelThreshold = 10_000` is hardcoded. Break-even depends on CPU/disk/rule complexity.
**Action:** Add `parallelThreshold?: number` to `PlanOptions`. Default `10_000`.
**Effort:** XS (30 min)

---

#### PLAN-005: Replace Manual Worker Map Serialisation
**File:** `packages/planner/src/builder.ts` + `worker.ts`
**Problem:** Maps serialised as `[key, value][]` arrays with manual reconstruction. Silently breaks if `ResolvedRule` gains a non-clonable property.
**Action:** Use `Object.fromEntries` + `Object.entries` with a schema validation step. Add a round-trip test.
**Effort:** S (3h)

---

### 🟡 MEDIUM — P2

---

#### SCANNER-005: Extend Default Include Patterns to Cover Style Files
**File:** `packages/scanner/src/normalize.ts`
**Problem:** Default `include` is `['**/*.ts', '**/*.html']` — style files omitted.
**Action:** Add `'**/*.scss', '**/*.css', '**/*.sass', '**/*.less'` to defaults.
**Effort:** XS (15 min)

---

#### SCANNER-006: Add Progress Callback to `ScanOptions`
**File:** `packages/scanner/src/scan.ts` + `types.ts`
**Problem:** Large scans are a black box with no feedback.
**Action:** Add `onProgress?: (phase: ScanPhase, count: number) => void` to `ScanOptions`. Emit after each major phase.
**Effort:** S (2h)

---

#### SCANNER-007: Fix Unlimited Concurrency in `calculateTotalSize`
**File:** `packages/scanner/src/stats.ts`
**Problem:** `Promise.allSettled(files.map(f => fs.stat(f)))` opens one FD per file simultaneously.
**Action:** Wrap with `p-limit(128)`.
**Effort:** XS (30 min)

---

#### PLAN-004: Introduce Per-File Plan Entry Cache
**File:** `packages/planner/src/builder.ts` + new `plan-entry-cache.ts`
**Problem:** A single-file change invalidates the entire plan cache. No partial invalidation exists.
**Action:** Add `planEntry` cache keyed by `{filePath}-{fileHash}`. Rebuild tasks only for changed files; reuse cached tasks for unchanged ones.
**Effort:** L (3–4 days)

---

#### PLAN-006: Add `'unknown'` FileType and Skip Logic
**File:** `packages/planner/src/file-type.ts` + `task-builder.ts`
**Problem:** Unrecognised files fall through to `'logic'` and incorrectly receive component rules.
**Action:** Return `'unknown'` for non-Angular files. In `shouldApplyRule`, skip `'unknown'` for all non-generic rules. Add optional `warnUnknownFileTypes` flag.
**Effort:** S (2h)

---

#### PLAN-009: Surface Plan Diff in `ExecutionPlanOutput`
**File:** `packages/planner/src/types.ts` + `builder.ts`
**Problem:** The planner knows which files changed but never tells the caller.
**Action:** Add `changedFiles: string[]` and `cachedFiles: string[]` to `ExecutionPlanOutput`. Populate during `filterCachedTasks`.
**Effort:** S (2h)

---

### 🟢 LOW — P3

---

#### PLAN-008: Add `angular.json` / `nx.json` Project Scoping to Planner
**File:** `packages/planner/src/builder.ts`
**Problem:** In a monorepo all projects are treated as one flat analysis unit.
**Action:** Accept optional `projectName` in `PlanOptions`. Use workspace-aware discovery from scanner (after SCANNER-004) to scope the file list.
**Effort:** M (depends on SCANNER-004)

---

#### PLAN-010: Make Hash Warmup Batch Size Dynamic
**File:** `packages/planner/src/hashing.ts`
**Problem:** `BATCH_SIZE = 500` is hardcoded; suboptimal on NVMe or network storage.
**Action:** Derive from `os.cpus().length × 64`, capped at 2 048. Expose as `hashBatchSize` in options.
**Effort:** XS (30 min)

---

#### INTEGRATION-001: Add `ScanResult → PlanOptions` Bridge Utility
**Files:** New `packages/planner/src/bridge.ts` or CLI adapter
**Problem:** Callers (CLI) must manually extract `files` from `ScanResult` and pass to `buildExecutionPlan`. A well-typed adapter would prevent misuse and simplify future extension.
**Action:** Export `scanResultToPlanInput(scanResult, rules, options): PlanOptions`.
**Effort:** XS (1h)

---

#### INTEGRATION-002: Unified End-to-End Progress Reporting
**Files:** Scanner `onProgress` (after SCANNER-006) + Planner `onProgress`
**Problem:** No feedback for the user during a full analysis run.
**Action:** Define a shared `AnalysisProgress` event type in `@ngcompass/common`. Wire scanner and planner `onProgress` callbacks to it. Emit from CLI.
**Effort:** M (1 day)

---

## 6. MVP Readiness Verdict

### Scanner — ✅ MVP-Ready (with one fix before release)

**Must fix before MVP:**
- `SCANNER-001` — `getDirectoryFingerprint` reliability (can cause stale cache bugs in non-Git projects)

**Acceptable after MVP:**
- `SCANNER-002` through `SCANNER-007` are quality-of-life improvements, not blocking correctness

**Rationale:** The scanner's Git path (which is the common case for any serious Angular project) is solid. The non-Git cache fingerprint bug is the only correctness risk.

---

### Planner — ⚠️ MVP-Ready (with two fixes before release)

**Must fix before MVP:**
- `PLAN-007` — Remove `any` from `VersionContext` in hashing (silent incorrect cache keys = silent missed violations)
- `PLAN-006` — Add `'unknown'` FileType guard (component rules running on `tsconfig.json` = false positives)

**Acceptable after MVP:**
- `PLAN-001`/`PLAN-002` (builder refactoring) — technical debt, not correctness
- `PLAN-003`/`PLAN-004`/`PLAN-005` — performance/reliability improvements
- `PLAN-009` — UX improvement

**Rationale:** The caching architecture is genuinely excellent and the task model is correct. The two P0 issues are small fixes with high correctness impact.

---

## 7. Roadmap Summary

```
Pre-MVP (unblock release)
  ├─ SCANNER-001  Fix non-Git fingerprint reliability (S)
  ├─ PLAN-007     Type VersionContext — remove any (S)
  └─ PLAN-006     Add unknown FileType guard (S)

Sprint 1 (post-MVP stabilisation)
  ├─ SCANNER-007  Fix unlimited FD concurrency (XS)
  ├─ SCANNER-005  Add style files to default include (XS)
  ├─ PLAN-003     Configurable worker threshold (XS)
  ├─ PLAN-002     Split task-builder.ts (S)
  ├─ PLAN-001     Split builder.ts (M)
  └─ PLAN-005     Fix worker Map serialisation (S)

Sprint 2 (quality & DX)
  ├─ SCANNER-002  tsconfig.json file-set respect (M)
  ├─ SCANNER-003  Per-dir .gitignore (M)
  ├─ SCANNER-006  Progress callbacks (S)
  ├─ PLAN-009     Plan diff output (S)
  └─ INTEGRATION-001  ScanResult bridge utility (XS)

Sprint 3 (power features)
  ├─ PLAN-004     Per-file plan entry cache (L)
  ├─ SCANNER-004  angular.json workspace awareness (L)
  ├─ PLAN-008     Project scoping in planner (M)
  └─ INTEGRATION-002  Unified progress reporting (M)
```

---

## 8. Key Strengths to Preserve

1. **Content-addressed task IDs** — the entire caching strategy depends on this. Never switch to path-based IDs.
2. **Three-level cache hierarchy** — L1 short-circuit is only possible because of the global hash. Keep it.
3. **`ComponentDependencyGraph` O(N) build** — critical for performance at scale. Do not regress to per-file directory scans.
4. **Result<T> error model** — both packages are silent on errors, never crashing the caller. Maintain this contract for every new I/O operation added.
5. **`StringInterner` serialisation** — 60–70% space saving matters at scale. Maintain the format version discipline.
6. **Git-first file discovery** — the `spawn` approach is correct and fast. Do not replace with exec.
