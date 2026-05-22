/**
 * @fileoverview
 * Execution-plan cache.
 *
 * Persists the planner's built execution plan as a binary blob (V8
 * serialization handled by the underlying disk driver). Plan content is
 * intentionally typed as `unknown` here because the planner owns the plan
 * shape and re-validates it on load — the cache itself never inspects it.
 *
 * Key formula: combined hash of the file list and the rule set; see
 * `key-context.ts` for the exact derivation.
 */

import type { AsyncDriver } from '../drivers/types.js';

/** Read/write surface exposed to consumers. */
export interface PlanCache {
    get: (key: string) => Promise<unknown>;
    set: (key: string, plan: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
}

/**
 * Wraps an async driver as a {@link PlanCache}.
 *
 * @param driver - Backing async driver (typically the disk driver).
 * @returns A thin `PlanCache` proxy.
 */
export const createPlanCache = (driver: AsyncDriver<unknown>): PlanCache => ({
    get: (key) => driver.get(key),
    set: (key, plan) => driver.set(key, plan),
    delete: (key) => driver.delete(key),
});
