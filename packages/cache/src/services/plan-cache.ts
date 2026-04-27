import { AsyncDriver } from '../drivers/types.js';

export interface PlanCache {
    get: (key: string) => Promise<unknown>;
    set: (key: string, plan: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
}

/**
 * Creates a Plan Cache.
 * Stores the entire built execution plan as a binary blob using V8 serialization.
 * Strategy: Persistent Disk Storage.
 * Key: Combined hash of files + rules.
 */
export const createPlanCache = (driver: AsyncDriver<unknown>): PlanCache => {
    return {
        get: (key) => driver.get(key),
        set: (key, plan) => driver.set(key, plan),
        delete: (key) => driver.delete(key),
    };
};
