# NgCompass Architecture Evaluation

This document outlines a critical evaluation of the `ngcompass` architecture across all packages, highlighting strengths, identified bottlenecks, and potential architectural risks.

## 1. Package Structure & Dependency Graph (Clean)
The monorepo structure is excellent. Our dependency analysis (`getPackageDependencies`) confirmed that **there are no circular dependencies** between packages.
*   The `common` package is pure and contains no external dependencies.
*   The `engine` acts as the orchestrator, correctly depending on `ast` and `planner`.
*   The `cli` is the only package that imports everything, acting as the true composition root.

## 2. The File I/O Bottleneck in Context Factory (Critical Risk)
**Issue:** Inside `packages/engine/src/analysis-context.ts`, the `readFileSafe` function uses `fs/promises` `readFile`.
In `RuleContextFactory.build()`, every rule execution batch does:
```typescript
const [fileContent, program] = await Promise.all([
    this.context.readFile(filePath),
    this.context.getProgram(filePath),
]);
```
**Why it's critical:** When running against an enterprise angular application with 5,000 files spread across 12 worker threads, you are blasting the Node.js event loop with thousands of concurrent `readFile` promises.
While `pLimit` inside `executeTasksLocally` throttles the *batch execution*, the memory overhead of holding thousands of raw string copies of files (once in `fileCache`, once in `oxc-parser` AST, once in `ts.Program`) will cause massive V8 Garbage Collection pauses and potentially Out-Of-Memory (OOM) errors on large codebases.

**Recommendation:** 
*   Implement an LRU cache or explicit eviction strategy in `createAnalysisContext` so memory used by `fileCache` and `programCache` is released after a file's tasks are fully executed.

## 3. The `TypeAwareContext` Concurrency Mismatch (High Risk)
**Issue:** In `packages/engine/src/orchestrator.ts`:
```typescript
const typeAwareTasks = tasks.filter(t => !!t.needsTypeChecker || !!t.needsProjectContext);
// runs locally with concurrency: 1
```
**Why it's critical:** Any rule that requires `needsTypeChecker: true` or `needsProjectContext: true` forces the engine to bypass the worker pool and execute synchronously on the main thread with a concurrency of `1`. 
Since type-aware rules (like checking RxJS observables or Signal types) are the *most valuable* rules in `ngcompass`, this means for a real-world project, the worker pool will sit idle while the main thread slowly chugs through the hardest rules one-by-one.

**Recommendation:** 
*   If `ts.createProgram` is too heavy to instantiate in every worker, consider a completely different execution model where the main thread *only* does TS Compiler API work (answering RPC queries from workers) while the workers do the actual rule AST traversal.

## 4. `oxc-parser` and `angular-html-parser` Segregation (Strength)
**Issue/Strength:** The `ast` package correctly segregates the Rust-based `oxc-parser` (which is blazingly fast) from the slower JavaScript-based `angular-html-parser`.
**Why it matters:** The engine only requests `getTemplate` if `needsTemplate` is true for a specific rule batch. This lazy evaluation is excellent and prevents parsing HTML for rules that only look at TypeScript classes.

## 5. Caching Layer Coupling (Medium Risk)
**Issue:** The `@ngcompass/cache` package depends on `@cacache` and `write-file-atomic`. In `orchestrator.ts`, the cache writing is tightly coupled to the successful execution of the entire analysis block:
```typescript
await options.cache.analysis.set(plan.globalHash, finalResult);
```
**Why it's a risk:** If the cache directory is not writable (e.g. strict CI environments or Docker containers running as non-root), `ngcompass` will throw a fatal `IOError` at the very end of a successful run, failing the CI pipeline even if the linting passed.
**Recommendation:** Ensure cache writes are aggressively `try/catch` wrapped and truly fail-safe so that CI pipelines never fail due to a cache permission error. (Currently it is wrapped, but it logs an `InfrastructureError` which might be treated as a failure by the reporter).

## Conclusion
The architecture is fundamentally sound, modular, and modern. The strict separation of the worker pool from the `TypeAwareContext` guarantees stability. However, the decision to force all Type-Aware rules onto a single-thread concurrency model will make performance scale very poorly on enterprise codebases. Managing the memory of the `ts.Program` alongside raw file strings is the next primary architectural challenge.
