# Testing Guide

This guide outlines the testing strategy, tools, and best practices for the `ngcompass` project. We use **Vitest** for a fast, modern testing experience.

## Quick Start

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm exec vitest run packages/core

# Run specific test file
pnpm exec vitest run packages/core/tests/cache/index.test.ts

# Run with coverage
pnpm coverage
```

## Testing Philosophy

We employ a "Testing Pyramid" approach:

1.  **Unit Tests (Base)**: Isolate classes/functions. Mock dependencies. Fast and focused.
2.  **Integration Tests (Middle)**: Verify modules work together (e.g., Driver + Service). Real filesystems/databases often used (with cleanup).
3.  **End-to-End Tests (Top)**: (Future) CLI runs against real projects.

## Directory Structure

Tests are located in a top-level `tests` folder within each package, mirroring the `src` structure.

```
packages/core/
├── src/
│   └── cache/
│       ├── drivers/
│       └── services/
└── tests/
    └── cache/
        ├── drivers/   # Unit tests for drivers
        ├── services/  # Unit tests for services
        └── index.test.ts # Integration test for the module
```

## Techniques & Patterns

### 1. Mocking Dependencies
Use `vi.fn()` or `vi.mock()` to isolate the unit under test. This is crucial for verifying internal logic (like caching strategies) without side effects.

**Example: Testing "Promotion" logic in AST Cache**
```typescript
import { vi, describe, it, expect } from 'vitest';

const mockDisk = { get: vi.fn(), set: vi.fn() };
const astCache = createAstCache(memory, mockDisk);

it('should promote from disk to memory', async () => {
  // Simulate finding it on disk
  mockDisk.get.mockResolvedValue({ ... });
  
  await astCache.get('hash');
  
  // Verify it was written to memory
  expect(memory.get('hash')).toBeDefined();
});
```

### 2. Resilience Testing
Don't just test the "Happy Path". Test failures.
*   **Corruption**: Write invalid data to a file and ensure the reader handles it (e.g., returns `undefined` instead of crashing).
*   **Timeouts/Errors**: Mock rejected promises to ensure try/catch blocks work.

### 3. Filesystem Testing
When testing disk operations:
*   Use `path.resolve(__dirname, '.temp-test')` to create isolated folders.
*   **ALWAYS** clean up in `afterAll` or `afterEach`.

```typescript
const testPath = path.resolve(__dirname, '.tmp');

afterAll(() => {
    fs.rmSync(testPath, { recursive: true, force: true });
});
```

### 4. Time-Dependent Testing
Use fake timers or small timeouts for TTL (Time-To-Live) tests.

```typescript
it('should expire', async () => {
    cache.set('key', 'val');
    await new Promise(r => setTimeout(r, 20)); // Wait for TTL
    expect(cache.get('key')).toBeUndefined();
});
```

## Case Study: Caching System (`packages/core/src/cache`)

The caching system demonstrates our full testing spectrum:

*   **Drivers (`drivers/*.test.ts`)**: Verify that `memory` obeys strict LRU limits and `disk` correctly serializes V8 binary data.
*   **Services (`services/*.test.ts`)**: The `ast-cache` is tested with a **Mocked Disk Driver** to prove that it only reads from disk if memory is empty, and correctly promotes data.
*   **Integration (`index.test.ts`)**: A full "smoke test" that spins up the real `createCacheContext`, writes real files, and reads them back. This catches configuration errors that unit tests miss.
