import type { ConfigValidationResult, ConfigIssue } from '@ngcompass/common';
import type { ValidateConfigOptions } from '../models/index.js';
import { resolveConfig } from '../loaders/loader.js';

const UNEXPECTED_ERROR_CODE = 'error-conf-semantic';

const toUnexpectedIssue = (error: unknown): ConfigIssue => ({
  code: UNEXPECTED_ERROR_CODE,
  message: error instanceof Error ? error.message : String(error),
  path: [],
  severity: 'error',
});

export async function validateConfig(
  options: ValidateConfigOptions
): Promise<ConfigValidationResult> {
  try {
    return await resolveConfig(options);
  } catch (error: unknown) {
    return {
      config: undefined,
      report: {
        valid: false,
        issues: [toUnexpectedIssue(error)],
      },
    };
  }
}
