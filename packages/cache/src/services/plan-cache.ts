import type { AsyncDriver } from '../drivers/types.js';

export interface PlanCache {
  get: (key: string) => Promise<unknown>;
  set: (key: string, plan: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

export const createPlanCache = (driver: AsyncDriver<unknown>): PlanCache => ({
  get: (key) => driver.get(key),
  set: (key, plan) => driver.set(key, plan),
  delete: (key) => driver.delete(key),
});
