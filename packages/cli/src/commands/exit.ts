/**
 * @fileoverview
 * Shared process-exit helpers for CLI command handlers.
 *
 * Every explicit process.exit() inside a command action must go through these
 * helpers so that:
 *  - The terminal cursor is always restored before exit (the spinner hides it).
 *  - Exit-code conventions are applied consistently across all commands.
 */

/** Restore the terminal cursor unconditionally (idempotent ANSI sequence). */
const restoreCursor = (): void => {
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
