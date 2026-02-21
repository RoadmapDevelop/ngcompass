/**
 * Plugin Loader
 *
 * Resolves and loads external rule plugins declared in the config's
 * `plugins` array. Called once during the `analyze` command lifecycle,
 * between config resolution and rule resolution.
 *
 * Plugin packages must export either:
 *  - A default export that is a single RulePlugin object, OR
 *  - A default export that is an array of RulePlugin objects
 *
 * Example:
 * ```ts
 * // my-org-rules/src/index.ts
 * export default [myRule1, myRule2];
 * ```
 *
 * Security note: Plugin modules are loaded via dynamic import() using
 * paths resolved relative to the project's configDir. Plugins have full
 * Node.js access — users should only install trusted plugins.
 */

import { createRequire } from 'node:module';
import { warn, debug } from '@ngcompass/common';
import type { RuleRegistry, RulePlugin } from '../rules/registry/rule-registry.js';

// ============================================
// PUBLIC API
// ============================================

/**
 * Loads all plugins listed in the config and registers their rules.
 *
 * @param plugins  - Array of plugin specifiers (package names or file paths)
 * @param configDir - Directory of the ngcompass config file (used as require base)
 * @param registry  - The RuleRegistry to register rules into
 *
 * @throws {Error} if a plugin cannot be resolved or loaded
 * @throws {Error} if a plugin exports an invalid shape
 */
export const loadPlugins = async (
    plugins: string[],
    configDir: string,
    registry: RuleRegistry,
): Promise<void> => {
    if (plugins.length === 0) return;

    debug('plugin-loader', `Loading ${plugins.length} plugin(s) from ${configDir}`);

    const _require = createRequire(configDir + '/package.json');

    for (const pluginRef of plugins) {
        try {
            debug('plugin-loader', `Resolving plugin: ${pluginRef}`);

            // Resolve relative to the config directory so local plugins work
            let resolvedPath: string;
            try {
                resolvedPath = _require.resolve(pluginRef);
            } catch {
                // Fall back to treating as an absolute/relative path
                resolvedPath = pluginRef;
            }

            debug('plugin-loader', `Loading plugin from: ${resolvedPath}`);

            // Dynamic import (supports both CJS and ESM plugins)
            const mod = await import(resolvedPath);

            // Normalize to array form
            const rawExport = mod.default ?? mod;
            const plugins: RulePlugin[] = Array.isArray(rawExport) ? rawExport : [rawExport];

            let registered = 0;
            for (const plugin of plugins) {
                if (!isValidPlugin(plugin)) {
                    warn(
                        'plugin-loader',
                        `Plugin "${pluginRef}" exported an invalid rule (missing name or handler). Skipping.`
                    );
                    continue;
                }
                registry.register(plugin);
                registered++;
                debug('plugin-loader', `  ✓ Registered rule: ${plugin.name}`);
            }

            debug('plugin-loader', `Plugin "${pluginRef}" registered ${registered} rule(s)`);
        } catch (e) {
            // Re-throw with better context — plugin loading failure should be loud
            const message = e instanceof Error ? e.message : String(e);
            throw new Error(
                `[ngcompass] Failed to load plugin "${pluginRef}": ${message}\n` +
                `  Make sure the package is installed and exports a default RulePlugin or RulePlugin[].`
            );
        }
    }
};

// ============================================
// HELPERS
// ============================================

/**
 * Type guard: checks that an export looks like a valid RulePlugin.
 */
function isValidPlugin(value: unknown): value is RulePlugin {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate['name'] === 'string' &&
        candidate['name'].length > 0 &&
        typeof candidate['handler'] === 'object' &&
        candidate['handler'] !== null &&
        typeof (candidate['handler'] as Record<string, unknown>)['handle'] === 'function'
    );
}
