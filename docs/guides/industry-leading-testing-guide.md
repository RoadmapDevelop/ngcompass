# Industry-Leading Testing Guide for ngcompass

> **Goal:** Achieve 95%+ code coverage with meaningful, maintainable tests following functional programming principles and industry best practices.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Testing Philosophy](#testing-philosophy)
3. [Testing Architecture](#testing-architecture)
4. [Testing Strategies by Code Type](#testing-strategies-by-code-type)
5. [Test Structure & Organization](#test-structure--organization)
6. [Coverage Targets & Metrics](#coverage-targets--metrics)
7. [Property-Based Testing](#property-based-testing)
8. [Integration Testing](#integration-testing)
9. [Performance Testing](#performance-testing)
10. [CI/CD Integration](#cicd-integration)
11. [Best Practices & Patterns](#best-practices--patterns)
12. [Implementation Roadmap](#implementation-roadmap)

---

## Current State Analysis

### Existing Test Infrastructure

**Test Framework:** Vitest with:
- Global test functions (`describe`, `it`, `expect`)
- V8 coverage provider
- Node environment
- Coverage reporting (text, lcov, html)

**Current Test Files:**
```
packages/
├── cli/tests/setup.test.ts
├── common/tests/utils.test.ts
├── core/tests/
│   ├── cache/
│   │   ├── drivers/
│   │   │   ├── atomic.test.ts
│   │   │   ├── disk.test.ts
│   │   │   └── memory.test.ts
│   │   ├── index.test.ts
│   │   └── services/
│   │       ├── ast-cache.test.ts
│   │       ├── hashing.test.ts
│   │       ├── result-cache.test.ts
│   │       └── source-cache.test.ts
│   ├── config/
│   │   ├── cache.test.ts
│   │   ├── loader.test.ts
│   │   └── validator.test.ts
│   └── setup.test.ts
├── reporters/tests/setup.test.ts
└── rules/tests/setup.test.ts
```

**Strengths:**
✅ Property-based validation tests in `validator.test.ts` (563 lines)
✅ Comprehensive cache driver tests
✅ Mock context patterns for dependency injection
✅ Good separation of concerns

**Gaps:**
❌ No tests for newly implemented scanner module
❌ Missing integration tests
❌ No property-based testing library (fast-check)
❌ Limited performance benchmarks
❌ No mutation testing
❌ Coverage target not enforced

---

## Testing Philosophy

### Core Principles

1. **Tests Are Documentation**
   - Each test describes behavior in plain language
   - Test names serve as living documentation
   - Examples demonstrate intended usage

2. **Test Pure Functions Purely**
   - Pure functions → Simple assertions on outputs
   - No mocks, no spies, no stubs for pure logic
   - Test mathematical properties, not implementation

3. **Isolate Side Effects**
   - Mock only at I/O boundaries (fs, network)
   - Use dependency injection for testability
   - Create context objects for environment dependencies

4. **Property-Based Over Example-Based**
   - Use property-based testing for pure functions
   - Generate hundreds of test cases automatically
   - Find edge cases humans miss

5. **Test Behavior, Not Implementation**
   - Focus on public API contracts
   - Allow refactoring without breaking tests
   - Avoid testing internal implementation details

---

## Testing Architecture

### Three-Layer Testing Strategy

```
┌─────────────────────────────────────────────────────────┐
│ Layer 3: E2E / Integration Tests                       │
│ • Full CLI command execution                            │
│ • Real file system operations on fixtures               │
│ • Complete workflow validation                          │
│ • Performance benchmarks                                │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Module Integration Tests                       │
│ • Scanner → Parser → Rules pipeline                     │
│ • Config discovery → validation → caching               │
│ • Reporter generation with real data                    │
│ • Mock only external dependencies (fs)                  │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Unit Tests (Pure Functions)                    │
│ • Individual function behavior                          │
│ • Edge cases and error conditions                       │
│ • Property-based testing                                │
│ • No mocks for pure functions                           │
└─────────────────────────────────────────────────────────┘
```

---

## Testing Strategies by Code Type

### 1. Pure Functions (70% of codebase)

**Strategy:** Direct assertion testing + property-based testing

**Example: Testing `normalizePattern` (scanner/patterns.ts)**

```typescript
// packages/core/tests/scanner/patterns.test.ts
import { describe, it, expect } from 'vitest';
import { fc } from 'fast-check';
import {
    normalizePattern,
    expandPatterns,
    isValidPattern,
    validatePatterns
} from '../../src/scanner/patterns.js';

describe('normalizePattern (Pure Function)', () => {
    // Example-based tests for clarity
    it('should convert backslashes to forward slashes', () => {
        expect(normalizePattern('src\\app\\*.ts')).toBe('src/app/*.ts');
        expect(normalizePattern('lib\\**\\*.tsx')).toBe('lib/**/*.tsx');
    });

    it('should handle already normalized patterns', () => {
        expect(normalizePattern('src/app/*.ts')).toBe('src/app/*.ts');
    });

    it('should handle mixed slashes', () => {
        expect(normalizePattern('src\\app/component\\*.ts'))
            .toBe('src/app/component/*.ts');
    });

    // Property-based test: CRITICAL for pure functions
    it('should be idempotent (normalizing twice = normalizing once)', () => {
        fc.assert(
            fc.property(
                fc.string(), // Generate random strings
                (pattern) => {
                    const once = normalizePattern(pattern);
                    const twice = normalizePattern(once);
                    expect(once).toBe(twice);
                }
            )
        );
    });

    it('should always produce forward slashes only', () => {
        fc.assert(
            fc.property(
                fc.string(),
                (pattern) => {
                    const result = normalizePattern(pattern);
                    expect(result).not.toContain('\\');
                }
            )
        );
    });
});

describe('expandPatterns (Pure Function)', () => {
    it('should combine include and exclude patterns', () => {
        const input = {
            rootDir: '/project',
            include: ['src/**/*.ts', 'lib/**/*.tsx'],
            exclude: ['node_modules', 'dist'],
            ignorePatterns: ['**/*.min.js', '**/*.d.ts'],
            respectGitignore: true,
            followSymlinks: false,
        };

        const result = expandPatterns(input);

        expect(result).toEqual({
            include: ['src/**/*.ts', 'lib/**/*.tsx'],
            ignore: ['node_modules', 'dist', '**/*.min.js', '**/*.d.ts'],
        });
    });

    it('should normalize all patterns', () => {
        const input = {
            rootDir: '/project',
            include: ['src\\**\\*.ts'],
            exclude: ['node_modules\\**'],
            ignorePatterns: ['dist\\**'],
            respectGitignore: true,
            followSymlinks: false,
        };

        const result = expandPatterns(input);

        expect(result).toEqual({
            include: ['src/**/*.ts'],
            ignore: ['node_modules/**', 'dist/**'],
        });
    });

    // Property: Output length = sum of exclude + ignorePatterns
    it('should have ignore length = exclude + ignorePatterns', () => {
        fc.assert(
            fc.property(
                fc.array(fc.string()), // exclude
                fc.array(fc.string()), // ignorePatterns
                (exclude, ignorePatterns) => {
                    const input = {
                        rootDir: '/test',
                        include: ['**/*.ts'],
                        exclude,
                        ignorePatterns,
                        respectGitignore: false,
                        followSymlinks: false,
                    };

                    const result = expandPatterns(input);
                    expect(result.ignore.length).toBe(
                        exclude.length + ignorePatterns.length
                    );
                }
            )
        );
    });
});

describe('isValidPattern (Pure Function)', () => {
    // Example-based edge cases
    it('should reject empty patterns', () => {
        expect(isValidPattern('')).toBe(false);
        expect(isValidPattern('   ')).toBe(false);
    });

    it('should reject triple-star patterns', () => {
        expect(isValidPattern('***/*.ts')).toBe(false);
        expect(isValidPattern('src/***/file.ts')).toBe(false);
    });

    it('should accept valid glob patterns', () => {
        expect(isValidPattern('src/**/*.ts')).toBe(true);
        expect(isValidPattern('**/*.{ts,tsx}')).toBe(true);
        expect(isValidPattern('lib/*.js')).toBe(true);
    });

    // Property: Non-empty without *** = valid
    it('should return true for non-empty strings without triple-star', () => {
        fc.assert(
            fc.property(
                fc.string().filter(s => s.trim() !== '' && !s.includes('***')),
                (pattern) => {
                    expect(isValidPattern(pattern)).toBe(true);
                }
            )
        );
    });
});

describe('validatePatterns (Pure Function)', () => {
    it('should separate valid and invalid patterns', () => {
        const patterns = ['src/**/*.ts', '', '***/*.js', 'lib/*.tsx', '   '];

        const [valid, errors] = validatePatterns(patterns);

        expect(valid).toEqual(['src/**/*.ts', 'lib/*.tsx']);
        expect(errors).toHaveLength(3);
        expect(errors).toContain('Invalid pattern: ""');
        expect(errors).toContain('Invalid pattern: "***/*.js"');
        expect(errors).toContain('Invalid pattern: "   "');
    });

    it('should preserve order of valid patterns', () => {
        const patterns = ['z.ts', 'a.ts', 'm.ts'];
        const [valid] = validatePatterns(patterns);
        expect(valid).toEqual(['z.ts', 'a.ts', 'm.ts']);
    });

    // Property: valid count + error count = input count
    it('should account for all patterns (valid + errors = total)', () => {
        fc.assert(
            fc.property(
                fc.array(fc.string()),
                (patterns) => {
                    const [valid, errors] = validatePatterns(patterns);
                    expect(valid.length + errors.length).toBe(patterns.length);
                }
            )
        );
    });
});
```

---

### 2. Result Type Functions (Error Handling)

**Strategy:** Test both success and error paths explicitly

**Example: Testing `executeGlob` (scanner/glob.ts)**

```typescript
// packages/core/tests/scanner/glob.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeGlob } from '../../src/scanner/glob.js';
import fs from 'fs/promises';
import path from 'path';

describe('executeGlob (Side Effect - Isolated)', () => {
    const testDir = path.join(__dirname, '.test-fixtures');

    beforeEach(async () => {
        // Setup test fixture directory
        await fs.mkdir(testDir, { recursive: true });
        await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'dist'), { recursive: true });

        // Create test files
        await fs.writeFile(path.join(testDir, 'src', 'app.ts'), 'content');
        await fs.writeFile(path.join(testDir, 'src', 'utils.ts'), 'content');
        await fs.writeFile(path.join(testDir, 'dist', 'bundle.js'), 'content');
    });

    afterEach(async () => {
        // Cleanup
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Success Path (Result.ok = true)', () => {
        it('should find matching files', async () => {
            const patterns = {
                include: ['**/*.ts'],
                ignore: ['dist/**'],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toHaveLength(2);
                expect(result.data.files).toContain(
                    path.join(testDir, 'src', 'app.ts')
                );
                expect(result.data.files).toContain(
                    path.join(testDir, 'src', 'utils.ts')
                );
            }
        });

        it('should respect ignore patterns', async () => {
            const patterns = {
                include: ['**/*'],
                ignore: ['dist/**', '**/*.js'],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
                expect(result.data.files.every(f => !f.endsWith('.js'))).toBe(true);
            }
        });

        it('should return empty array when no files match', async () => {
            const patterns = {
                include: ['**/*.java'],
                ignore: [],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
            }
        });
    });

    describe('Error Path (Result.ok = false)', () => {
        it('should handle non-existent directory', async () => {
            const patterns = {
                include: ['**/*.ts'],
                ignore: [],
            };

            const result = await executeGlob(
                patterns,
                '/absolutely/non/existent/path/12345',
                { followSymlinks: false }
            );

            // Glob may not fail for non-existent paths (returns empty),
            // but we test the error handling mechanism
            expect(result.ok).toBe(true); // fast-glob returns empty for missing dirs
            if (result.ok) {
                expect(result.data.files).toEqual([]);
            }
        });
    });

    describe('Result Type Properties', () => {
        it('should never return both ok=true and error', async () => {
            const patterns = { include: ['**/*.ts'], ignore: [] };
            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            if (result.ok) {
                expect('error' in result).toBe(false);
                expect('data' in result).toBe(true);
            } else {
                expect('data' in result).toBe(false);
                expect('error' in result).toBe(true);
            }
        });
    });
});
```

---

### 3. Higher-Order Functions (HOF)

**Strategy:** Test the factory function and the returned function separately

**Example: Testing `createGitignoreFilter` (scanner/gitignore.ts)**

```typescript
// packages/core/tests/scanner/gitignore.test.ts
import { describe, it, expect } from 'vitest';
import { fc } from 'fast-check';
import {
    createGitignoreFilter,
    createPassThroughFilter,
    loadAndCreateGitignoreFilter,
} from '../../src/scanner/gitignore.js';
import path from 'path';
import fs from 'fs/promises';

describe('createGitignoreFilter (Higher-Order Function)', () => {
    describe('Factory Function Behavior', () => {
        it('should create a filter function from gitignore content', () => {
            const content = 'node_modules/\n*.log\ndist/';
            const filter = createGitignoreFilter(content);

            expect(typeof filter).toBe('function');
            expect(filter.length).toBe(2); // Takes (file, rootDir)
        });

        it('should create different filter functions for different content', () => {
            const filter1 = createGitignoreFilter('*.log');
            const filter2 = createGitignoreFilter('*.tmp');

            expect(filter1).not.toBe(filter2);
        });
    });

    describe('Returned Filter Function Behavior', () => {
        it('should filter files matching gitignore patterns', () => {
            const content = 'node_modules/\n*.log\ndist/';
            const filter = createGitignoreFilter(content);
            const rootDir = '/project';

            expect(filter('/project/src/app.ts', rootDir)).toBe(true); // Not ignored
            expect(filter('/project/node_modules/lib.js', rootDir)).toBe(false); // Ignored
            expect(filter('/project/debug.log', rootDir)).toBe(false); // Ignored
            expect(filter('/project/dist/bundle.js', rootDir)).toBe(false); // Ignored
        });

        it('should handle nested directories', () => {
            const content = 'build/';
            const filter = createGitignoreFilter(content);
            const rootDir = '/project';

            expect(filter('/project/src/app.ts', rootDir)).toBe(true);
            expect(filter('/project/build/index.js', rootDir)).toBe(false);
            expect(filter('/project/src/build/test.ts', rootDir)).toBe(false);
        });

        it('should handle wildcard patterns', () => {
            const content = '*.min.js\n*.map';
            const filter = createGitignoreFilter(content);
            const rootDir = '/app';

            expect(filter('/app/src/app.js', rootDir)).toBe(true);
            expect(filter('/app/dist/bundle.min.js', rootDir)).toBe(false);
            expect(filter('/app/dist/app.js.map', rootDir)).toBe(false);
        });

        it('should handle negation patterns', () => {
            const content = '*.log\n!important.log';
            const filter = createGitignoreFilter(content);
            const rootDir = '/logs';

            expect(filter('/logs/debug.log', rootDir)).toBe(false);
            expect(filter('/logs/important.log', rootDir)).toBe(true); // Not ignored due to !
        });

        it('should handle comment lines', () => {
            const content = '# This is a comment\nnode_modules/\n# Another comment\n*.log';
            const filter = createGitignoreFilter(content);
            const rootDir = '/project';

            expect(filter('/project/src/app.ts', rootDir)).toBe(true);
            expect(filter('/project/node_modules/lib.js', rootDir)).toBe(false);
        });

        it('should handle empty content', () => {
            const filter = createGitignoreFilter('');
            const rootDir = '/project';

            expect(filter('/project/src/app.ts', rootDir)).toBe(true);
            expect(filter('/project/any/file.js', rootDir)).toBe(true);
        });
    });

    describe('Property-Based Tests', () => {
        it('should always return boolean', () => {
            fc.assert(
                fc.property(
                    fc.string(), // gitignore content
                    fc.string(), // file path
                    fc.string(), // root dir
                    (content, file, rootDir) => {
                        const filter = createGitignoreFilter(content);
                        const result = filter(file, rootDir);
                        expect(typeof result).toBe('boolean');
                    }
                )
            );
        });

        it('should be deterministic (same inputs = same output)', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.string(),
                    fc.string(),
                    (content, file, rootDir) => {
                        const filter = createGitignoreFilter(content);
                        const result1 = filter(file, rootDir);
                        const result2 = filter(file, rootDir);
                        expect(result1).toBe(result2);
                    }
                )
            );
        });
    });
});

describe('createPassThroughFilter', () => {
    it('should always return true (allows all files)', () => {
        const filter = createPassThroughFilter();

        expect(filter('/any/file.ts', '/any')).toBe(true);
        expect(filter('/node_modules/lib.js', '/')).toBe(true);
        expect(filter('', '')).toBe(true);
    });

    it('should be a valid GitignoreFilter type', () => {
        const filter = createPassThroughFilter();
        expect(typeof filter).toBe('function');
        expect(filter.length).toBe(2);
    });
});

describe('loadAndCreateGitignoreFilter (Side Effect + HOF)', () => {
    const testDir = path.join(__dirname, '.test-gitignore');

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should load .gitignore and create filter', async () => {
        const gitignorePath = path.join(testDir, '.gitignore');
        await fs.writeFile(gitignorePath, 'node_modules/\n*.log');

        const result = await loadAndCreateGitignoreFilter(testDir);

        expect(result.ok).toBe(true);
        if (result.ok) {
            const filter = result.data;
            expect(filter(path.join(testDir, 'src/app.ts'), testDir)).toBe(true);
            expect(filter(path.join(testDir, 'node_modules/lib.js'), testDir)).toBe(false);
        }
    });

    it('should return pass-through filter when no .gitignore exists', async () => {
        const result = await loadAndCreateGitignoreFilter(testDir);

        expect(result.ok).toBe(true);
        if (result.ok) {
            const filter = result.data;
            expect(filter(path.join(testDir, 'any/file.ts'), testDir)).toBe(true);
        }
    });

    it('should handle read errors gracefully', async () => {
        const result = await loadAndCreateGitignoreFilter('/non/existent/path/12345');

        // Should return pass-through filter or error
        expect(result.ok).toBe(true); // Likely returns pass-through
    });
});
```

---

### 4. Function Composition (Pipeline)

**Strategy:** Test the pipeline as a whole + individual steps

**Example: Testing `scan` (scanner/scan.ts)**

```typescript
// packages/core/tests/scanner/scan.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scan } from '../../src/scanner/scan.js';
import fs from 'fs/promises';
import path from 'path';

describe('scan (Pipeline Composition)', () => {
    const testDir = path.join(__dirname, '.test-scan');

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
        await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'dist'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });

        // Create test files
        await fs.writeFile(path.join(testDir, 'src', 'app.ts'), 'console.log("app")');
        await fs.writeFile(path.join(testDir, 'src', 'utils.ts'), 'export const add = (a, b) => a + b');
        await fs.writeFile(path.join(testDir, 'src', 'component.html'), '<div>Component</div>');
        await fs.writeFile(path.join(testDir, 'dist', 'bundle.js'), 'compiled code');
        await fs.writeFile(path.join(testDir, 'node_modules', 'lib.js'), 'library');

        // Create .gitignore
        await fs.writeFile(
            path.join(testDir, '.gitignore'),
            'node_modules/\ndist/\n*.log'
        );
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Complete Pipeline', () => {
        it('should discover files matching include patterns', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toHaveLength(2);
                expect(result.data.files).toContain(path.join(testDir, 'src', 'app.ts'));
                expect(result.data.files).toContain(path.join(testDir, 'src', 'utils.ts'));
            }
        });

        it('should respect exclude patterns', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*'],
                exclude: ['dist/**', '*.js'],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
                expect(result.data.files.every(f => !f.endsWith('.js'))).toBe(true);
            }
        });

        it('should respect .gitignore when enabled', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*'],
                exclude: [],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should exclude node_modules and dist due to .gitignore
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
            }
        });

        it('should ignore .gitignore when disabled', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.js'],
                exclude: [],
                respectGitignore: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should include files from node_modules and dist
                const hasNodeModules = result.data.files.some(f =>
                    f.includes('node_modules')
                );
                const hasDist = result.data.files.some(f => f.includes('dist'));
                expect(hasNodeModules || hasDist).toBe(true);
            }
        });

        it('should support multiple include patterns', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts', '**/*.html'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toHaveLength(3); // 2 .ts + 1 .html
                expect(result.data.files).toContain(
                    path.join(testDir, 'src', 'component.html')
                );
            }
        });
    });

    describe('Statistics Generation', () => {
        it('should calculate file count statistics', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts', '**/*.html'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.stats.totalFiles).toBe(3);
                expect(result.data.stats.byExtension.get('.ts')).toBe(2);
                expect(result.data.stats.byExtension.get('.html')).toBe(1);
            }
        });

        it('should measure scan time', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.stats.scanTime).toBeGreaterThan(0);
                expect(result.data.stats.scanTime).toBeLessThan(5000); // Should be fast
            }
        });

        it('should include timestamp', async () => {
            const before = Date.now();
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });
            const after = Date.now();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.timestamp).toBeGreaterThanOrEqual(before);
                expect(result.data.timestamp).toBeLessThanOrEqual(after);
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty result set gracefully', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.java'], // No Java files
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
                expect(result.data.stats.totalFiles).toBe(0);
            }
        });

        it('should handle non-existent rootDir', async () => {
            const result = await scan({
                rootDir: '/absolutely/non/existent/path/12345',
                include: ['**/*.ts'],
                exclude: [],
            });

            // May return empty or error depending on implementation
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
            }
        });

        it('should deduplicate files found multiple times', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts', 'src/**/*.ts'], // Overlapping patterns
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should not have duplicates
                const unique = new Set(result.data.files);
                expect(unique.size).toBe(result.data.files.length);
            }
        });
    });

    describe('Default Values', () => {
        it('should use default include patterns when empty', async () => {
            const result = await scan({
                rootDir: testDir,
                include: [], // Empty should use defaults
                exclude: [],
            });

            expect(result.ok).toBe(true);
            // Should use defaults: ['**/*.ts', '**/*.html']
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);
            }
        });

        it('should default respectGitignore to true', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.js'],
                exclude: [],
                // respectGitignore not specified
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should exclude node_modules due to .gitignore
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
            }
        });
    });
});
```

---

### 5. Immutable Data Structures

**Strategy:** Verify no mutation occurs

```typescript
// packages/core/tests/scanner/stats.test.ts
import { describe, it, expect } from 'vitest';
import { groupFilesByExtension, calculateStats } from '../../src/scanner/stats.js';

describe('groupFilesByExtension (Immutability)', () => {
    it('should not mutate input array', () => {
        const files = ['/app/src/app.ts', '/app/lib/utils.ts'];
        const original = [...files];

        groupFilesByExtension(files);

        expect(files).toEqual(original);
    });

    it('should return new Map each time', () => {
        const files = ['/app/src/app.ts'];

        const map1 = groupFilesByExtension(files);
        const map2 = groupFilesByExtension(files);

        expect(map1).not.toBe(map2); // Different instances
        expect(map1).toEqual(map2); // Same content
    });

    it('should handle files without extensions', () => {
        const files = ['/app/README', '/app/LICENSE'];
        const result = groupFilesByExtension(files);

        expect(result.get('.no-extension')).toBe(2);
    });

    it('should count files by extension correctly', () => {
        const files = [
            '/app/src/app.ts',
            '/app/src/utils.ts',
            '/app/lib/component.tsx',
            '/app/styles/main.css',
            '/app/README',
        ];

        const result = groupFilesByExtension(files);

        expect(result.get('.ts')).toBe(2);
        expect(result.get('.tsx')).toBe(1);
        expect(result.get('.css')).toBe(1);
        expect(result.get('.no-extension')).toBe(1);
    });
});

describe('calculateStats (Immutability)', () => {
    it('should not mutate input array', () => {
        const files = ['/app/src/app.ts', '/app/lib/utils.ts'];
        const original = [...files];
        const startTime = performance.now();

        calculateStats(files, startTime, false);

        expect(files).toEqual(original);
    });

    it('should return consistent results for same inputs', () => {
        const files = ['/app/src/app.ts'];
        const startTime = 1000;

        const stats1 = calculateStats(files, startTime, false);
        const stats2 = calculateStats(files, startTime, false);

        expect(stats1.totalFiles).toBe(stats2.totalFiles);
        expect(stats1.cacheHit).toBe(stats2.cacheHit);
    });

    it('should calculate scan time correctly', () => {
        const files = ['/app/src/app.ts'];
        const startTime = performance.now() - 100; // 100ms ago

        const stats = calculateStats(files, startTime, false);

        expect(stats.scanTime).toBeGreaterThan(90);
        expect(stats.scanTime).toBeLessThan(200);
    });
});
```

---

## Property-Based Testing

### Installation

```bash
pnpm add -D fast-check
```

### Key Properties to Test

1. **Idempotence:** `f(f(x)) = f(x)`
2. **Commutativity:** `f(a, b) = f(b, a)`
3. **Associativity:** `f(f(a, b), c) = f(a, f(b, c))`
4. **Identity:** `f(x, identity) = x`
5. **Inverse:** `f(g(x)) = x`
6. **Invariants:** Properties that always hold

### Template for Property-Based Tests

```typescript
import { fc } from 'fast-check';

describe('FunctionName (Property-Based)', () => {
    it('property: description', () => {
        fc.assert(
            fc.property(
                fc.arbitraryType(), // Input generator
                (input) => {
                    const result = functionUnderTest(input);
                    expect(result).toSatisfySomeProperty();
                }
            ),
            { numRuns: 1000 } // Run 1000 random test cases
        );
    });
});
```

### Useful Arbitraries (Generators)

```typescript
// Primitives
fc.string()
fc.integer()
fc.float()
fc.boolean()
fc.constant(value)

// Collections
fc.array(fc.string())
fc.set(fc.integer())
fc.record({ name: fc.string(), age: fc.integer() })

// Constrained
fc.string({ minLength: 1, maxLength: 100 })
fc.integer({ min: 0, max: 100 })
fc.array(fc.string(), { minLength: 1 })

// File paths
fc.string().filter(s => !s.includes('\0'))
fc.array(fc.constantFrom('.ts', '.tsx', '.js', '.jsx')).map(exts =>
    `file${Math.random()}.${exts[0]}`
)

// Custom generators
const filePathArbitrary = fc.tuple(
    fc.constantFrom('src', 'lib', 'test'),
    fc.constantFrom('app.ts', 'utils.ts', 'component.tsx')
).map(([dir, file]) => `${dir}/${file}`);
```

---

## Integration Testing

### Module Integration Tests

Test how modules work together without mocking internal components.

```typescript
// packages/core/tests/integration/scanner-pipeline.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scan } from '../../src/scanner/index.js';
import fs from 'fs/promises';
import path from 'path';

describe('Scanner Pipeline Integration', () => {
    const fixtureDir = path.join(__dirname, '../fixtures/scanner-integration');

    beforeAll(async () => {
        // Create realistic project structure
        await fs.mkdir(path.join(fixtureDir, 'src/app'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'src/lib'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'test'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'dist'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'node_modules/lib'), { recursive: true });

        // Create files
        const files = [
            'src/app/app.component.ts',
            'src/app/app.module.ts',
            'src/lib/utils.ts',
            'src/lib/helpers.ts',
            'test/app.spec.ts',
            'dist/bundle.js',
            'node_modules/lib/index.js',
        ];

        for (const file of files) {
            await fs.writeFile(
                path.join(fixtureDir, file),
                `// Content for ${file}`
            );
        }

        // .gitignore
        await fs.writeFile(
            path.join(fixtureDir, '.gitignore'),
            'node_modules/\ndist/\n*.log\n.cache/'
        );
    });

    afterAll(async () => {
        await fs.rm(fixtureDir, { recursive: true, force: true });
    });

    it('should scan realistic Angular project structure', async () => {
        const result = await scan({
            rootDir: fixtureDir,
            include: ['**/*.ts'],
            exclude: ['**/*.spec.ts'],
            respectGitignore: true,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            // Should find source files, not test/dist/node_modules
            expect(result.data.files).toHaveLength(4);

            const filenames = result.data.files.map(f => path.basename(f));
            expect(filenames).toContain('app.component.ts');
            expect(filenames).toContain('app.module.ts');
            expect(filenames).toContain('utils.ts');
            expect(filenames).toContain('helpers.ts');
            expect(filenames).not.toContain('app.spec.ts');
        }
    });
});
```

---

## Performance Testing

### Benchmarking Critical Paths

```typescript
// packages/core/tests/performance/scanner.bench.ts
import { describe, bench } from 'vitest';
import { scan } from '../../src/scanner/index.js';
import path from 'path';

describe('Scanner Performance Benchmarks', () => {
    const largeProjectDir = path.join(__dirname, '../fixtures/large-project');

    // Run before benchmarks to create fixture
    // (Use beforeAll in actual implementation)

    bench('scan 1,000 files', async () => {
        await scan({
            rootDir: largeProjectDir,
            include: ['**/*.ts'],
            exclude: ['node_modules'],
            respectGitignore: false,
        });
    }, { iterations: 10, warmup: 2 });

    bench('scan with gitignore enabled', async () => {
        await scan({
            rootDir: largeProjectDir,
            include: ['**/*.ts'],
            exclude: [],
            respectGitignore: true,
        });
    }, { iterations: 10, warmup: 2 });

    bench('scan with complex patterns', async () => {
        await scan({
            rootDir: largeProjectDir,
            include: ['**/*.{ts,tsx,js,jsx}'],
            exclude: ['**/node_modules/**', '**/dist/**', '**/*.spec.*'],
            respectGitignore: true,
        });
    }, { iterations: 10, warmup: 2 });
});
```

### Performance Assertions

```typescript
it('should scan 10,000 files in under 1 second', async () => {
    const startTime = performance.now();

    await scan({
        rootDir: largeProjectDir,
        include: ['**/*.ts'],
        exclude: [],
    });

    const duration = performance.now() - startTime;
    expect(duration).toBeLessThan(1000);
});
```

---

## Coverage Targets & Metrics

### Coverage Configuration

```typescript
// vitest.config.ts (updated)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts', // Type definitions don't need coverage
        '**/index.ts', // Re-exports don't need high coverage
      ],
      // THRESHOLDS - Enforce minimum coverage
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
      // Report uncovered lines
      all: true,
    },
  },
});
```

### Coverage Targets by Module

| Module | Lines | Functions | Branches | Statements |
|--------|-------|-----------|----------|------------|
| **scanner/** | 95% | 95% | 90% | 95% |
| **config/** | 90% | 90% | 85% | 90% |
| **cache/** | 90% | 90% | 85% | 90% |
| **rules/** | 95% | 95% | 90% | 95% |
| **reporters/** | 85% | 85% | 80% | 85% |
| **cli/** | 80% | 80% | 75% | 80% |
| **common/** | 95% | 95% | 90% | 95% |

**Rationale:**
- Pure functions (scanner, rules, common): **95%** - Easy to test, critical logic
- Config/Cache: **90%** - Some I/O edge cases hard to cover
- Reporters: **85%** - Formatting/display logic, lower impact
- CLI: **80%** - User interface, integration-heavy

---

## Test Structure & Organization

### File Naming Convention

```
src/
└── scanner/
    ├── scan.ts
    ├── patterns.ts
    └── stats.ts

tests/
└── scanner/
    ├── scan.test.ts           # Unit + integration tests
    ├── patterns.test.ts       # Unit tests
    ├── stats.test.ts          # Unit tests
    └── __fixtures__/          # Test data
        └── sample-project/
```

### Test Structure Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { functionUnderTest } from '../../src/module/file.js';

describe('FunctionName', () => {
    // Setup/teardown if needed
    beforeEach(() => {
        // Reset state
    });

    afterEach(() => {
        // Cleanup
    });

    // Group tests by scenario
    describe('Happy Path', () => {
        it('should handle typical input', () => {
            expect(functionUnderTest('input')).toBe('output');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty input', () => {
            expect(functionUnderTest('')).toBe('');
        });

        it('should handle null', () => {
            expect(functionUnderTest(null)).toBe(null);
        });
    });

    describe('Error Handling', () => {
        it('should return error for invalid input', () => {
            const result = functionUnderTest('invalid');
            expect(result.ok).toBe(false);
        });
    });

    describe('Properties (Fast-Check)', () => {
        it('should maintain invariant X', () => {
            fc.assert(fc.property(fc.string(), (input) => {
                // Test invariant
            }));
        });
    });
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test & Coverage

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run linter
        run: pnpm lint

      - name: Run type check
        run: pnpm typecheck

      - name: Run tests
        run: pnpm test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella
          fail_ci_if_error: true

      - name: Check coverage thresholds
        run: |
          node scripts/check-coverage.js

  test-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run integration tests
        run: pnpm test:integration
```

### Coverage Threshold Checker

```javascript
// scripts/check-coverage.js
import fs from 'fs';

const coverageReport = JSON.parse(
    fs.readFileSync('./coverage/coverage-summary.json', 'utf8')
);

const thresholds = {
    lines: 90,
    functions: 90,
    branches: 85,
    statements: 90,
};

const total = coverageReport.total;
const failures = [];

for (const [metric, threshold] of Object.entries(thresholds)) {
    const actual = total[metric].pct;
    if (actual < threshold) {
        failures.push(`${metric}: ${actual}% < ${threshold}%`);
    }
}

if (failures.length > 0) {
    console.error('❌ Coverage thresholds not met:');
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
} else {
    console.log('✅ All coverage thresholds met!');
    console.log(`  Lines: ${total.lines.pct}%`);
    console.log(`  Functions: ${total.functions.pct}%`);
    console.log(`  Branches: ${total.branches.pct}%`);
    console.log(`  Statements: ${total.statements.pct}%`);
}
```

---

## Best Practices & Patterns

### 1. AAA Pattern (Arrange-Act-Assert)

```typescript
it('should calculate total from array', () => {
    // Arrange
    const numbers = [1, 2, 3, 4, 5];
    const expected = 15;

    // Act
    const result = sum(numbers);

    // Assert
    expect(result).toBe(expected);
});
```

### 2. Test One Thing Per Test

❌ **Bad:**
```typescript
it('should do everything', () => {
    expect(add(1, 2)).toBe(3);
    expect(subtract(5, 3)).toBe(2);
    expect(multiply(2, 3)).toBe(6);
});
```

✅ **Good:**
```typescript
it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
});

it('should subtract two numbers', () => {
    expect(subtract(5, 3)).toBe(2);
});
```

### 3. Descriptive Test Names

Use format: `should [expected behavior] when [condition]`

```typescript
it('should return empty array when input is empty', () => {});
it('should throw error when file does not exist', () => {});
it('should deduplicate items when array contains duplicates', () => {});
```

### 4. Avoid Test Interdependence

Each test should be independent and runnable in isolation.

❌ **Bad:**
```typescript
let sharedState;

it('test 1', () => {
    sharedState = { value: 10 };
});

it('test 2', () => {
    expect(sharedState.value).toBe(10); // Depends on test 1
});
```

✅ **Good:**
```typescript
it('test 1', () => {
    const state = { value: 10 };
    expect(state.value).toBe(10);
});

it('test 2', () => {
    const state = { value: 10 };
    expect(state.value).toBe(10);
});
```

### 5. Use Fixtures for Complex Data

```typescript
// tests/fixtures/sample-config.ts
export const validConfig = {
    include: ['src/**/*.ts'],
    exclude: ['node_modules'],
    failOnSeverity: 'high' as const,
    rules: { 'no-console': 'moderate' },
};

export const invalidConfig = {
    include: ['**/*.invalid['],
    // ...
};

// tests/config/validator.test.ts
import { validConfig, invalidConfig } from '../fixtures/sample-config.js';

it('should accept valid config', async () => {
    const result = await validateConfiguration(validConfig);
    expect(result.report.valid).toBe(true);
});
```

### 6. Mock Only External Dependencies

**Mock:** File system, network, time, random
**Don't Mock:** Your own pure functions

```typescript
// ✅ Good: Mock fs
import { vi } from 'vitest';
import fs from 'fs/promises';

vi.mock('fs/promises');

it('should handle file read error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await loadConfig('/path/to/config');
    expect(result.ok).toBe(false);
});
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)

- [x] Vitest configured with coverage thresholds
- [ ] Install fast-check
- [ ] Create test structure for scanner module
- [ ] Write unit tests for pure functions (patterns, normalize, stats)
- [ ] Achieve 95% coverage on scanner module

**Deliverables:**
- `packages/core/tests/scanner/*.test.ts` (7 files)
- Coverage report showing 95%+ for scanner module

---

### Phase 2: Property-Based Testing (Week 2)

- [ ] Add property-based tests for all pure functions
- [ ] Document property invariants in comments
- [ ] Create custom arbitraries for domain types
- [ ] Run 1000+ test cases per property

**Deliverables:**
- Property-based tests in all scanner test files
- Documentation of tested properties

---

### Phase 3: Integration Testing (Week 3)

- [ ] Create realistic project fixtures
- [ ] Write scanner pipeline integration tests
- [ ] Test config discovery + validation + caching flow
- [ ] Test reporter integration with real data

**Deliverables:**
- `packages/core/tests/integration/*.test.ts`
- Fixture projects in `tests/fixtures/`

---

### Phase 4: Performance & Benchmarks (Week 4)

- [ ] Create large project fixtures (10K+ files)
- [ ] Write performance benchmarks
- [ ] Establish baseline performance metrics
- [ ] Add performance assertions to prevent regression

**Deliverables:**
- Benchmark suite
- Performance documentation
- CI performance checks

---

### Phase 5: Coverage Enforcement (Week 5)

- [ ] Enable coverage thresholds in CI
- [ ] Add pre-commit coverage checks
- [ ] Create coverage badge for README
- [ ] Document untestable code with reasons

**Deliverables:**
- CI enforcing 90%+ coverage
- Coverage badge
- Coverage exclusion documentation

---

### Phase 6: Continuous Improvement (Ongoing)

- [ ] Add mutation testing with Stryker
- [ ] Implement visual regression testing for reporters
- [ ] Add E2E CLI tests with real Angular projects
- [ ] Regular coverage audits

---

## Mutation Testing (Advanced)

Mutation testing ensures your tests actually catch bugs by introducing mutations (bugs) and checking if tests fail.

### Setup

```bash
pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner
```

```javascript
// stryker.conf.js
export default {
    packageManager: 'pnpm',
    testRunner: 'vitest',
    coverageAnalysis: 'perTest',
    mutate: [
        'packages/*/src/**/*.ts',
        '!packages/*/src/**/*.test.ts',
        '!packages/*/src/types.ts',
    ],
    thresholds: { high: 80, low: 60, break: 50 },
};
```

Run with:
```bash
pnpm stryker run
```

---

## Success Metrics

### Quantitative Goals

- **Line Coverage:** 95% for pure functions, 90% overall
- **Function Coverage:** 95% for pure functions, 90% overall
- **Branch Coverage:** 90% for pure functions, 85% overall
- **Mutation Score:** 80%+ (measure test quality)
- **Test Execution Time:** < 30 seconds for full suite
- **Property Tests:** 1000+ cases per property
- **Zero Flaky Tests:** All tests deterministic

### Qualitative Goals

- Tests serve as documentation
- New contributors can understand code through tests
- Refactoring doesn't break tests (test behavior, not implementation)
- CI prevents regression with confidence
- Code reviews include test quality checks

---

## Industry Comparisons

### Leading Open Source Projects

| Project | Coverage | Test Strategy | Tools |
|---------|----------|---------------|-------|
| **TypeScript** | 95%+ | Unit + Integration + E2E | Mocha, Baseline tests |
| **ESLint** | 98%+ | Unit + Rule tests | Mocha, Custom rule tester |
| **Prettier** | 100% | Snapshot + Property | Jest, Fuzzing |
| **Jest** | 95%+ | Unit + Integration | Self-tested (dogfooding) |
| **Vitest** | 95%+ | Unit + Integration | Self-tested |

**ngcompass Target:** 95%+ coverage, property-based tests, integration tests, performance benchmarks

---

## Appendix: Quick Reference

### Test File Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fc } from 'fast-check';
import { functionUnderTest } from '../../src/module.js';

describe('FunctionName', () => {
    describe('Unit Tests', () => {
        it('should handle typical case', () => {
            expect(functionUnderTest('input')).toBe('output');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty input', () => {
            expect(functionUnderTest('')).toBe('');
        });
    });

    describe('Properties', () => {
        it('should maintain invariant X', () => {
            fc.assert(fc.property(fc.string(), (input) => {
                const result = functionUnderTest(input);
                expect(result).toSatisfyProperty();
            }));
        });
    });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch

# Run specific file
pnpm vitest packages/core/tests/scanner/scan.test.ts

# Run with UI
pnpm test:ui

# Update snapshots
pnpm vitest -u
```

### Vitest Assertions

```typescript
// Equality
expect(value).toBe(expected);           // ===
expect(value).toEqual(expected);        // Deep equality
expect(value).toStrictEqual(expected);  // Strict deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeDefined();
expect(value).toBeUndefined();
expect(value).toBeNull();

// Numbers
expect(value).toBeGreaterThan(n);
expect(value).toBeLessThan(n);
expect(value).toBeCloseTo(n, precision);

// Strings
expect(string).toContain(substring);
expect(string).toMatch(/regex/);

// Arrays
expect(array).toContain(item);
expect(array).toHaveLength(n);

// Objects
expect(obj).toHaveProperty('key', value);
expect(obj).toMatchObject({ subset });

// Errors
expect(() => fn()).toThrow();
expect(() => fn()).toThrow(Error);
expect(() => fn()).toThrow('message');

// Async
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow();
```

---

**End of Guide**

This comprehensive testing guide provides a complete roadmap to achieving industry-leading test quality for ngcompass. Follow the implementation roadmap, prioritize pure function testing with property-based approaches, and enforce coverage thresholds in CI to maintain high standards.
