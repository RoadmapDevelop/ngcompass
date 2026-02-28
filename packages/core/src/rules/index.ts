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
    RuleRegistryEntry,
    RuleResult,
    RuleFailure,
    AnalysisResult,
} from './types.js';

export { Ok, Err } from './types.js';
export type { Result } from './types.js';

// Registry (unified — all from rule-registry.ts)
export {
    isKnownRule,
    getRuleMetadata,
    getAllRuleNames,
    getRuleRegistryMap as ruleRegistry,
} from './registry/rule-registry.js';

// Plugin registry
export {
    RuleRegistry,
    getGlobalRegistry,
    resetGlobalRegistry,
} from './registry/rule-registry.js';

export type {
    RulePlugin,
    RegisterOptions,
} from '@ngcompass/common';

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

// Engine
export {
    RuleContextFactory,
} from './engine/index.js';


export { walkProgram } from './visitor.js';