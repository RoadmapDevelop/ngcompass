Here is the complete analysis and implementation plan converted into a structured Markdown document.

# Incremental Cache Analysis & Implementation Plan

## Part 1: Why Incremental Cache Shows 0% Hit Rate

**Root Cause:** `taskId` Never Propagated from Task to `RuleResult`.

The incremental cache pipeline has a complete break—results are written to cache with no key, so subsequent runs find 0 cached tasks.

### The Broken Chain (Step-by-Step)

1. **Tasks built with content-based `taskId**` ✅ **WORKS**
* `task-builder.ts:405`  `taskId = calculateTaskId(...)`
* Each Task has a proper content hash as `taskId`.


2. **`filterCachedTasks` checks `cache.hasMany(taskIds)**` ✅ **WORKS** (Logic is correct)
* `incremental.ts:87`  `cachedTaskIds = await cache.hasMany(taskIds)`
* But returns 0 because nothing was ever written (see Step 4).


3. **Analysis runs, produces `RuleResult**` ❌ **taskId NOT INCLUDED**
* `orchestrator.ts:206-209`:
```typescript
return Ok({
    ruleName: task.ruleName,
    failures: failures as ReadonlyArray<RuleFailure>,
    // ← taskId is MISSING — never set
});

```




4. **Cache write filters out results without `taskId**` ❌ **NOTHING CACHED**
* `analyze.ts:180`:
```typescript
if (result.taskId) {       // ← always undefined/falsy
   resultsToCache.push([result.taskId, result]);
}
// resultsToCache is always empty → setMany([]) is a no-op

```




5. **Next run  `hasMany` finds 0 results  0% hit rate** ❌ **ALWAYS 0%**

### The Fix

Add `taskId: task.taskId` to the `RuleResult` in `orchestrator.ts`:

```typescript
// File: packages/core/src/engine/orchestrator.ts

// Line 206-209 — CURRENT (broken):
return Ok({
    ruleName: task.ruleName,
    failures: failures as ReadonlyArray<RuleFailure>,
});

// Line 206-210 — FIXED:
return Ok({
    ruleName: task.ruleName,
    failures: failures as ReadonlyArray<RuleFailure>,
    taskId: task.taskId,
});

```

Also fix the empty-executor fallback at line 178-181:

```typescript
// CURRENT:
return Ok({ ruleName: task.ruleName, failures: [] });

// FIXED:
return Ok({ ruleName: task.ruleName, failures: [], taskId: task.taskId });

```

**Effort:** 2 one-line additions.

### Verification Steps (After Fix)

1. `npx ngcompass analyze --incremental` — first run: **0% cached**, 19 tasks execute.
2. `npx ngcompass analyze --incremental` — second run: **100% cached**, 0 tasks execute.
3. Touch one `.component.ts`, run again — partial cache hit.

---

## Part 2: Planning Phase Time Complexity Analysis

### Variables

*  = number of files (e.g., 19 now, could be 3600+ or 20000)
*  = number of enabled rules (e.g., 2 now, target ~70)
*  = total tasks (assuming most rules apply to most files)
*  = avg style files per component (~1)

### Step-by-Step Breakdown

#### Step 0: Initialize WASM Hasher — `initHasher()`

* **Time:**  amortized (WASM load on first call, no-op after)
* **I/O:** 1 WASM import (cached by V8)
* **Cost:** ~5ms first call, ~0ms subsequent

#### Step 1: Calculate Global Hash — `calculateGlobalHash`

```text
For each file f in F:
  hashCache.get(f)           → O(1) Map lookup
  If miss: await hashFile(f) → O(file_size) async readFile + xxhash
  Store in hashCache         → O(1)
Sort all F entries           → O(F log F) comparison sort
hashRules(rules)             → O(R log R) sort + O(R) JSON.stringify
computeHash(joined)          → O(total_string_length)

```

| Scale | File I/O | Sort | Hash | Total |
| --- | --- | --- | --- | --- |
| **F=19** | ~10ms | <1ms | <1ms | **~15ms** |
| **F=3600** | ~100ms | ~5ms | ~2ms | **~110ms** |
| **F=20000** | ~500ms | ~20ms | ~5ms | **~530ms** |

#### Step 2: Plan Cache Lookup — `cache.plans.get(globalHash)`

* **Time:**  — single disk read via cacache
* **I/O:** 1 async file read + V8 deserialize
* **Cache HIT:** `deserializePlan()` + `buildIndexes()`  skip Steps 3-6  return
* **Cache MISS:** continue to Step 3



| Scale | Lookup | Deserialize (if hit) | Total (hit path) |
| --- | --- | --- | --- |
| **F=19** | ~3ms | ~2ms | **~5ms** |
| **F=3600** | ~5ms | ~30ms | **~35ms** |
| **F=20000** | ~5ms | ~200ms | **~205ms** |

#### Step 3: Build All Tasks — `buildAllTasks`

This is the most expensive step. For each file:

1. **Detect Type:** 
2. **Apply Rules:** For each rule  in :
* **Discover Resources:**  — 6 `existsSync` calls.
* **Hash File:**  if miss.
* **Calculate Task ID:**  hash of pre-computed hashes.



**Effective per-unique-file cost:**

* Resource discovery: 6 `existsSync` calls (**sync!**)
* Hashing: 1 async `readFile` per resource file (1 TS + 0-1 HTML + 0-4 styles + 0-1 spec)

**Total Complexity:**

* Resource discovery:  sync I/O  **BOTTLENECK**
* File hashing:  async I/O
* Task building:  CPU

| Scale | Resource Discovery | Hashing I/O | Task Building | Total |
| --- | --- | --- | --- | --- |
| **F=19, R=2** | ~5ms (114 existsSync) | ~10ms (19 reads) | <1ms (38 tasks) | **~20ms** |
| **F=3600, R=2** | ~1s (21.6K existsSync) | ~200ms (3.6K reads) | ~5ms (7.2K tasks) | **~1.2s** |
| **F=3600, R=70** | ~1s (21.6K existsSync) | ~200ms (same, cached) | ~50ms (252K tasks) | **~1.3s** |
| **F=20000, R=70** | **~6s** (120K existsSync) | ~500ms (20K reads) | ~300ms (1.4M tasks) | **~6.8s** |

#### Step 4: Convert Tasks to Plan — `convertTasksToPlan`

**Total:** 

| Scale | Iterations | Time |
| --- | --- | --- |
| **F=19, R=2** | 38 | <1ms |
| **F=3600, R=70** | 252K | ~30ms |
| **F=20000, R=70** | 1.4M | **~100ms** |

#### Step 5: Build Indexes — `buildIndexes`

Currently runs 9 linear passes over data.
**Total:** 

| Scale | Iterations | Time |
| --- | --- | --- |
| **F=19, R=2** | 342 | <1ms |
| **F=3600, R=70** | 2.3M | ~100ms |
| **F=20000, R=70** | 12.6M | **~300ms** |

#### Step 6: Serialize + Cache Plan

**Total:** 

| Scale | Serialize | Write | Total |
| --- | --- | --- | --- |
| **F=19, R=2** | <1ms | ~3ms | **~4ms** |
| **F=3600, R=70** | ~50ms | ~30ms | **~80ms** |
| **F=20000, R=70** | ~200ms | ~50ms | **~250ms** |

### Complexity Summary Table

| Step | Operation | F=19, R=2 | F=3600, R=70 | F=20000, R=70 |
| --- | --- | --- | --- | --- |
| 0 | Init hasher | ~0ms | ~0ms | ~0ms |
| 1 | Global hash | ~15ms | ~110ms | ~530ms |
| 2 | Plan cache lookup | ~5ms | ~35ms | ~205ms |
| 3 | Build all tasks | ~20ms | **~1.3s** | **~6.8s** |
| 4 | Tasks → plan | <1ms | ~30ms | ~100ms |
| 5 | Build indexes | <1ms | ~100ms | ~300ms |
| 6 | Serialize + write | ~4ms | ~80ms | ~250ms |
| **Total (cold cache)** |  | **~50ms** | **~1.7s** | **~8.2s** |
| **Total (plan cache hit)** | Steps 0-2 | **~20ms** | **~150ms** | **~735ms** |

### Bottleneck Rankings

1. **`existsSync` × 6 in `discoverResources**` — 73% of cold-cache time at 20K files.
2. **File hashing I/O** — ~6% at 20K files.
3. **Index building** — ~4% at 20K files.

---

## Part 3: Re-Evaluation After User's Changes

### Improvements Acknowledged

| # | Change | Before | After | Status |
| --- | --- | --- | --- | --- |
| 1 | Registry-based dispatch | Hard-coded if/else | `getRuleExecutor()` in registry.ts | **Fixed** |
| 2 | Async I/O in orchestrator | `readFileSync` | `readFile` from fs/promises | **Fixed** |
| 3 | Parallel execution | Sequential for-loop | `pLimit(16)` concurrency | **Fixed** |
| 4 | sourceFile optional | `@ts-ignore` × 2 | Optional field in `RuleContext` | **Fixed** |
| 5 | Async hashing | `readFileSync` | `readFile`/`stat` from fs/promises | **Fixed** |
| 6 | hashFileStats | `readFileSync().length` | `stat().size` | **Fixed** |
| 7 | Global hash determinism | `hashCache.get(f) || ''` | Falls back to `await hashFile(f)` | **Fixed** |
| 8 | Debug dumps | `JSON.stringify` to stdout | Removed | **Fixed** |
| 9 | Template registration | Only 1 rule in registry | Both rules registered | **Fixed** |
| 10 | TemplateLiteral support | Only `StringLiteral` | Both string types handled | **Fixed** |
| 11 | Inline template fallback | No fallback | Falls back to inline extraction | **Fixed** |
| 12 | Reporter integration | Inline chalk | `getReporter('console')` | **Fixed** |
| 13 | hashFiles memory | Concatenate all contents | Hash-then-join | **Fixed** |

### Remaining Issues

#### P0 — Critical

| # | Issue | File:Line | Description |
| --- | --- | --- | --- |
| 1 | **taskId not propagated** | `orchestrator.ts:206-209` | Root cause of 0% incremental cache — see Part 1 |
| 2 | `pruneStaleCache` is a no-op | `incremental.ts:230-234` | Counts stale entries but `cache.delete()` not called; ResultCache interface lacks delete |
| 3 | `(context as any)._globalHash` | `builder.ts:112,135` | Type-unsafe state smuggling; should be a proper field on `TaskBuilderContext` |
| 4 | Zero test files | All packages | No validation of any code path |

#### P1 — High

| # | Issue | File:Line | Description |
| --- | --- | --- | --- |
| 1 | Dual task-building system | `task-builder.ts:70-183` vs `:383-442` | `buildRuleTask` (sync) and `buildTask` (async) both exist; only async is used but legacy code remains. |
| 2 | 6× `existsSync` per file | `resources.ts:39-58` | Sync I/O bottleneck; 6s at 20K files. |
| 3 | `any` types in context | `orchestrator.ts:37-39` | `getProgram`, `getTemplate` return `Promise<any>`. |
| 4 | `Result<T,E>` duplicated | Multiple files | 3 identical definitions. |
| 5 | Redundant `initHasher()` | `builder.ts:169` | Already called at `builder.ts:45`. |
| 6 | Unsafe rule resolution | `analyze.ts:81` | `resolveRules(config as any)`. |
| 7 | Silent skip for unknown rules | `orchestrator.ts:178` | Returns empty failures instead of error when no executor found. |
| 8 | Empty catch blocks | Multiple files | Errors silently swallowed. |

#### P2 — Medium

* `console.warn`/`error` usage in `orchestrator` (Should use logger).
* `incrementHits` is fire-and-forget (Metadata lost).
* Metadata namespace collision (`.meta` suffix).
* Custom error types unused.
* `JSON.stringify` size estimation is expensive.
* AST visitor duplicated in rules.
* "RECHECK" comment left in production code.
* Global mutable `globalCache`.

---

## Part 4: Implementation Plan

### Fix 1: Propagate taskId (P0 — Fixes Incremental Cache)

**File:** `packages/core/src/engine/orchestrator.ts`

Lines 206-209:

```typescript
return Ok({
    ruleName: task.ruleName,
    failures: failures as ReadonlyArray<RuleFailure>,
    taskId: task.taskId,
});

```

Lines 178-181 (Empty executor fallback):

```typescript
return Ok({
    ruleName: task.ruleName,
    failures: [],
    taskId: task.taskId,
});

```

### Fix 2: Type-safe globalHash on TaskBuilderContext (P0)

**File:** `packages/core/src/planner/task-builder.ts` (Lines 17-20)

```typescript
export interface TaskBuilderContext {
    hashCache?: Map<string, string>;
    resourceCache?: Map<string, TaskInputs>;
    globalHash?: string;  // Plan cache key — replaces (context as any)._globalHash
}

```

**File:** `packages/core/src/planner/builder.ts`

* **Line 112:** `context.globalHash = globalHash;`
* **Line 135:** `if (options.cache && context.globalHash)`
* **Line 142:** `await options.cache.plans.set(context.globalHash, compact);`

### Fix 3: Implement Cache Pruning (P0)

**File:** `packages/core/src/cache/services/result-cache.ts`

Add `delete` to `ResultCache` interface (Line 34):

```typescript
delete: (hash: string) => Promise<void>;

```

Add implementation in `createResultCache`:

```typescript
delete: async (hash: string): Promise<void> => {
    await driver.delete(hash);
    try {
        await metadataDriver.delete(getMetadataKey(hash));
    } catch {
        // Ignore metadata cleanup errors
    }
},

```

**File:** `packages/core/src/planner/incremental.ts` (Lines 230-234)

```typescript
if (shouldPrune) {
    await cache.delete(entry.metadata.taskId);
    prunedCount++;
}

```

---

## Part 5: Updated Architecture Diagram (Post-Changes)

```text
CLI (analyze.ts)
  1. resolveConfig()
  2. scan()
  3. resolveRules()
  4. buildExecutionPlan()    ← Async, plan caching via globalHash  ✅
  5. filterCachedTasks()     ← BROKEN: taskId not propagated       ❌
  6. runAnalysis()           ← Async, pLimit(16)                   ✅
  7. setMany(results)        ← BROKEN: nothing to cache            ❌
  8. reporter.report()       ← Proper reporter abstraction         ✅

Engine (orchestrator.ts)
  - Registry-based dispatch: getRuleExecutor()                     ✅
  - Async file reading: readFile from fs/promises                  ✅
  - Memoized context: fileCache, programCache, templateCache       ✅
  - pLimit(16) concurrency                                         ✅
  - Missing: taskId propagation in RuleResult                      ❌ ← ROOT CAUSE

Planner (builder.ts + task-builder.ts)
  - Content-based taskId via calculateTaskId()                     ✅
  - Async hashing via hashFile() with hashCache                    ✅
  - Global hash for plan cache key                                 ✅
  - resourceCache + hashCache memoization                          ✅
  - Dual system: sync legacy + async new paths coexist             ⚠️
  - (context as any)._globalHash type smuggling                    ⚠️

Cache (result-cache.ts + atomic.ts)
  - Bulk operations: hasMany, setMany, getMany                     ✅
  - Batched I/O: 200/batch                                         ✅
  - Atomic driver has delete() method                              ✅
  - ResultCache interface missing delete()                         ❌
  - pruneStaleCache is no-op (counts but doesn't delete)           ❌

```

### Key Metrics

| Metric | Value |
| --- | --- |
| **Rules implemented** | 2 |
| **Rules in recommended preset** | 78 (76 placeholder) |
| **Test coverage** | 0% |
| **Critical bugs** | 1 (taskId not propagated) |
| **Async I/O adoption** | ~90% (resources.ts still sync `existsSync`) |
| **Type safety (any casts)** | ~6 remaining in core paths |
| **Planning cold time (F=19)** | ~50ms |
| **Planning cached time (F=19)** | ~20ms |