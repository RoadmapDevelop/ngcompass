import type { ConfigIssue } from '@ngcompass/common';
import { VALID_RULE_SEVERITIES } from '../constants.js';
import { MESSAGES } from '../messages.js';
import type {
  ConfigBlockValidation,
} from '../../models/index.js';
import type { ValidatedConfig } from '../../validation/schema.js';

function hasExtendsSource(extendsField: ValidatedConfig['extends']): boolean {
  if (Array.isArray(extendsField)) return extendsField.length > 0;
  return Boolean(extendsField);
}

export function validateRules(
  config: ValidatedConfig,
  basePath: (string | number)[] = []
): ConfigBlockValidation {
  const issues: ConfigIssue[] = [];

  const rules = config.rules || {};
  const ruleEntries = Object.entries(rules);
  const hasExplicitRules = ruleEntries.length > 0;

  if (!hasExplicitRules && !hasExtendsSource(config.extends)) {
    issues.push({
      ...MESSAGES.NO_RULES_CONFIGURED,
      path: [...basePath, 'rules'],
    });
  }

  for (const [ruleName, ruleConfig] of ruleEntries) {
    if (!ruleName || ruleName.trim() === '') {
      issues.push({
        ...MESSAGES.EMPTY_RULE_NAME,
        path: [...basePath, 'rules'],
      });
      continue;
    }

    if (typeof ruleConfig === 'object' && ruleConfig !== null) {
      const { severity } = ruleConfig as { severity?: string };
      if (severity && !VALID_RULE_SEVERITIES.includes(severity)) {
        issues.push({
          ...MESSAGES.INVALID_RULE_SEVERITY(ruleName, severity),
          path: [...basePath, 'rules', ruleName, 'severity'],
        });
      }
    }
  }

  return { issues };
}
