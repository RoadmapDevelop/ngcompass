/**
 * Rule Resolution Pipeline
 *
 * Main entry point for resolving rules from config + presets
 */

import type {
    Result,
    RuleResolutionResult,
    ResolvedRule,
    ResolvedRulesMap,
    RulesConfig,
} from '@ngcompass/common';
import { Ok, Err } from '@ngcompass/common';
import { resolveExtendsChain } from './loader.js';
import { mergeRulesConfigs, applyOverrides } from './merger.js';
import { isRuleEnabled } from './normalize.js';
import { isKnownRule, getRuleMetadata } from '../registry/rule-registry.js';
import { debug, time, timeEnd } from '@ngcompass/common';
import type { NormalizedAnalyzerConfig } from '@ngcompass/common';

/**
 * Resolve rules from config
 *
 * Pipeline:
 * 1. Load & resolve extends chain
 * 2. Merge all preset rules (deepest first)
 * 3. Apply user config rules (highest precedence)
 * 4. Attach metadata from registry
 * 5. Filter enabled rules
 */
export const resolveRules = async (
    config: NormalizedAnalyzerConfig,
    configDir: string = process.cwd()
): Promise<Result<RuleResolutionResult>> => {
    time('rule-resolution');
    debug('loader', 'Starting rule resolution');

    try {
        // Step 1: Resolve extends chain
        debug('loader', `Resolving extends: ${JSON.stringify(config.extends)}`);
        const presetsResult = await resolveExtendsChain(config.extends, configDir);

        if (!presetsResult.ok) {
            timeEnd('rule-resolution');
            return presetsResult;
        }

        const presets = presetsResult.data;
        debug('loader', `Loaded ${presets.length} preset(s)`);

        // Step 2: Extract rules from all presets
        const presetRulesConfigs = presets.map(preset => preset.rules);

        // Step 3: Merge preset rules (in order: first to last)
        debug('loader', 'Merging preset rules');
        const mergedPresetRules = mergeRulesConfigs(presetRulesConfigs);
        debug('loader', `Merged rules from presets: ${mergedPresetRules.size} rules`);

        // Step 4: Apply user config rules (highest precedence)
        debug('loader', 'Applying user config rules');
        const finalRules = applyOverrides(mergedPresetRules, (config.rules || {}) as RulesConfig);
        debug('loader', `Final merged rules: ${finalRules.size} rules`);

        // Step 5: Attach metadata and create resolved rules
        const resolvedRules = new Map<string, ResolvedRule>();
        let enabledCount = 0;
        let disabledCount = 0;
        let unknownRules = 0;

        for (const [ruleName, ruleConfig] of finalRules) {
            // Check if rule exists in registry
            if (!isKnownRule(ruleName)) {
                debug('loader', `Warning: Unknown rule "${ruleName}" (will be skipped)`);
                unknownRules++;
                continue;
            }

            const metadata = getRuleMetadata(ruleName)!;

            const resolvedRule: ResolvedRule = {
                name: ruleName,
                severity: ruleConfig.severity,
                options: ruleConfig.options || {},
                metadata,
            };

            resolvedRules.set(ruleName, resolvedRule);

            if (isRuleEnabled(ruleConfig)) {
                enabledCount++;
            } else {
                disabledCount++;
            }
        }

        const resolutionTime = timeEnd('rule-resolution');

        debug('loader', `Rule resolution complete:`);
        debug('loader', `  Total rules: ${resolvedRules.size}`);
        debug('loader', `  Enabled: ${enabledCount}`);
        debug('loader', `  Disabled: ${disabledCount}`);
        debug('loader', `  Unknown (skipped): ${unknownRules}`);
        debug('loader', `  Resolution time: ${resolutionTime.toFixed(1)}ms`);

        const result: RuleResolutionResult = {
            rules: resolvedRules,
            metadata: {
                totalRules: resolvedRules.size,
                enabledRules: enabledCount,
                disabledRules: disabledCount,
                presetsLoaded: presets.map(p => p.name),
                resolutionTime,
            },
        };

        return Ok(result);
    } catch (error) {
        timeEnd('rule-resolution');
        return Err(
            new Error(`Rule resolution failed: ${(error as Error).message}`)
        );
    }
};

/**
 * Get only enabled rules from resolution result
 *
 * Pure function: filters out disabled rules
 */
export const getEnabledRules = (
    resolvedRules: ResolvedRulesMap
): ResolvedRulesMap => {
    const enabled = new Map<string, ResolvedRule>();

    for (const [name, rule] of resolvedRules) {
        if (rule.severity !== 'off') {
            enabled.set(name, rule);
        }
    }

    return enabled;
};

/**
 * Get rules by category
 *
 * Pure function: groups rules by category
 */
export const getRulesByCategory = (
    resolvedRules: ResolvedRulesMap
): ReadonlyMap<string, ReadonlyArray<ResolvedRule>> => {
    const byCategory = new Map<string, ResolvedRule[]>();

    for (const rule of resolvedRules.values()) {
        const category = rule.metadata.category;
        const rules = byCategory.get(category) || [];
        rules.push(rule);
        byCategory.set(category, rules);
    }

    return byCategory;
};

/**
 * Get rules by dependency type
 *
 * Pure function: groups rules by dependency type
 */
export const getRulesByDependencyType = (
    resolvedRules: ResolvedRulesMap
): ReadonlyMap<string, ReadonlyArray<ResolvedRule>> => {
    const byType = new Map<string, ResolvedRule[]>();

    for (const rule of resolvedRules.values()) {
        const depType = rule.metadata.dependencyType;
        const rules = byType.get(depType) || [];
        rules.push(rule);
        byType.set(depType, rules);
    }

    return byType;
};
