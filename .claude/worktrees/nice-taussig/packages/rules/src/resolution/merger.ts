/**
 * Rule Configuration Merger
 *
 * Pure functions to merge rule configurations with proper precedence
 */

import type { RulesConfig, RuleConfig, RuleConfigFull } from '@ngcompass/common';
import { normalizeRuleConfig } from './normalize.js';

/**
 * Merge two rule configurations
 *
 * Pure function: later config overrides earlier config
 * Handles both shorthand and full format
 */
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

/**
 * Merge multiple rule configuration objects
 *
 * Pure function: later configs override earlier configs
 * Precedence: rules[0] < rules[1] < ... < rules[n]
 */
export const mergeRulesConfigs = (
    configs: ReadonlyArray<RulesConfig>
): ReadonlyMap<string, RuleConfigFull> => {
    const merged = new Map<string, RuleConfigFull>();

    for (const config of configs) {
        for (const [ruleName, ruleConfig] of Object.entries(config)) {
            const existing = merged.get(ruleName);

            if (existing) {
                // Merge with existing
                merged.set(ruleName, mergeRuleConfig(existing, ruleConfig));
            } else {
                // First occurrence
                merged.set(ruleName, normalizeRuleConfig(ruleConfig));
            }
        }
    }

    return merged;
};

/**
 * Apply overrides to a base rules configuration
 *
 * Pure function: overrides have highest precedence
 */
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
