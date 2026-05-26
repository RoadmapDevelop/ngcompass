import type {
  RuleConfig,
  RuleConfigFull,
  RuleSeverity,
} from '@ngcompass/common';

export const isShorthand = (config: RuleConfig): config is RuleSeverity => {
  return typeof config === 'string';
};

export const normalizeRuleConfig = (config: RuleConfig): RuleConfigFull => {
  if (isShorthand(config)) {
    return {
      severity: config,
      options: {},
    };
  }

  return {
    severity: config.severity,
    options: config.options || {},
  };
};

export const isRuleEnabled = (config: RuleConfig): boolean => {
  const normalized = normalizeRuleConfig(config);
  return normalized.severity !== 'off';
};

export const normalizeAllRules = (
  rules: Readonly<Record<string, RuleConfig>>
): ReadonlyMap<string, RuleConfigFull> => {
  const normalized = new Map<string, RuleConfigFull>();

  for (const [name, config] of Object.entries(rules)) {
    normalized.set(name, normalizeRuleConfig(config));
  }

  return normalized;
};
