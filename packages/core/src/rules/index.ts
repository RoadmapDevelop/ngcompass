/**
 * Rules Module - Phase 1.5: Rule Discovery & Resolution
 *
 * Public API for rule resolution
 */

// Types
export type {
    RuleSeverity,
    RuleConfig,
    RuleConfigShorthand,
    RuleConfigFull,
    RulesConfig,
    RuleMetadata,
    RuleAstRequirements,
    RuleDependencyType,
    RuleFilePatterns,
    ResolvedRule,
    ResolvedRulesMap,
    RuleResolutionResult,
    PresetConfig,
    PresetReference,
    BuiltinPreset,
    RuleRegistry,
    RuleRegistryEntry,
} from './types.js';

export { Ok, Err } from './types.js';
export type { Result } from './types.js';

// Registry
export {
    ruleRegistry,
    isKnownRule,
    getRuleMetadata,
    getAllRuleNames,
} from './registry.js';

// Presets
export {
    builtinPresets,
    isBuiltinPreset,
    getBuiltinPreset,
} from './presets/index.js';

// Resolution
export {
    resolveRules,
    getEnabledRules,
    getRulesByCategory,
    getRulesByDependencyType,
} from './resolution/resolver.js';

export {
    loadPreset,
    resolveExtendsChain,
} from './resolution/loader.js';

export {
    normalizeRuleConfig,
    isRuleEnabled,
    normalizeAllRules,
} from './resolution/normalize.js';

export {
    mergeRuleConfig,
    mergeRulesConfigs,
    applyOverrides,
} from './resolution/merger.js';
