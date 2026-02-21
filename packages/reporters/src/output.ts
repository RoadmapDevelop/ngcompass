import process from 'node:process';

/**
 * Core output abstraction used by every reporter.
 *
 * Why this interface exists:
 * - Decouples reporters from Node.js `process` globals.
 * - Enables deterministic unit tests via in-memory implementations.
 * - Opens the door to future output targets (files, network, IDE protocol).
 *
 * Contract:
 * - `write`  → standard output (stdout in the default implementation).
 * - `error`  → diagnostic / error output (stderr in the default implementation).
 * - Neither method should throw under normal operation.
 */
export interface ReporterOutput {
    write(line: string): void;
    error(line: string): void;
}

/**
 * Process-backed output singleton, wired to `process.stdout` / `process.stderr`.
 *
 * Why a singleton constant instead of a factory function:
 * - Reporters are created once per analysis run; a singleton avoids repeated
 *   allocation with identical behaviour.
 * - Makes the default explicit at call-sites without verbosity.
 *
 * Do NOT use in tests — use `createTestOutput()` for hermetic assertions.
 */
export const processOutput: ReporterOutput = {
    write(line: string): void {
        process.stdout.write(line + '\n');
    },

    error(line: string): void {
        process.stderr.write(line + '\n');
    },
};

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

/**
 * Captured output produced by a reporter under test.
 *
 * `lines`  — every call to `output.write()`
 * `errors` — every call to `output.error()`
 *
 * Arrays are live references; assertions can be made at any point after writes.
 */
export interface TestOutput {
    readonly output: ReporterOutput;
    readonly lines: readonly string[];
    readonly errors: readonly string[];
}

/**
 * Creates an in-memory output capture for use in unit tests.
 *
 * Usage:
 * ```typescript
 * const out = createTestOutput();
 * const reporter = new ConsoleReporter(out.output);
 * reporter.report(results);
 * expect(out.lines).toContain('...');
 * ```
 *
 * Call `createTestOutput()` in `beforeEach` to get a fresh capture per test,
 * preventing cross-test pollution.
 */
export function createTestOutput(): TestOutput {
    const lines: string[] = [];
    const errors: string[] = [];

    const output: ReporterOutput = {
        write(line: string): void { lines.push(line); },
        error(line: string): void { errors.push(line); },
    };

    return { output, lines, errors };
}