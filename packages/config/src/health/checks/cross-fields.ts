import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type {
  ConfigBlockValidation,
  ValidationContext,
} from '../../models/index.js';
import type { ValidatedConfig } from '../../validation/schema.js';
import { validateConfigBlock } from './base.js';

const LIMITS = {
  WARNINGS_MIN: 0,
} as const;

export function validateCrossFields(
  config: ValidatedConfig,
  context: ValidationContext,
  basePath: (string | number)[] = []
): ConfigBlockValidation {
  const issues: ConfigIssue[] = [];

  if (
    config.maxWarnings !== undefined &&
    config.maxWarnings < LIMITS.WARNINGS_MIN
  ) {
    issues.push({
      ...MESSAGES.NEGATIVE_MAX_WARNINGS(config.maxWarnings),
      path: [...basePath, 'maxWarnings'],
    });
  }

  const { issues: blockIssues } = validateConfigBlock(
    config,
    context,
    basePath
  );
  issues.push(...blockIssues);

  return { issues };
}
