import type {
  RulesConfig,
  RuleConfig,
  RuleConfigFull,
} from '@ngcompass/common';
import { normalizeRuleConfig } from './normalize.js';

export const mergeRuleConfig = (
  base: RuleConfig,
  override: RuleConfig
): RuleConfigFull => {
  const baseNormalized = normalizeRuleConfig(base);
  const overrideNormalized = normalizeRuleConfig(override);

  return {
    severity: overrideNormalized.severity,
    options: {
      ...baseNormalized.options,
      ...overrideNormalized.options,
    },
  };
};

export const mergeRulesConfigs = (
  configs: ReadonlyArray<RulesConfig>
): ReadonlyMap<string, RuleConfigFull> => {
  const merged = new Map<string, RuleConfigFull>();

  for (const config of configs) {
    for (const [ruleName, ruleConfig] of Object.entries(config)) {
      const existing = merged.get(ruleName);

      if (existing) {
        merged.set(ruleName, mergeRuleConfig(existing, ruleConfig));
      } else {
        merged.set(ruleName, normalizeRuleConfig(ruleConfig));
      }
    }
  }

  return merged;
};

export const applyOverrides = (
  base: ReadonlyMap<string, RuleConfigFull>,
  overrides: RulesConfig
): ReadonlyMap<string, RuleConfigFull> => {
  const result = new Map(base);

  for (const [ruleName, ruleConfig] of Object.entries(overrides)) {
    const existing = result.get(ruleName);

    if (existing) {
      result.set(ruleName, mergeRuleConfig(existing, ruleConfig));
    } else {
      result.set(ruleName, normalizeRuleConfig(ruleConfig));
    }
  }

  return result;
};
