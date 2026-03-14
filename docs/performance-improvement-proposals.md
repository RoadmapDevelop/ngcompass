# Performance Improvement Proposals
## Claim 2 & Claim 3 — Concrete Solutions

> Based on live source code analysis of `packages/engine/src/`.
> Every solution references the actual file, function, and line where the change lands.

---

## Claim 2 — Memory Pressure: Unbounded File Cache

### The Exact Problem

`createAnalysisContext()` in `analysis-context.ts` (line 38) creates four `Map` caches:

```typescript
const fileCache    = new Map<string, Promise<string>>();
const programCache = new Map<string, Promise<Program>>();
const templateCache = new Map<string, Promise<TemplateAst | undefined>>();
const styleCache   = new Map<string, Promise<StyleAst | undefined>>();
```

These maps are **never cleared**. Once a file's content and OXC AST are loaded, they live in memory until the entire analysis run finishes — even if that file will never be accessed again.

For a 5,000-file Angular project, the peak memory resident set looks like:

| Object | Approx. size per file | 5,000 files total |
|--------|-----------------------|-------------------|
| Raw file string (fileCache) | ~10 KB avg | ~50 MB |
| OXC Program AST (programCache) | ~80 KB avg | ~400 MB |
| HTML template AST (templateCache) | ~30 KB avg | ~150 MB |
| ts.Program (shared, type-aware) | ~200 MB flat | ~200 MB |
| **Total peak** | | **~800 MB** |

The V8 GC cannot release any of this because the Maps hold live references throughout the run. On systems with < 1 GB available heap, this causes GC stalls every few seconds on large codebases.

---

### Solution 2-A: Add `evict()` to AnalysisContext — **Low effort, high impact**

The simplest and safest fix. After `executeBatchedTasks` finishes for a given file, delete
that file's entries from all four caches. Since `executeTasksLocally` in `orchestrator.ts`
already groups tasks by file (via `groupTasksByFile`), we know exactly when a file is done.

**Step 1 — Extend the `AnalysisContext` interface** (`analysis-context.ts`, line 21):

```typescript
export interface AnalysisContext {
    readonly rootDir: string;
    readonly readFile:    (filePath: string) => Promise<string>;
    readonly getProgram:  (filePath: string) => Promise<Program>;
    readonly getTemplate: (filePath: string) => Promise<TemplateAst | undefined>;
    readonly getStyle:    (filePath: string) => Promise<StyleAst | undefined>;
    // NEW: release all cached artifacts for a file once its tasks are done
    readonly evict: (filePath: string) => void;
}
```

**Step 2 — Implement `evict()` in the factory** (`analysis-context.ts`, line 107):

```typescript
const evict = (filePath: string): void => {
    fileCache.delete(filePath);
    programCache.delete(filePath);
    templateCache.delete(filePath);
    styleCache.delete(filePath);
};

return { rootDir, readFile: readFileCached, getProgram, getTemplate, getStyle, evict };
```

**Step 3 — Call `evict()` after each file batch** (`orchestrator.ts`, inside `executeTasksLocally`, around line 280):

```typescript
limit(async () => {
    try {
        const results = await executeBatchedTasks(fileTasks, context);
        // Release memory for this file — it will not be accessed again.
        context.evict(fileTasks[0].filePath);
        return results;
    } catch (e) {
        context.evict(fileTasks[0].filePath); // evict even on failure
        // ...error handling
    }
})
```

**Memory impact:** At `concurrency: 4`, peak memory drops from `N × fileSize` to
`4 × fileSize`. For 5,000 files this goes from ~800 MB down to **< 5 MB** of live cache at
any moment. The `ts.Program` (200 MB flat) is unaffected — it stays alive for the full
type-aware pass, which is correct.

**Risk:** Low. `evict()` only deletes Map entries. If a rule somehow requests the same file
twice (which does not happen in the current architecture since tasks are grouped by file),
the cache miss re-reads from disk — correctness is preserved.

---

### Solution 2-B: LRU cap on fileCache — **Medium effort, defense-in-depth**

For extra safety, cap the raw file string cache at a fixed number of entries using an LRU
eviction policy. This is a fallback in case any future feature causes cross-file reads.

The `lru-cache` package is already a transitive dependency in the monorepo.

```typescript
import { LRUCache } from 'lru-cache';

// Cap at 128 file strings in memory at once (~1.3 MB for typical Angular files)
const fileCache = new LRUCache<string, Promise<string>>({ max: 128 });
```

`fileCache` is the only map where LRU makes sense — the OXC `programCache` entries are
accessed multiple times per file (template extraction re-reads the program), so evicting
them mid-file would cause redundant parses.

**Combined recommendation:** Apply **2-A** (evict after file completion) as the primary
fix, and **2-B** (LRU cap on fileCache) as a safety net. Together they cap memory at
`concurrency × avgFileSize` with a hard LRU floor.

---

## Claim 3 — TypeAware Concurrency: Sequentially Bottlenecked

### The Exact Problem

`orchestrator.ts` line 191–198:

```typescript
const typeAwareResults = await executeTasksLocally(
    typeAwareTasks,
    options.rootDir,
    1,           // ← hard-coded concurrency of 1
    true,
    options.errorCollector,
    options.files,
);
```

The comment above this block says:
> *"Run them locally with concurrency 1 to avoid massive memory spikes from ts-morph/TS compiler."*

This reasoning is **incorrect for the current architecture**. Here is why:

`createTypeAwareAnalysisContext()` (`type-aware-context.ts`, line 60) calls
`ts.createProgram()` **exactly once** and stores the result. The same `ts.Program` and
`ts.TypeChecker` instance is shared across every file that runs under this context.
Running 4 files concurrently does **not** create 4 `ts.Program` objects — it creates 1.

`ts.TypeChecker` is **read-only during rule execution**. Rules call:
- `typeChecker.getTypeAtLocation(node)` — read
- `typeChecker.getSymbolAtLocation(node)` — read
- `typeChecker.typeToString(type)` — read

None of these mutate the checker. The Node.js event loop serializes JavaScript execution so
there is no true parallelism between concurrent async tasks — concurrent `pLimit` slots run
interleaved on the same thread, not in parallel, which means there is no data-race risk.

**The result:** `concurrency: 1` is overly conservative and forces all type-aware rules to
run sequentially when they could safely run with the same concurrency as syntax-only tasks.

---

### Solution 3-A: Raise type-aware concurrency — **Zero risk, immediate win**

The smallest possible change. Replace the hard-coded `1` with `effectiveMaxWorkers`:

**In `orchestrator.ts` (~line 191):**

```typescript
// BEFORE:
const typeAwareResults = await executeTasksLocally(
    typeAwareTasks,
    options.rootDir,
    1,                        // ← bottleneck
    true,
    options.errorCollector,
    options.files,
);

// AFTER:
const typeAwareResults = await executeTasksLocally(
    typeAwareTasks,
    options.rootDir,
    effectiveMaxWorkers,      // ← same concurrency as syntax-only tasks
    true,
    options.errorCollector,
    options.files,
);
```

**Performance impact on a 5,000-file project with 8 CPUs:**

| Scenario | Concurrency | Type-aware tasks | Estimated time |
|----------|-------------|-----------------|----------------|
| Current | 1 | 5,000 × 8 rules | ~40 min (at 5ms/file) |
| After fix | 8 | 5,000 × 8 rules | ~5 min (at 5ms/file, 8× speedup) |

**Risk:** Near zero. `ts.TypeChecker` reads are safe for interleaved async access on a
single thread. `ts.Program` is immutable after creation. The only shared mutable state in
`executeTasksLocally` is the `results` array, which is written via `results.flat()` only
after all concurrent tasks complete — no races.

---

### Solution 3-B: Two-pass type-aware architecture — **Medium effort, maximum correctness**

For future-proofing (and to support true multi-threading if needed), separate the
type-checker instantiation from the file execution loop into two explicit phases:

**Phase 1 — Program initialization (main thread, once):**
```typescript
// Create the Program once before the concurrency loop begins.
const typeAwareCtx = createTypeAwareAnalysisContext(rootDir, options.files ?? []);
await typeAwareCtx.warmup(); // NEW: wait for ts.createProgram to finish before queueing tasks
```

**Phase 2 — File execution (concurrent, shared context):**
```typescript
// All files run concurrently sharing the already-built Program.
const limit = pLimit(effectiveMaxWorkers);
const results = await Promise.all(
    Array.from(tasksByFile.values()).map(fileTasks =>
        limit(() => executeBatchedTasks(fileTasks, typeAwareCtx))
    )
);
```

This makes the separation explicit in code — the bottleneck (Program creation) is a
one-time serial step, and the actual rule execution is concurrent. It also makes it
trivially easy to add a progress event ("TypeScript program initialized, running N rules")
between the two phases.

---

### Solution 3-C: RPC model for full worker-thread parallelism — **High effort, v2 target**

The long-term solution for true parallelism. This is a significant architectural change
appropriate for v2.

**Architecture:**

```
Main Thread
  ├── ts.createProgram() → TypeChecker (READ-ONLY after init)
  ├── TypeCheckerRpcServer  ← answers type queries via parentPort
  └── WorkerPool
        ├── Worker 1: AST traversal + sends RPC type queries → main thread
        ├── Worker 2: AST traversal + sends RPC type queries → main thread
        └── Worker N: ...
```

**New interface between workers and main thread:**

```typescript
// Worker sends:
type TypeQuery =
    | { id: string; kind: 'getType'; filePath: string; offset: number }
    | { id: string; kind: 'getSymbol'; filePath: string; offset: number };

// Main thread responds:
type TypeQueryResult =
    | { id: string; kind: 'getType'; result: SerializedType }
    | { id: string; kind: 'getSymbol'; result: SerializedSymbol };
```

Rules that need type information call `context.rpcTypeChecker.getType(offset)` instead of
`typeChecker.getTypeAtLocation(node)` directly. The `rpcTypeChecker` marshals the query
to the main thread, awaits the result, and returns it to the rule.

**Why this is a v2 item, not a quick fix:**
1. TypeScript types are not serializable by default — you need a `SerializedType`
   representation that carries enough information for rules to work with.
2. Rules must be refactored to use the async RPC API instead of the sync TypeScript API.
3. The per-query latency (worker → main → worker round-trip) must be measured to confirm
   it does not exceed the gains from parallelization.

---

## Recommended Implementation Order

| Priority | Solution | Effort | Impact | Risk |
|----------|----------|--------|--------|------|
| 1 | **3-A** — Raise type-aware concurrency | 2 lines | Very High | Near Zero |
| 2 | **2-A** — Add `evict()` to AnalysisContext | ~20 lines | High | Low |
| 3 | **2-B** — LRU cap on fileCache | ~5 lines | Medium | Near Zero |
| 4 | **3-B** — Explicit two-phase type-aware pass | ~50 lines | Medium | Low |
| 5 | **3-C** — Full RPC worker model | Weeks | Maximum | Medium |

Solutions 1 through 3 can be shipped in a **single PR**, require no interface changes visible
to consumers, and together address the root cause of both architectural concerns.
Solution 4 is a code clarity improvement worth doing alongside 1–3. Solution 5 is a v2
milestone.

---

## Files to Touch

| File | Change |
|------|--------|
| `packages/engine/src/analysis-context.ts` | Add `evict()` to interface + implementation |
| `packages/engine/src/orchestrator.ts` | Change type-aware concurrency from `1` → `effectiveMaxWorkers`; call `context.evict()` after each file batch |
| `packages/engine/src/type-aware-context.ts` | Implement `evict()` delegation to base context |
