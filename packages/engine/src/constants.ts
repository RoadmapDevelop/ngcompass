/**
 * @fileoverview
 * Defines engine-level constants and performance benchmarks for ngcompass.
 *
 * This module serves as the centralized source of truth for architectural
 * thresholds, concurrency limits, and performance budgets used across the
 * orchestration and execution layers.
 */

/**
 * The minimum number of tasks required to trigger parallel execution via the
 * worker thread pool. Below this threshold, local serial execution is preferred
 * to avoid orchestration overhead.
 */
export const WORKER_POOL_TASK_THRESHOLD = 150;

/**
 * The concurrency limit for local (non-worker) execution paths.
 */
export const LOCAL_CONCURRENCY_LIMIT = 4;

/**
 * The minimum number of worker threads to maintain in the execution pool,
 * ensuring availability regardless of the host system's CPU topology.
 */
export const MIN_WORKER_COUNT = 2;

/**
 * The refresh interval for the command-line interface progress visualization.
 */
export const SPINNER_FRAME_INTERVAL_MS = 80;

/**
 * Maximum wall-clock time a single worker thread is allowed to run before it
 * is forcibly terminated and its results replaced with empty failures.
 *
 * 60 seconds is intentionally generous — the timeout is a last-resort safety
 * net for hung workers (e.g. infinite loops or deadlocked TypeScript programs),
 * not a performance budget.
 */
export const WORKER_TIMEOUT_MS = 60_000;

/**
 * Performance Budgets:
 * Thresholds used to monitor and report execution efficiency.
 */

/**
 * The target execution time (p95) per file for rules that do not utilize
 * type-checking services.
 */
export const BUDGET_MS_PER_FILE_WITHOUT_TYPES = 2;

/**
 * The target execution time (p95) per file for rules requiring full
 * type-checking capabilities.
 */
export const BUDGET_MS_PER_FILE_WITH_TYPES = 5;

