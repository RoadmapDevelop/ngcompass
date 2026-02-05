export const core = '@ngcompass/core';

// Caching
export { createCacheContext, CacheContext, CacheConfig } from './cache/index.js';

// Configuration
export * from './config/index.js';

// Scanner
export * from './scanner/index.js';

// Rules (Excluding duplicates already exported by scanner)
export {
    ruleRegistry,
    isKnownRule,
    getRuleMetadata,
    getAllRuleNames,
    builtinPresets,
    isBuiltinPreset,
    getBuiltinPreset,
    resolveRules,
    getEnabledRules,
    getRulesByCategory,
    getRulesByDependencyType,
    loadPreset,
    resolveExtendsChain,
    normalizeRuleConfig,
    isRuleEnabled,
    normalizeAllRules,
    mergeRuleConfig,
    mergeRulesConfigs,
    applyOverrides,
    type RuleSeverity,
    type RuleConfig,
    type RuleConfigShorthand,
    type RuleConfigFull,
    type RulesConfig,
    type RuleMetadata,
    type RuleAstRequirements,
    type RuleDependencyType,
    type RuleFilePatterns,
    type ResolvedRule,
    type ResolvedRulesMap,
    type RuleResolutionResult,
    type PresetConfig,
    type PresetReference,
    type BuiltinPreset,
    type RuleRegistry,
    type RuleRegistryEntry,
} from './rules/index.js';

// Execution Plan
export {
    buildExecutionPlan,
    buildFileUnit,
    validateExecutionPlan,
    getExecutionPlanSummary,
    buildIndexes,
    getFilesForRules,
    getTotalTasks,
    getTasksCountBySeverity,
} from './planner/index.js';

export type {
    ExecutionPlanOutput,
    ExecutionPlan,
    ExecutionIndexes,
    ExecutionStats,
    FileAnalysisUnit,
    FileInfo,
    FileType,
    RuleTask,
    TaskInputs,
    FileInput,
    ResourceType,
    ExecutionPlanOptions,
} from './planner/index.js';
