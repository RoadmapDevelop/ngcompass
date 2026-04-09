# @ngcompass/scanner — Technical Evaluation

> Evaluated on: 2026-03-03
> Branch: `feat_quality`
> Package version: `0.0.1`

---

## Overall Rating: ★★★★☆ 7.8 / 10

---

## Quick Scorecard

| Dimension                     | Rating         | Score |
|-------------------------------|----------------|-------|
| Architecture / Module Design  | ★★★★★          | 9/10  |
| Error Handling                | ★★★★★          | 9/10  |
| Type Safety                   | ★★★★★          | 9/10  |
| Performance Design            | ★★★★☆          | 8/10  |
| Test Coverage                 | ★★★★☆          | 8/10  |
| Caching Strategy              | ★★★★☆          | 8/10  |
| Cross-Platform Support        | ★★★★☆          | 7/10  |
| Debug / Observability         | ★★★★☆          | 7/10  |
| Completeness / Production-Readiness | ★★★☆☆    | 6/10  |
| Documentation                 | ★★★☆☆          | 5/10  |

---

## Architecture Overview

The scanner is a purpose-built file discovery package split into **9 focused modules**, each with a single responsibility:

```
src/
├── scan.ts         Orchestration — ties all phases together
├── normalize.ts    Option normalization and validation
├── patterns.ts     Glob pattern processing and expansion
├── filters.ts      File filtering (gitignore, extension, dedup)
├── git.ts          Git repo detection and ls-files discovery
├── gitignore.ts    .gitignore loading and filter creation
├── glob.ts         tinyglobby execution wrapper
├── stats.ts        Statistics and summary calculations
└── types.ts        All type definitions
```

The execution flow is a linear pipeline:

```
scan(options)
  └─ normalizeOptions()
  └─ expandPatterns()
  └─ isGitRepo()?
      ├─ YES → getRepoFingerprint() → tryLoadFromCache()
      │         ├─ HIT  → return cached ScanResult
      │         └─ MISS → executeGitDiscovery() → filterByGlob() → applyFilters()
      └─ NO  → executeGlob() → applyFilters()
  └─ calculateStats()
  └─ saveToCache()  (git repos only)
  └─ return Ok(ScanResult)
```

---

## Strengths

### ★★★★★ Architecture / Module Design (9/10)

Each module owns exactly one concern. `git.ts` never touches glob logic. `filters.ts` never touches git logic. `scan.ts` never duplicates what `normalize.ts` handles. This separation means any module can be swapped, tested, or replaced without touching the rest of the pipeline.

The choice of functional composition over an OO class hierarchy is the right call for a pure data-transformation pipeline like file discovery.

### ★★★★★ Error Handling (9/10)

The `Result<T>` discriminated union is used consistently throughout. No raw `throw` statements reach the caller — every async operation is wrapped in `try-catch` that returns `Err(error)`. This means the caller always gets a typed result and never needs to wrap calls in `try-catch` themselves.

```typescript
// Every async boundary returns Result<T>
executeGlob()             → Promise<Result<RawFileList>>
executeGitDiscovery()     → Promise<string[]>  (empty array on failure)
applyFilters()            → Promise<Result<FilteredFileList>>
loadAndCreateGitignoreFilter() → Promise<Result<GitignoreFilter>>
```

The consistency is its greatest strength. A developer consuming this API cannot accidentally forget to handle the error path.

### ★★★★★ Type Safety (9/10)

All types use `readonly` and `ReadonlyArray<T>` throughout. There are no mutable arrays passed around the pipeline. The `ScanOptions` input type enforces immutability at the boundary. `NormalizedOptions` guarantees all optional fields are resolved. `ExpandedPatterns` provides a clean handoff between normalization and glob execution.

The `Result<T>` and `Option<T>` types are minimal but correctly designed — no heavy `fp-ts` dependency, just the discriminated union pattern applied where it matters.

### ★★★★☆ Performance Design (8/10)

**Dual discovery path is the key performance decision.** For git repos, `git ls-files -c -o --exclude-standard` is dramatically faster than a recursive glob walk because git already has an indexed view of the repository. This is the same strategy used by VS Code's file watchers and ESLint's file discovery in large monorepos.

Additional performance considerations:
- `Set`-based deduplication is O(n) — correct choice
- `Set`-based extension lookup in `filterByExtension` — correct choice
- `getRepoFingerprint()` uses git HEAD + index mtime, not a full directory hash — cheap check
- Cache short-circuits the entire pipeline (normalization and pattern expansion still run, but discovery and filtering are skipped)

### ★★★★☆ Test Coverage (8/10)

8 test files, one per module. Every module has its own spec. Mocking strategy is correct — `child_process.exec`, `fs/promises`, and `tinyglobby.glob` are all mocked at the module boundary, so tests are fast and deterministic.

Notable coverage:
- Git repo detection, git discovery, and fingerprinting are all separately tested
- Gitignore filter behavior (keep vs. ignore) is tested
- `applyFilters` integration test exercises the combined pipeline
- Division-by-zero guard in `calculateSummary` is explicitly tested
- Cache integration is tested in `scan.test.ts`

### ★★★★☆ Caching Strategy (8/10)

The cache key formula `rootDir + patterns + git fingerprint + version` covers the four most important invalidation scenarios:
- Config change (patterns change)
- Code change (git HEAD changes)
- File system change without commit (git index mtime changes)
- Tool upgrade (version string changes)

This is more sophisticated than most file-discovery caches, which typically only invalidate on config change.

---

## Weaknesses / Disadvantages

### ★★★☆☆ `totalSize` is a Stub (3/10 for this feature)

```typescript
// stats.ts
export const calculateTotalSize = (files: ReadonlyArray<string>): number => {
    // TODO: Implement
    return 0;
};
```

`ScanStatistics.totalSize` is always `0`. This field is part of the public `ScanResult` API. Any consumer reading `stats.totalSize` gets silent incorrect data. A stub returning `0` is worse than an absent field because it implies completeness. Either implement it with `Promise.all(files.map(f => fs.stat(f)))` or remove the field from the public type until it is implemented.

### ★★★☆☆ `dot: false` Hardcoded in Glob Execution (4/10 for configurability)

```typescript
// glob.ts
const results = await glob(patterns.include, {
    cwd: rootDir,
    ignore: patterns.ignore,
    absolute: true,
    followSymbolicLinks: options.followSymlinks,
    onlyFiles: true,
    dot: false,   // ← hardcoded
});
```

`dot: false` silently excludes dotfiles and directories. Angular projects can have configuration files in `.angular/`, `.nx/`, or similar dotted directories. There is no way for a user to override this without modifying the source. The `ScanOptions` interface should include a `dot?: boolean` field and pass it through.

### ★★★☆☆ No Cache for Non-Git Repos (5/10 for caching completeness)

The cache is entirely gated behind `isGitRepo()`. Projects not using git — monorepo tools that use a different VCS, or CI containers that check out without git metadata — get no caching at all. The cache key for non-git repos could use a different fingerprinting strategy (e.g., hash of directory mtime from a depth-limited stat, or an explicit content hash of matched files).

### ★★★☆☆ `rootDir` Existence Not Validated Before Scanning (5/10)

`normalizeOptions` resolves `rootDir` to an absolute path but never checks that the directory actually exists on disk. If a non-existent directory is passed, the error surfaces deep in `executeGlob` or `isGitRepo` as an OS-level error, with no user-friendly message pointing to the root cause. An early existence check in `validateOptions` would give a clear error immediately.

### ★★★☆☆ `maxBuffer: 10MB` Hardcoded in Git Discovery (5/10)

```typescript
// git.ts
exec('git ls-files -c -o --exclude-standard', { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 }
```

For very large repos (e.g., a monorepo with 100,000+ tracked files), 10MB may not be sufficient. The path list alone at average 60 chars/file reaches 10MB at ~170,000 files. This should either be configurable or replaced with `execFile` using streaming output.

### ★★★☆☆ Pattern Validation is Minimal (5/10)

```typescript
// patterns.ts
export const isValidPattern = (pattern: string): boolean => {
    if (!pattern || !pattern.trim()) return false;
    if (pattern.includes('***')) return false;
    return true;
};
```

Only two checks: empty string and triple-star. The config package's `globs.ts` health check runs minimatch dry-runs, checks for unclosed brackets, and detects trailing slashes. The scanner validates far less. Since the scanner is the runtime consumer of these patterns, invalid patterns that slip through cause silent empty results rather than clear errors.

### ★★★☆☆ No Documentation (5/10)

There is no `README.md` in the package directory, no JSDoc on any exported function, and no inline comments explaining non-obvious decisions (e.g., why `git ls-files -c -o --exclude-standard` uses those three flags, why `dot: false`, why 10MB buffer). The `index.ts` exports ~20 functions without descriptions. A developer integrating this package has to read every source file to understand the API.

### ★★★☆☆ No Streaming / Progress Events for Large Scans (4/10)

The scanner accumulates the entire file list in memory before returning. For repos with tens of thousands of files, there is no way to get incremental progress. No `onFile` callback, no `EventEmitter`, no `AsyncIterable<string>` path. This limits the scanner's usability in interactive CLI contexts where a progress bar would improve UX.

---

## Comparison with Other File Discovery Tools

| Tool | Discovery Strategy | Caching | Gitignore | Error Handling | Configurability | Score |
|---|---|---|---|---|---|---|
| **@ngcompass/scanner** | Git + Glob dual-path | ★★★★☆ | ★★★★★ | ★★★★★ | ★★★☆☆ | **7.8** |
| **fast-glob** | Glob only | None | Manual | Throws | ★★★★★ | 6.5 |
| **tinyglobby** | Glob only | None | Manual | Throws | ★★★★☆ | 6.0 |
| **ESLint file discovery** | Glob + ignore | None | ★★★★★ | ★★★★☆ | ★★★★★ | 7.5 |
| **Prettier file finding** | Glob + ignore | None | ★★★★★ | ★★★★☆ | ★★★★☆ | 7.0 |
| **TypeScript project resolver** | tsconfig globs | None | None | ★★★★★ | ★★★★★ | 7.0 |
| **Nx affected files** | Git + affected graph | ★★★★★ | ★★★★☆ | ★★★★☆ | ★★★★★ | 8.5 |
| **Angular CLI builder** | Webpack glob | None | None | ★★★★☆ | ★★★★☆ | 6.5 |

> **@ngcompass/scanner sits above fast-glob and tinyglobby** due to the git fast-path, built-in caching, and Result-based error handling. The gap behind Nx's affected-file system is the lack of dependency graph awareness — Nx only rescans changed files, not all files.

---

## Suggestions (Priority Order)

### 1. Remove or implement `totalSize`

Either implement it properly or remove the field from `ScanStatistics` until it is ready. A silent `0` breaks consumer trust in the statistics object.

**Implementation path:**
```typescript
// stats.ts
export const calculateTotalSize = async (files: ReadonlyArray<string>): Promise<number> => {
    const stats = await Promise.allSettled(files.map(f => fs.stat(f)));
    return stats.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.size : 0), 0);
};
```

### 2. Expose `dot` as a `ScanOptions` field

```typescript
interface ScanOptions {
    // ...existing fields...
    readonly dot?: boolean;  // default: false — whether to include dotfiles
}
```

Pass it through to the tinyglobby call. This unblocks scanning `.angular/`, `.nx/`, and similar directories.

### 3. Add `rootDir` existence validation

```typescript
// normalize.ts
export const validateOptions = (options: ScanOptions): ReadonlyArray<string> => {
    const errors: string[] = [];
    if (!options.rootDir?.trim()) errors.push('rootDir must not be empty');
    else if (!fs.existsSync(path.resolve(options.rootDir))) {
        errors.push(`rootDir does not exist: ${options.rootDir}`);
    }
    // ...existing checks...
    return errors;
};
```

### 4. Fallback cache for non-git repos

Compute a lightweight fingerprint for non-git repos using directory mtime:

```typescript
const getDirectoryFingerprint = async (dir: string): Promise<string> => {
    const stat = await fs.stat(dir);
    return `mtime-${stat.mtimeMs}`;
};
```

This is not as precise as the git fingerprint but prevents unnecessary re-scans on repeated CLI invocations without any file changes.

### 5. Make `maxBuffer` configurable or stream `git ls-files`

Replace:
```typescript
exec('git ls-files ...', { maxBuffer: 10 * 1024 * 1024 })
```

With a streaming approach using `spawn`:
```typescript
const child = spawn('git', ['ls-files', '-c', '-o', '--exclude-standard'], { cwd: rootDir });
const files: string[] = [];
child.stdout.setEncoding('utf8');
for await (const chunk of child.stdout) {
    files.push(...chunk.split('\n').filter(Boolean));
}
```

This removes the buffer limit entirely and reduces peak memory for large repos.

### 6. Add pattern validation parity with the config health checks

The config package runs minimatch dry-runs on patterns. The scanner should run the same validation before passing patterns to tinyglobby, returning `Err(...)` with a clear message rather than silently matching zero files.

### 7. Add an `AsyncIterable<string>` streaming API

Alongside the existing `scan()` function, expose a streaming variant:

```typescript
export const scanStream = (options: ScanOptions): AsyncIterable<string>
```

This enables progress bars, early termination, and lower memory usage for large repos — all without breaking the existing `scan()` API.

### 8. Write a package README

Document:
- What the package does and when to use it
- `ScanOptions` field-by-field
- `ScanResult` interpretation
- Why two discovery paths exist (git vs. glob)
- Cache behavior and invalidation conditions

---

## Summary

```
Architecture / Module Design      ★★★★★  9/10  — Single-responsibility modules, clean pipeline
Error Handling                    ★★★★★  9/10  — Consistent Result<T>, no unhandled throws
Type Safety                       ★★★★★  9/10  — Full readonly, discriminated unions
Performance Design                ★★★★☆  8/10  — Git fast-path + caching is the right strategy
Test Coverage                     ★★★★☆  8/10  — 8 spec files, good mock discipline
Caching Strategy                  ★★★★☆  8/10  — Multi-factor git fingerprint key
Cross-Platform Support            ★★★★☆  7/10  — Backslash normalization, but dot: false hardcoded
Debug / Observability             ★★★★☆  7/10  — ScanTimings present, but no progress events
Completeness / Production-Ready   ★★★☆☆  6/10  — totalSize stub, no non-git cache, no streaming
Documentation                     ★★★☆☆  5/10  — No README, no JSDoc, no inline rationale

OVERALL                           ★★★★☆  7.8 / 10
```

The core design decisions — dual discovery path, `Result<T>` error handling, immutable types, per-module test files — are all correct and production-quality. The gaps are in completeness: one stubbed feature (`totalSize`), one hardcoded value (`dot: false`), missing non-git caching, and absent documentation. None of these are architectural problems. They are all additive — fixing them does not require redesigning anything that already exists.
