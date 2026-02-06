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
    // --- Console & Debugging ---
    'no-console',
    'no-debugger',
    'no-alert',
    'no-inline-styles',

    // --- Variables & Declarations ---
    'no-var',
    'prefer-const',
    'no-unused-vars',
    'no-duplicate-imports',
    'no-any',
    'no-explicit-any',
    'explicit-function-return-type',
    'no-inferrable-types',
    'no-magic-numbers',
    'prefer-readonly',
    'no-non-null-assertion',
    'no-empty-interface',
    'no-shadow',

    // --- Angular Components & Directives ---
    'component-selector',
    'component-class-suffix',
    'component-max-inline-declarations',
    'directive-selector',
    'directive-class-suffix',
    'use-lifecycle-interface',
    'no-input-rename',
    'no-output-rename',
    'no-output-on-prefix',
    'no-output-native',
    'no-attribute-decorator',
    'no-conflicting-lifecycle',
    'no-queries-metadata-property',
    'prefer-on-push-component-change-detection',
    'use-component-view-encapsulation',
    'no-empty-lifecycle-method',
    'prefer-standalone',
    'no-forward-ref',
    'use-inject',
    'no-input-prefix',
    'prefer-output-readonly',
    'no-unused-inputs',
    'no-unused-outputs',
    'no-pipe-impure',
    'prefer-pipe-transform',
    'implements-on-destroy',

    // --- Angular Signals (Modern) ---
    'prefer-signals',
    'no-untracked-signal-mutation',
    'no-signal-side-effects',
    'no-async-signal-update',
    'prefer-signal-inputs',
    'prefer-signal-queries',

    // --- Angular Templates (HTML & Accessibility) ---
    'template-no-inline-styles',
    'template-accessibility-alt-text',
    'template-no-negated-async',
    'template-use-track-by-function',
    'template-no-any',
    'template-no-autofocus',
    'template-no-distracting-elements',
    'template-button-has-type',
    'template-no-positive-tabindex',
    'template-table-scope',
    'template-valid-aria-proptype',
    'template-conditional-complexity',
    'template-cyclomatic-complexity',
    'template-no-call-expression',
    'template-prefer-control-flow',
    'template-no-duplicate-attributes',
    'template-no-expansions',
    'template-i18n',
    'template-no-interpolation-in-attributes',
    'template-prefer-self-closing-tags',

    // --- RxJS Best Practices ---
    'rxjs-no-async-subscribe',
    'rxjs-no-ignored-observable',
    'rxjs-no-nested-subscribe',
    'rxjs-no-unbound-methods',
    'rxjs-throw-error',
    'rxjs-no-subject-value',
    'rxjs-no-internal',
    'rxjs-no-sharereplay-config',
    'rxjs-prefer-takeuntil',
    'rxjs-no-create',
    'rxjs-no-explicit-generics',
    'rxjs-no-ignored-notifier',
    'rxjs-no-subject-unsubscribe',
    'rxjs-no-subclass',
    'rxjs-prefer-async-pipe',

    // --- Code Structure & Style ---
    'member-ordering',
    'naming-convention-classes',
    'naming-convention-interfaces',
    'prefer-template-literals',
    'no-restricted-imports',
    'sort-imports',
    'max-file-line-count',
    'max-params',
    'no-commented-out-code',
    'prefer-arrow-functions',

    // --- Performance ---
    'no-slow-selectors',
    'no-expensive-getters',
    'prefer-composition',

    // --- Security ---
    'no-inner-html',
    'no-security-sensitive-hook',
    'enforce-trusted-types',

    // --- Testing ---
    'no-focused-tests',
    'no-skipped-tests',
    'prefer-spyon',
    'no-jasmine-arrow',
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
        if (
            ruleName.startsWith('component-') ||
            ruleName.startsWith('directive-') ||
            ruleName.startsWith('use-') ||
            ruleName.startsWith('prefer-') ||
            ruleName.startsWith('implements-') ||
            ruleName.includes('-rename') ||
            ruleName.includes('standalone')
        ) {
            dependencyType = 'component';
        }

        if (ruleName.startsWith('template-')) {
            dependencyType = 'component';
            requires = { tsAst: true, htmlAst: true };
        } else if (ruleName.includes('styles')) {
            dependencyType = 'styles';
            requires = { tsAst: true, cssAst: true };
        } else if (ruleName.startsWith('rxjs-')) {
            dependencyType = 'standalone'; // or maybe 'service' if we had that? standalone for now
            requires = { tsAst: true };
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
