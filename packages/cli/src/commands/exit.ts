/**
 * @fileoverview
 * Shared exit / error-output helpers for CLI command handlers.
 *
 * Every explicit `process.exit()` inside a command action must go through these
 * helpers so that:
 *  - The terminal cursor is always restored before exit (the spinner hides it).
 *  - Exit-code conventions are applied consistently across all commands.
 *  - Error output is formatted the same way regardless of which command spoke.
 */

import pc from 'picocolors';

/** Restore the terminal cursor unconditionally (idempotent ANSI sequence). */
export const restoreCursor = (): void => {
    if (!process.stdout.isTTY) return;
    process.stdout.write('\x1B[?25h');
};

/**
 * Exit the process with a failure code, restoring the terminal cursor first.
 * Use this instead of bare `process.exit(1)` inside command action handlers.
 *
 * @param code - Exit code to use (defaults to 1).
 */
export const exitWithError = (code = 1): never => {
    restoreCursor();
    process.exit(code);
};

/**
 * Format an unknown thrown value as a single line of text.
 * Returns `error.message` for `Error` instances, otherwise the stringified value.
 */
const formatErrorDetail = (detail: unknown): string => {
    return detail instanceof Error ? detail.message : String(detail);
};

/**
 * Print a single-line error message in red to stderr.
 *
 * Use this for command-level error reporting where a full `Reporter` is not
 * available (everywhere outside `analyze`, plus the binary's signal handlers).
 * Routes through `console.error` so test spies can observe the call directly.
 *
 * @param message - Human-readable error summary.
 * @param detail - Optional underlying cause (Error or any value); appended after a colon.
 */
export const printError = (message: string, detail?: unknown): void => {
    const tail = detail === undefined ? '' : `: ${formatErrorDetail(detail)}`;
    console.error(`${pc.red(message)}${tail}`);
};
