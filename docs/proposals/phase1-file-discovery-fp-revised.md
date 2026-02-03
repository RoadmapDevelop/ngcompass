# Phase 1: File Discovery - FP-Aligned Implementation Plan

## Re-Evaluation Against FP Coding Guide

This document revises the original Phase 1 File Discovery plan to align with functional programming principles outlined in `fp-coding-guide.md`.

---

## Critical Changes from Original Plan

### ❌ **Original Approach (Object-Oriented)**
```typescript
export class FileScanner {
    private rootDir: string;
    private options: ScanOptions;

    constructor(options: ScanOptions) {
        this.rootDir = path.resolve(options.rootDir);
        this.options = options;
    }

    async scan(): Promise<ScanResult> {
        // Mutates state, depends on instance variables
    }
}
```

**Problems:**
- Uses classes with mutable state
- Methods depend on instance variables
- Not composable
- Hard to test individual steps

### ✅ **FP-Aligned Approach**
```typescript
// Pure functions that compose
export const scan = async (options: ScanOptions): Promise<ScanResult> =>
    pipe(
        normalizeOptions,
        expandPatterns,
        executeGlob,
        applyFilters,
        calculateStats
    )(options);
```

**Benefits:**
- Pure functions throughout
- No mutable state
- Each step is independently testable
- Easy to compose and extend

---

## Revised Architecture

### Functional Pipeline

```
Input: ScanOptions
   │
   ├─► normalize(options)           → NormalizedOptions
   │    - Resolve absolute paths
   │    - Sort patterns for caching
   │    - Apply defaults
   │
   ├─► expandPatterns(normalized)   → ExpandedPatterns
   │    - Convert patterns to glob format
   │    - Separate include/exclude
   │
   ├─► executeGlob(patterns)        → RawFileList
   │    - Run fast-glob (side effect isolated)
   │    - Return file paths
   │
   ├─► applyFilters(files, options) → FilteredFileList
   │    - Apply .gitignore
   │    - Apply ignorePatterns
   │    - Deduplicate
   │
   ├─► enrichWithMetadata(files)    → EnrichedFileList
   │    - Add file sizes (optional)
   │    - Calculate hashes (optional)
   │
   └─► calculateStats(files)        → ScanResult
        - Group by extension
        - Calculate totals
        - Return result
```

---

## Core Type Definitions

```typescript
// Result type for error handling
export type Result<T, E = Error> =
    | { ok: true; data: T }
    | { ok: false; error: E };

// Option type for nullable values
export type Option<T> = T | null | undefined;

// Core types
export interface ScanOptions {
    readonly rootDir: string;
    readonly include: ReadonlyArray<string>;
    readonly exclude: ReadonlyArray<string>;
    readonly ignorePatterns?: ReadonlyArray<string>;
    readonly respectGitignore?: boolean;
    readonly followSymlinks?: boolean;
}

export interface NormalizedOptions {
    readonly rootDir: string;
    readonly include: ReadonlyArray<string>;
    readonly exclude: ReadonlyArray<string>;
    readonly ignorePatterns: ReadonlyArray<string>;
    readonly respectGitignore: boolean;
    readonly followSymlinks: boolean;
}

export interface ScanResult {
    readonly files: ReadonlyArray<string>;
    readonly stats: ScanStatistics;
    readonly timestamp: number;
}

export interface ScanStatistics {
    readonly totalFiles: number;
    readonly byExtension: ReadonlyMap<string, number>;
    readonly totalSize: number;
    readonly scanTime: number;
}

// Internal types
interface ExpandedPatterns {
    readonly include: ReadonlyArray<string>;
    readonly ignore: ReadonlyArray<string>;
}

interface RawFileList {
    readonly files: ReadonlyArray<string>;
}

interface FilteredFileList {
    readonly files: ReadonlyArray<string>;
    readonly filtered: number;
}
```

---

## Pure Function Implementation

### 1. Options Normalization

```typescript
/**
 * Normalizes scan options by applying defaults and resolving paths.
 * Pure function - no side effects.
 */
export const normalizeOptions = (options: ScanOptions): NormalizedOptions => ({
    rootDir: path.resolve(options.rootDir),
    include: options.include.length > 0 ? options.include : ['**/*.ts'],
    exclude: options.exclude,
    ignorePatterns: options.ignorePatterns ?? [],
    respectGitignore: options.respectGitignore ?? true,
    followSymlinks: options.followSymlinks ?? false,
});

// Test: Always returns the same output for the same input
test('normalizeOptions is pure', () => {
    const options: ScanOptions = {
        rootDir: './src',
        include: ['**/*.ts'],
        exclude: ['node_modules/**']
    };

    const result1 = normalizeOptions(options);
    const result2 = normalizeOptions(options);

    expect(result1).toEqual(result2);
});
```

### 2. Pattern Expansion

```typescript
/**
 * Expands patterns into glob-compatible format.
 * Pure function - deterministic output.
 */
export const expandPatterns = (options: NormalizedOptions): ExpandedPatterns => {
    const normalizePattern = (pattern: string): string =>
        pattern.replace(/\\/g, '/');

    return {
        include: options.include.map(normalizePattern),
        ignore: [
            ...options.exclude.map(normalizePattern),
            ...options.ignorePatterns.map(normalizePattern)
        ]
    };
};

// Test: Deterministic
test('expandPatterns is deterministic', () => {
    const options: NormalizedOptions = {
        rootDir: '/project',
        include: ['src/**/*.ts'],
        exclude: ['node_modules/**'],
        ignorePatterns: ['**/*.spec.ts'],
        respectGitignore: true,
        followSymlinks: false
    };

    const result = expandPatterns(options);

    expect(result.include).toEqual(['src/**/*.ts']);
    expect(result.ignore).toContain('node_modules/**');
    expect(result.ignore).toContain('**/*.spec.ts');
});
```

### 3. Glob Execution (Isolated Side Effect)

```typescript
/**
 * Executes glob to find files.
 * Side effect: File system I/O
 * Isolated in a single function for testability.
 */
export const executeGlob = async (
    patterns: ExpandedPatterns,
    rootDir: string,
    options: { followSymlinks: boolean }
): Promise<Result<RawFileList>> => {
    try {
        const files = await fg(patterns.include, {
            cwd: rootDir,
            ignore: patterns.ignore,
            absolute: true,
            followSymbolicLinks: options.followSymlinks,
            onlyFiles: true,
            dot: false,
        });

        return { ok: true, data: { files } };
    } catch (error) {
        return { ok: false, error: error as Error };
    }
};

// Test: Mock fast-glob for pure testing
test('executeGlob returns Result type', async () => {
    const patterns: ExpandedPatterns = {
        include: ['**/*.ts'],
        ignore: ['node_modules/**']
    };

    const result = await executeGlob(patterns, '/project', { followSymlinks: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
        expect(Array.isArray(result.data.files)).toBe(true);
    }
});
```

### 4. Gitignore Filter (Pure with HOF)

```typescript
/**
 * Creates a gitignore filter function.
 * Higher-order function pattern.
 */
export const createGitignoreFilter = (
    gitignoreContent: string
): ((file: string, rootDir: string) => boolean) => {
    const ig = ignore().add(gitignoreContent);

    return (file: string, rootDir: string): boolean => {
        const relative = path.relative(rootDir, file);
        return !ig.ignores(relative);
    };
};

/**
 * Applies gitignore filtering to file list.
 * Pure function - returns new array.
 */
export const applyGitignoreFilter = (
    files: ReadonlyArray<string>,
    rootDir: string,
    gitignoreFilter: (file: string, rootDir: string) => boolean
): ReadonlyArray<string> =>
    files.filter(file => gitignoreFilter(file, rootDir));

// Test: Pure filtering
test('applyGitignoreFilter is pure', () => {
    const files = ['src/app.ts', 'node_modules/lib.ts', 'dist/bundle.js'];
    const filter = (file: string) => !file.includes('node_modules') && !file.includes('dist');

    const result = applyGitignoreFilter(files, '/project', filter);

    expect(result).toEqual(['src/app.ts']);
    expect(files).toHaveLength(3); // Original unchanged
});
```

### 5. File Filtering (Pure Composition)

```typescript
/**
 * Applies all filters to file list.
 * Pure function composition.
 */
export const applyFilters = async (
    rawFiles: RawFileList,
    options: NormalizedOptions
): Promise<Result<FilteredFileList>> => {
    try {
        let files = rawFiles.files;
        const startCount = files.length;

        // Apply gitignore if enabled
        if (options.respectGitignore) {
            const gitignoreContent = await loadGitignore(options.rootDir);
            if (gitignoreContent) {
                const filter = createGitignoreFilter(gitignoreContent);
                files = applyGitignoreFilter(files, options.rootDir, filter);
            }
        }

        // Deduplicate (pure operation)
        files = deduplicateFiles(files);

        return {
            ok: true,
            data: {
                files,
                filtered: startCount - files.length
            }
        };
    } catch (error) {
        return { ok: false, error: error as Error };
    }
};

/**
 * Deduplicates file paths.
 * Pure function.
 */
const deduplicateFiles = (files: ReadonlyArray<string>): ReadonlyArray<string> =>
    Array.from(new Set(files));

// Test: Pure deduplication
test('deduplicateFiles is pure', () => {
    const files = ['a.ts', 'b.ts', 'a.ts', 'c.ts'];
    const result = deduplicateFiles(files);

    expect(result).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(files).toHaveLength(4); // Original unchanged
});
```

### 6. Statistics Calculation (Pure)

```typescript
/**
 * Calculates statistics from file list.
 * Pure function - no side effects.
 */
export const calculateStats = (
    files: ReadonlyArray<string>,
    startTime: number
): ScanStatistics => {
    const byExtension = groupFilesByExtension(files);

    return {
        totalFiles: files.length,
        byExtension,
        totalSize: 0, // Size calculation is optional (requires I/O)
        scanTime: performance.now() - startTime
    };
};

/**
 * Groups files by extension.
 * Pure function using reduce.
 */
const groupFilesByExtension = (
    files: ReadonlyArray<string>
): ReadonlyMap<string, number> =>
    files.reduce((map, file) => {
        const ext = path.extname(file);
        const count = map.get(ext) ?? 0;
        return new Map(map).set(ext, count + 1);
    }, new Map<string, number>());

// Test: Pure grouping
test('groupFilesByExtension is pure', () => {
    const files = ['a.ts', 'b.ts', 'c.html', 'd.ts'];
    const result = groupFilesByExtension(files);

    expect(result.get('.ts')).toBe(3);
    expect(result.get('.html')).toBe(1);
});
```

### 7. Main Pipeline (Composition)

```typescript
/**
 * Main scan function - composes all steps.
 * Uses functional pipeline pattern.
 */
export const scan = async (options: ScanOptions): Promise<Result<ScanResult>> => {
    const startTime = performance.now();

    // Step 1: Normalize
    const normalized = normalizeOptions(options);

    // Step 2: Expand patterns
    const patterns = expandPatterns(normalized);

    // Step 3: Execute glob (side effect isolated)
    const rawResult = await executeGlob(patterns, normalized.rootDir, {
        followSymlinks: normalized.followSymlinks
    });

    if (!rawResult.ok) {
        return rawResult;
    }

    // Step 4: Apply filters
    const filteredResult = await applyFilters(rawResult.data, normalized);

    if (!filteredResult.ok) {
        return filteredResult;
    }

    // Step 5: Calculate stats
    const stats = calculateStats(filteredResult.data.files, startTime);

    // Return result
    return {
        ok: true,
        data: {
            files: filteredResult.data.files,
            stats,
            timestamp: Date.now()
        }
    };
};

// Usage
const result = await scan({
    rootDir: '/project',
    include: ['src/**/*.ts'],
    exclude: ['node_modules/**']
});

if (result.ok) {
    console.log(`Found ${result.data.stats.totalFiles} files`);
} else {
    console.error('Scan failed:', result.error.message);
}
```

---

## File Structure (FP-Aligned)

```
packages/core/src/scanner/
├── index.ts                 # Public API exports
├── types.ts                 # All type definitions
├── scan.ts                  # Main scan function
├── normalize.ts             # Options normalization
├── patterns.ts              # Pattern expansion
├── glob.ts                  # Glob execution (side effect)
├── filters.ts               # Filtering functions
├── stats.ts                 # Statistics calculation
├── gitignore.ts             # Gitignore handling
├── utils.ts                 # Pure utility functions
└── __tests__/
    ├── scan.test.ts
    ├── normalize.test.ts
    ├── patterns.test.ts
    ├── filters.test.ts
    └── stats.test.ts
```

---

## Comparison: OOP vs FP

| Aspect | Original (OOP) | Revised (FP) |
|--------|---------------|--------------|
| State | Mutable instance variables | Immutable data flow |
| Dependencies | Injected in constructor | Passed as parameters |
| Testing | Requires mocking class | Test functions directly |
| Composition | Method chaining | Function composition |
| Error Handling | Exceptions | Result types |
| Side Effects | Scattered throughout | Isolated in specific functions |
| Reusability | Inherit or wrap class | Compose functions |
| Predictability | Depends on instance state | Pure - same input = same output |

---

## Testing Strategy (FP-Friendly)

### Pure Function Tests

```typescript
describe('normalizeOptions', () => {
    it('applies defaults for missing options', () => {
        const input: ScanOptions = {
            rootDir: './src',
            include: [],
            exclude: []
        };

        const result = normalizeOptions(input);

        expect(result.include).toEqual(['**/*.ts']);
        expect(result.respectGitignore).toBe(true);
    });

    it('is deterministic', () => {
        const input: ScanOptions = {
            rootDir: './src',
            include: ['**/*.ts'],
            exclude: ['node_modules/**']
        };

        expect(normalizeOptions(input)).toEqual(normalizeOptions(input));
    });
});
```

### Composition Tests

```typescript
describe('scan pipeline', () => {
    it('composes all steps correctly', async () => {
        const options: ScanOptions = {
            rootDir: './fixtures/simple-project',
            include: ['**/*.ts'],
            exclude: ['node_modules/**']
        };

        const result = await scan(options);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.files.length).toBeGreaterThan(0);
            expect(result.data.stats.totalFiles).toBe(result.data.files.length);
        }
    });
});
```

### Property-Based Tests

```typescript
import fc from 'fast-check';

describe('deduplicateFiles properties', () => {
    it('always returns unique files', () => {
        fc.assert(
            fc.property(
                fc.array(fc.string()),
                (files) => {
                    const result = deduplicateFiles(files);
                    const unique = new Set(result);
                    return result.length === unique.size;
                }
            )
        );
    });

    it('preserves all unique items', () => {
        fc.assert(
            fc.property(
                fc.array(fc.string()),
                (files) => {
                    const result = deduplicateFiles(files);
                    const original = new Set(files);
                    return result.every(f => original.has(f));
                }
            )
        );
    });
});
```

---

## Key FP Principles Applied

### ✅ 1. Pure Functions
- All core logic is pure
- Same input always produces same output
- No hidden dependencies

### ✅ 2. Immutability
- All arrays are `ReadonlyArray`
- All objects are `readonly`
- Never mutate input data

### ✅ 3. Composition
- Small, focused functions
- Easy to combine and reuse
- Pipeline pattern for complex operations

### ✅ 4. Explicit Error Handling
- Use `Result` type instead of exceptions
- Errors are data, not control flow
- Type-safe error handling

### ✅ 5. Side Effect Isolation
- File I/O isolated in specific functions
- Clearly marked with `async` and Result types
- Easy to mock for testing

### ✅ 6. Higher-Order Functions
- `createGitignoreFilter` returns a filter function
- Enables flexible composition
- Easy to test and reuse

---

## Performance Considerations

The FP approach doesn't sacrifice performance:

1. **No unnecessary allocations** - Use generators where appropriate
2. **Lazy evaluation** - Don't load files until needed
3. **Parallel execution** - Promise.all for independent operations
4. **Efficient data structures** - Use Map and Set for lookups

```typescript
// Example: Parallel pattern expansion
const expandPatternsParallel = async (
    options: NormalizedOptions
): Promise<ExpandedPatterns> => {
    const [include, ignore] = await Promise.all([
        Promise.resolve(options.include.map(normalizePattern)),
        Promise.resolve([
            ...options.exclude.map(normalizePattern),
            ...options.ignorePatterns.map(normalizePattern)
        ])
    ]);

    return { include, ignore };
};
```

---

## Migration Path

1. **Week 1**: Implement core pure functions (normalize, expand, stats)
2. **Week 2**: Implement I/O functions with Result types (glob, gitignore)
3. **Week 3**: Compose into main pipeline, add comprehensive tests
4. **Week 4**: Optimize performance, add property-based tests

---

## Conclusion

This revised plan aligns with FP principles:

- ✅ Pure functions throughout
- ✅ Immutable data structures
- ✅ Explicit error handling with Result types
- ✅ Side effects isolated and clearly marked
- ✅ Easy to test without mocking
- ✅ Composable and reusable
- ✅ Predictable and deterministic

**Ready for implementation following FP best practices!**
