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
    type RuleRegistryEntry,
    type RuleResult,
    type RuleFailure,
    type AnalysisResult,
} from './rules/index.js';

// Execution Plan (Phase 1.75 + Phase 2.0)
export {
    // Phase 1.75: Core execution plan
    buildExecutionPlan,
    getExecutionPlanSummary,
    buildIndexes,
    getFilesForRules,
    getTotalTasks,
    getTasksCountBySeverity,
    // Phase 2.0: Incremental analysis
    filterCachedTasks,
    areAllTasksCached,
    getCacheHitRate,
    pruneStaleCache,
} from './planner/index.js';

export type {
    // Phase 1.75
    ExecutionPlanOutput,
    ExecutionPlan,
    ExecutionIndexes,
    ExecutionStats,
    FileAnalysisUnit,
    FileInfo,
    FileType,
    RuleTask,
    Task,
    TaskInputs,
    FileInput,
    ResourceType,
    ExecutionPlanOptions,
    // Phase 2.0
    IncrementalPlan,
    CacheFilterStats,
    IncrementalFilterOptions,
    CachePruneOptions,
} from './planner/index.js';

// Engine
export * from './engine/orchestrator.js';
export * from './parsers/index.js';

// Plugin registry (public API for custom rule authors and CLI)
export {
    getGlobalRegistry,
    resetGlobalRegistry,
    RuleRegistry,
    type RulePlugin,
    type RegisterOptions,
} from './rules/registry/rule-registry.js';
export { RuleContextFactory } from './rules/engine/rule-context-factory.js';

// Register built-in rules
import './rules/register-all.js';
