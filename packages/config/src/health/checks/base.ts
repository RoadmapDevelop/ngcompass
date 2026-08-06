import { parseAngularVersion, type ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type {
  ConfigBlock,
  ConfigBlockValidation,
  ValidationContext,
} from '../types.js';

const LIMITS = {
  WORKERS_MIN: 1,
  WORKERS_CPU_MULTIPLIER: 2,
  CACHE_TTL_MIN: 0,
} as const;

export function validateConfigBlock(
  block: ConfigBlock,
  context: ValidationContext,
  basePath: (string | number)[] = []
): ConfigBlockValidation {
  const issues: ConfigIssue[] = [];

  if (block.maxWorkers !== undefined) {
    const cpuCores = context.os.cpus().length;
    const workerLimit = cpuCores * LIMITS.WORKERS_CPU_MULTIPLIER;

    if (block.maxWorkers < LIMITS.WORKERS_MIN) {
      issues.push({
        ...MESSAGES.WORKERS_BELOW_MINIMUM,
        path: [...basePath, 'maxWorkers'],
      });
    } else if (block.maxWorkers > workerLimit) {
      issues.push({
        ...MESSAGES.WORKERS_EXCESSIVE(block.maxWorkers, workerLimit),
        path: [...basePath, 'maxWorkers'],
      });
    }
  }

  if (
    block.cache &&
    typeof block.cache === 'object' &&
    block.cache.ttl !== undefined
  ) {
    const { ttl } = block.cache;
    if (ttl < LIMITS.CACHE_TTL_MIN) {
      issues.push({
        ...MESSAGES.NEGATIVE_CACHE_TTL(ttl),
        path: [...basePath, 'cache', 'ttl'],
      });
    }
  }

  if (
    typeof block.angularVersion === 'string' &&
    parseAngularVersion(block.angularVersion) === null
  ) {
    issues.push({
      ...MESSAGES.INVALID_ANGULAR_VERSION(block.angularVersion),
      path: [...basePath, 'angularVersion'],
    });
  }

  return { issues };
}
