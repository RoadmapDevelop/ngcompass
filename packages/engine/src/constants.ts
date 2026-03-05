/**
 * Engine-level constants — single source of truth for all magic literals
 * scattered across orchestrator.ts, worker-pool.ts, runner.ts and single-pass-engine.ts.
 */

/** Minimum task count at which routing through the worker-thread pool pays off. */
export const WORKER_POOL_TASK_THRESHOLD = 150;

/** p-limit concurrency cap for local (non-worker-thread) file execution. */
export const LOCAL_CONCURRENCY_LIMIT = 4;

/** Minimum number of worker threads to spawn, regardless of CPU count. */
export const MIN_WORKER_COUNT = 2;

/** Refresh interval for the terminal spinner animation in milliseconds. */
export const SPINNER_FRAME_INTERVAL_MS = 80;

// ============================================
// PERFORMANCE BUDGETS  (ENGINE-006)
// Previously duplicated as local consts inside single-pass-engine.ts.
// Centralised here so any tuning is made in exactly one place.
// ============================================

/**
 * p95 per-file time budget (ms) for rules that do NOT require the TypeChecker.
 * Violations are recorded in `PerformanceReport.budgetViolations` and can be
 * asserted in CI (ENGINE-011).
 */
export const BUDGET_MS_PER_FILE_WITHOUT_TYPES = 2;

/**
 * p95 per-file time budget (ms) for rules that DO require the TypeChecker.
 */
export const BUDGET_MS_PER_FILE_WITH_TYPES = 5;

