import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type { ConfigBlockValidation } from '../types.js';

export function validateDeprecatedFields(
  rawConfig: unknown,
  basePath: (string | number)[] = []
): ConfigBlockValidation {
  const issues: ConfigIssue[] = [];

  if (!rawConfig || typeof rawConfig !== 'object') {
    return { issues };
  }

  const config = rawConfig as Record<string, unknown>;

  if ('cacheLocation' in config && config.cacheLocation !== undefined) {
    issues.push({
      ...MESSAGES.DEPRECATED_CACHE_LOCATION,
      path: [...basePath, 'cacheLocation'],
    });
  }

  if ('concurrency' in config && config.concurrency !== undefined) {
    issues.push({
      ...MESSAGES.DEPRECATED_CONCURRENCY,
      path: [...basePath, 'concurrency'],
    });
  }

  return { issues };
}
