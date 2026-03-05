/**
 * RuleRegistry — Plugin Boundary
 *
 * Replaces the mutable bare Map in adapter.ts with a class that:
 *  - Throws on duplicate registration (prevents silent stomping)
 *  - Exposes a controlled surface for plugin authors
 *  - Provides a global singleton for CLI / built-in usage
 *  - Provides a reset helper for isolated test runs
 *
 * Plugin authors export an array of RulePlugin objects from their package.
 * The plugin-loader reads the config `plugins` array and calls registry.register()
 * for each plugin — no core files need to be modified.
 *
 * Example plugin package:
 * ```ts
 * // my-org-rules/src/index.ts
 * import type { RulePlugin } from '@ngcompass/rules';
 * import { createComponentRule } from '@ngcompass/engine';
 *
 * const noBareSelectorRule: RulePlugin = {
 *   name: 'my-org/no-bare-selectors',
 *   handler: createComponentRule('my-org/no-bare-selectors', (node, ctx) => { ... }),
 *   meta: { category: 'style', dependencyType: 'component' },
 * };
 *
 * export default [noBareSelectorRule];
 * ```
 *
 * ngcompass.config.ts:
 * ```ts
 * export default {
 *   plugins: ['my-org-rules'],
 *   rules: { 'my-org/no-bare-selectors': 'high' },
 * };
 * ```
 */

import type { PluginManifest } from '@ngcompass/common';
import type { RuleHandler } from '@ngcompass/engine';
import { RuleMetadata, RuleRegistryEntry } from '@ngcompass/common';

// ============================================
// PUBLIC TYPES
// ============================================

/**
 * A plugin descriptor — the unit external rule authors export.
 */
export interface RulePlugin {
    /** Globally unique rule name. Use namespacing: 'my-org/rule-name' */
    readonly name: string;
    /** The rule handler (created via createComponentRule, createDecoratedPropertyRule, etc.) */
    readonly handler: RuleHandler<any>;
    /** Optional metadata overrides (category, description, dependencyType, etc.) */
    readonly meta?: Partial<RuleMetadata>;
    /** Optional manifest (RFC §7.6) */
    readonly manifest?: PluginManifest;
}

/**
 * Options controlling registration behaviour.
 */
export interface RegisterOptions {
    /**
     * Allow overwriting an existing rule with the same name.
     * Default: false — throws on duplicate to prevent silent errors.
     */
    allowOverride?: boolean;
}

// ============================================
// REGISTRY CLASS
// ============================================

/**
 * Central registry for rule handlers.
 *
 * Responsibilities:
 *  - Store handler instances keyed by rule name
 *  - Prevent accidental duplicate registration
 *  - Expose read-only views for the engine and adapter
 */
export class RuleRegistry {
    private readonly _handlers = new Map<string, RuleHandler<any>>();
    private readonly _meta = new Map<string, Partial<RuleMetadata>>();

    /**
     * Registers a rule plugin.
     *
     * @throws {Error} if the rule name is already registered and allowOverride is false
     */
    register(plugin: RulePlugin, opts: RegisterOptions = {}): void {
        if (this._handlers.has(plugin.name) && !opts.allowOverride) {
            throw new Error(
                `[ngcompass] Rule "${plugin.name}" is already registered. ` +
                `Use allowOverride: true to replace an existing rule intentionally.`
            );
        }
        this._handlers.set(plugin.name, plugin.handler);
        if (plugin.meta) {
            this._meta.set(plugin.name, plugin.meta);
        }
    }

    /**
     * Returns the handler for a rule name, or undefined if not registered.
     */
    get(name: string): RuleHandler<any> | undefined {
        return this._handlers.get(name);
    }

    /**
     * Returns true if a rule with this name is registered.
     */
    has(name: string): boolean {
        return this._handlers.has(name);
    }

    /**
     * Returns all registered rule names.
     */
    getRuleNames(): ReadonlyArray<string> {
        return Array.from(this._handlers.keys());
    }

    /**
     * Returns the full handler map (read-only view).
     * Used by the engine adapter for batched execution.
     */
    getAll(): ReadonlyMap<string, RuleHandler<any>> {
        return this._handlers;
    }

    /**
     * Returns metadata overrides for a rule name, if any.
     */
    getMeta(name: string): Partial<RuleMetadata> | undefined {
        return this._meta.get(name);
    }

    /**
     * Returns resolved RuleMetadata for a rule name.
     * Fills in defaults for fields not specified in the plugin's meta.
     */
    getMetadata(name: string): RuleMetadata | undefined {
        if (!this._handlers.has(name)) return undefined;
        const overrides = this._meta.get(name) ?? {};
        return {
            name,
            description: overrides.description || `Rule: ${name}`,
            category: overrides.category || 'general',
            dependencyType: overrides.dependencyType || 'standalone',
            requires: { tsAst: true, ...overrides.requires },
            filePatterns: overrides.filePatterns,
        };
    }

    /**
     * Returns a full RuleRegistryEntry (metadata + default config).
     * Used for backward compatibility with the legacy registry API.
     */
    getRegistryEntry(name: string): RuleRegistryEntry | undefined {
        const metadata = this.getMetadata(name);
        if (!metadata) return undefined;
        return {
            name,
            metadata,
            defaultConfig: { severity: 'warn', options: {} },
        };
    }

    /**
     * Returns a ReadonlyMap compatible with the legacy RuleRegistry type.
     */
    toReadonlyMap(): ReadonlyMap<string, RuleRegistryEntry> {
        const map = new Map<string, RuleRegistryEntry>();
        for (const name of this._handlers.keys()) {
            const entry = this.getRegistryEntry(name);
            if (entry) map.set(name, entry);
        }
        return map;
    }

    /**
     * Total number of registered rules.
     */
    get size(): number {
        return this._handlers.size;
    }
}

// ============================================
// GLOBAL SINGLETON
// ============================================

/**
 * The single shared registry instance used by the CLI and built-in rules.
 *
 * Worker threads must call registerAllBuiltinRules() to populate their own
 * in-process registry (they do not share memory with the main thread).
 */
let _globalRegistry: RuleRegistry | null = null;

/**
 * Returns the global registry, creating it on first call.
 */
export const getGlobalRegistry = (): RuleRegistry => {
    if (!_globalRegistry) {
        _globalRegistry = new RuleRegistry();
    }
    return _globalRegistry;
};

/**
 * Resets the global registry to a fresh empty instance.
 *
 * FOR TESTS ONLY — never call this in production code.
 * Allows isolated unit tests that register their own rules without
 * interfering with the global built-in rules.
 */
export const resetGlobalRegistry = (): void => {
    _globalRegistry = null;
};

// ============================================
// CONVENIENCE FUNCTIONS (delegate to global)
// ============================================

/**
 * Check if a rule exists in the global registry.
 */
export const isKnownRule = (name: string): boolean => {
    return getGlobalRegistry().has(name);
};

/**
 * Get rule metadata by name from the global registry.
 */
export const getRuleMetadata = (name: string): RuleMetadata | undefined => {
    return getGlobalRegistry().getMetadata(name);
};

/**
 * Get all registered rule names from the global registry.
 */
export const getAllRuleNames = (): ReadonlyArray<string> => {
    return getGlobalRegistry().getRuleNames();
};

/**
 * Backward-compatible accessor for the legacy `ruleRegistry` constant.
 * Returns a ReadonlyMap<string, RuleRegistryEntry> view of the global registry.
 */
export const getRuleRegistryMap = (): ReadonlyMap<string, RuleRegistryEntry> => {
    return getGlobalRegistry().toReadonlyMap();
};
