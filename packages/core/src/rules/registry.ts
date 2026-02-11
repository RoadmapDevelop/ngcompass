/**
 * Rule Registry
 *
 * Central registry of all available rules with their metadata
 * This will be populated as rules are implemented
 */

import type { RuleRegistry, RuleRegistryEntry, RuleMetadata, RuleContext, RuleResult } from './types.js';

/**
 * Rule Executor Function
 */
export type RuleExecutor = (context: RuleContext) => RuleResult | Iterable<import('./types.js').RuleFailure>;

/**
 * Map of rule names to their executor functions
 */
const ruleExecutors = new Map<string, RuleExecutor>();

/**
 * Register a rule implementation
 */
export const registerRuleImplementation = (
    name: string,
    executor: RuleExecutor,
    metadataOverrides: Partial<RuleMetadata> = {}
): void => {
    ruleExecutors.set(name, executor);

    // Also update the metadata registry if needed
    if (!ruleRegistry.has(name)) {
        // If it's a new rule not in our static list, add it
        // This supports plugins in the future
        const entry = createRegistryEntry(name, metadataOverrides);
        (ruleRegistry as Map<string, RuleRegistryEntry>).set(name, entry);
    }
};

/**
 * Get a rule executor by name
 *
 * Automatically falls back to new engine if rule is registered there
 */
export const getRuleExecutor = (name: string): RuleExecutor | undefined => {
    // Check old-style executors first
    const executor = ruleExecutors.get(name);
    if (executor) return executor;

    // Fall back to new engine adapter
    // Import dynamically to avoid circular dependency
    try {
        // @ts-ignore - dynamic import for adapter
        const { isNewEngineRule, executeNewEngineRule } = require('./engine/adapter.js');

        if (isNewEngineRule(name)) {
            return (ctx: RuleContext) => executeNewEngineRule(name, ctx);
        }
    } catch (e) {
        // Adapter not available, continue
    }

    return undefined;
};

/**
 * Placeholder rule metadata (will be replaced with actual implementations)
 */
const createPlaceholderMetadata = (
    name: string,
    overrides: Partial<RuleMetadata> = {}
): RuleMetadata => ({
    name,
    description: overrides.description || `Rule: ${name} (to be implemented)`,
    category: overrides.category || 'general',
    dependencyType: overrides.dependencyType || 'standalone',
    requires: {
        tsAst: true,
        ...overrides.requires,
    },
    filePatterns: overrides.filePatterns,
});

/**
 * Create registry entry for a rule
 */
const createRegistryEntry = (
    name: string,
    metadataOverrides: Partial<RuleMetadata> = {}
): RuleRegistryEntry => ({
    name,
    metadata: createPlaceholderMetadata(name, metadataOverrides),
    defaultConfig: {
        severity: 'moderate',
        options: {},
    },
});

/**
 * List of all known rules (will be expanded as rules are implemented)
 */
const knownRules = [
    // --- Angular Components & Directives ---
    'prefer-on-push-component-change-detection',
    'prefer-standalone',
] as const;

/**
 * Build the rule registry
 */
const buildRegistry = (): RuleRegistry => {
    const entries = new Map<string, RuleRegistryEntry>();

    for (const ruleName of knownRules) {
        entries.set(ruleName, createRegistryEntry(ruleName, {
            dependencyType: 'component',
            requires: { tsAst: true }
        }));
    }

    return entries;
};

/**
 * Global rule registry instance
 */
export const ruleRegistry: RuleRegistry = buildRegistry();

/**
 * Check if a rule exists in the registry
 */
export const isKnownRule = (name: string): boolean => {
    return ruleRegistry.has(name);
};

/**
 * Get rule metadata by name
 */
export const getRuleMetadata = (name: string): RuleMetadata | undefined => {
    return ruleRegistry.get(name)?.metadata;
};

/**
 * Get all registered rule names
 */
export const getAllRuleNames = (): ReadonlyArray<string> => {
    return Array.from(ruleRegistry.keys());
};
