/**
 * Rule Registry
 *
 * Central registry of all available rules with their metadata.
 * Rules are registered dynamically via registerRuleImplementation() —
 * there is no static known-rules list. The engine adapter is the
 * sole source of truth for rule registration.
 */

import type { RuleRegistry, RuleRegistryEntry, RuleMetadata, RuleContext, RuleResult, RuleFailure } from './types.js';

/**
 * Rule Executor Function
 */
export type PresetReference = string;
export type RuleExecutor = (context: RuleContext) => RuleResult | Iterable<RuleFailure>;

/**
 * Map of rule names to their executor functions
 */
const ruleExecutors = new Map<string, RuleExecutor>();

/**
 * Global rule registry instance.
 * Populated dynamically via registerRuleImplementation().
 */
const mutableRegistry = new Map<string, RuleRegistryEntry>();
export const ruleRegistry: RuleRegistry = mutableRegistry;

/**
 * Register a rule implementation
 */
export const registerRuleImplementation = (
    name: string,
    executor: RuleExecutor,
    metadataOverrides: Partial<RuleMetadata> = {}
): void => {
    ruleExecutors.set(name, executor);

    // Always update metadata registry — overwrite with latest metadata
    const entry = createRegistryEntry(name, metadataOverrides);
    mutableRegistry.set(name, entry);
};

/**
 * Get a rule executor by name
 */
export const getRuleExecutor = (name: string): RuleExecutor | undefined => {
    return ruleExecutors.get(name);
};

/**
 * Create metadata for a rule (uses overrides or defaults)
 */
const createPlaceholderMetadata = (
    name: string,
    overrides: Partial<RuleMetadata> = {}
): RuleMetadata => ({
    name,
    description: overrides.description || `Rule: ${name}`,
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
