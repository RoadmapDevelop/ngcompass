import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type {
  ConfigBlockValidation,
  ValidationContext,
} from '../../models/index.js';
import type { ValidatedConfig } from '../../validation/schema.js';

const LIMITS = {
  REDUNDANT_MAX_WARNINGS: 100,
} as const;

export function validateBaseline(
  config: ValidatedConfig,
  context: ValidationContext,
  basePath: (string | number)[] = []
): ConfigBlockValidation {
  const issues: ConfigIssue[] = [];

  if (!config.baseline.enabled) {
    return { issues };
  }

  const baselinePath = path.isAbsolute(config.baseline.path)
    ? config.baseline.path
    : path.resolve(context.cwd, config.baseline.path);

  if (!existsSync(baselinePath)) {
    issues.push({
      ...MESSAGES.BASELINE_FILE_MISSING(config.baseline.path),
      path: [...basePath, 'baseline', 'path'],
    });
  }

  if (config.maxWarnings > LIMITS.REDUNDANT_MAX_WARNINGS) {
    issues.push({
      ...MESSAGES.BASELINE_MAX_WARNINGS_REDUNDANT(config.maxWarnings),
      path: [...basePath, 'maxWarnings'],
    });
  }

  return { issues };
}
