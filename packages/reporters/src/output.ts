/**
 * ReporterOutput — Injectable Output Stream
 *
 * Abstracts process.stdout / process.stderr behind an interface so that
 * reporter implementations can be unit-tested without mocking globals.
 *
 * Usage in tests:
 * ```ts
 * const lines: string[] = [];
 * const mockOutput: ReporterOutput = {
 *   write: (l) => lines.push(l),
 *   error: (l) => lines.push(l),
 * };
 * const reporter = new ConsoleReporter(mockOutput);
 * reporter.report(fixtures);
 * expect(lines).toContain('✖ 1 problem (1 error, 0 warnings)');
 * ```
 *
 * Usage in production (default — no argument needed):
 * ```ts
 * const reporter = new ConsoleReporter(); // uses processOutput
 * ```
 */

import process from 'node:process';

// ============================================
// INTERFACE
// ============================================

/**
 * Minimal output surface for reporters.
 * Reporters write all their output through this interface.
 */
export interface ReporterOutput {
    /** Write a line to standard output */
    write(line: string): void;
    /** Write a line to standard error */
    error(line: string): void;
}

// ============================================
// DEFAULT IMPLEMENTATION
// ============================================

/**
 * Production output: writes to process.stdout / process.stderr.
 * Used as the default when no output is injected.
 */
export const processOutput: ReporterOutput = {
    write: (line: string) => process.stdout.write(line + '\n'),
    error: (line: string) => process.stderr.write(line + '\n'),
};
