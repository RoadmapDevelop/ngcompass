/**
 * Rule Registry
 *
 * Central registry of all available rules with their metadata
 * This will be populated as rules are implemented
 */

import type { RuleRegistry, RuleRegistryEntry, RuleMetadata } from './types.js';

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
    // Console & debugging
    'no-console',
    'no-debugger',

    // Variables & declarations
    'no-var',
    'prefer-const',
    'no-unused-vars',
    'no-duplicate-imports',
    'no-any',
    'explicit-function-return-type',
    'no-explicit-any',

    // Angular components
    'component-selector',
    'component-class-suffix',
    'directive-selector',
    'directive-class-suffix',
    'use-lifecycle-interface',
    'no-input-rename',
    'no-output-rename',

    // Angular templates
    'no-inline-styles',
    'template-accessibility-alt-text',
    'template-no-negated-async',
    'template-use-track-by-function',
] as const;

/**
 * Build the rule registry
 */
const buildRegistry = (): RuleRegistry => {
    const entries = new Map<string, RuleRegistryEntry>();

    for (const ruleName of knownRules) {
        let dependencyType: RuleMetadata['dependencyType'] = 'standalone';
        let requires: RuleMetadata['requires'] = { tsAst: true };

        // Enhance placeholder metadata based on rule name patterns
        if (ruleName.startsWith('component-') || ruleName.startsWith('directive-') || ruleName === 'use-lifecycle-interface') {
            dependencyType = 'component';
        } else if (ruleName.startsWith('template-')) {
            dependencyType = 'component';
            requires = { tsAst: true, htmlAst: true };
        } else if (ruleName === 'no-inline-styles') {
            dependencyType = 'styles';
            requires = { tsAst: true, cssAst: true };
        } else if (ruleName.includes('-rename')) {
            dependencyType = 'component';
        }

        entries.set(ruleName, createRegistryEntry(ruleName, { dependencyType, requires }));
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
