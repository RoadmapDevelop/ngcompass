import type {
  OutputFormat,
  FailSeverity,
  CacheOptions,
} from '@ngcompass/common';
import { DEFAULT_INCLUDE_PATTERNS } from '@ngcompass/common';
import os from 'node:os';

const DEFAULT_CACHE_DIR = 'node_modules/.cache/ngcompass';

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/*.spec.ts',
  '**/*.test.ts',
] as const;

const TIME = {
  ONE_HOUR: 3600000,
  TWENTY_FOUR_HOURS: 86400000,
} as const;

export function getDefaultMaxWorkers(): number {
  const cpuCount = os.cpus().length;
  return Math.max(1, Math.min(4, cpuCount - 1));
}

export const DEFAULT_CACHE_OPTIONS: Required<CacheOptions> = {
  enabled: true,
  location: DEFAULT_CACHE_DIR,
  strategy: 'local',
  ttl: TIME.TWENTY_FOUR_HOURS,
};

export const DEFAULT_CONFIG = {
  outputFormat: 'text' as OutputFormat,
  failOnSeverity: 'error' as FailSeverity,
  maxWarnings: 10,
  include: DEFAULT_INCLUDE_PATTERNS,
  exclude: DEFAULT_EXCLUDE_PATTERNS,
} as const;
