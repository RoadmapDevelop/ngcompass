import type { AsyncDriver, PlanCache } from '../models/index.js';

export const createPlanCache = (driver: AsyncDriver<unknown>): PlanCache => ({
  get: (key) => driver.get(key),
  set: (key, plan) => driver.set(key, plan),
  delete: (key) => driver.delete(key),
});
