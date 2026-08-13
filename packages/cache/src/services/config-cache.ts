import type { ConfigValidationResult } from '@ngcompass/common';
import type { AsyncDriver, ConfigCache } from '../models/index.js';

export const createConfigCache = (
  driver: AsyncDriver<ConfigValidationResult>
): ConfigCache => ({
  get: (hash) => driver.get(hash),
  set: (hash, report) => driver.set(hash, report),
});
