/**
 * Engine-level constants — single source of truth for all magic literals
 * scattered across orchestrator.ts, worker-pool.ts, and runner.ts.
 */

/** Minimum task count at which routing through the worker-thread pool pays off. */
export const WORKER_POOL_TASK_THRESHOLD = 150;

/** p-limit concurrency cap for local (non-worker-thread) file execution. */
export const LOCAL_CONCURRENCY_LIMIT = 4;

/** Minimum number of worker threads to spawn, regardless of CPU count. */
export const MIN_WORKER_COUNT = 2;

/** Refresh interval for the terminal spinner animation in milliseconds. */
export const SPINNER_FRAME_INTERVAL_MS = 80;

