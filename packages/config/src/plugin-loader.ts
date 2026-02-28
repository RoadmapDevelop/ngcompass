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
 * Plugin Manifest (RFC §7.6):
 * Plugins may optionally export a `manifest` field of type PluginManifest.
 * When present the loader validates:
 *  1. engineVersionRange: current tool version must satisfy the range
 *  2. capabilities: required capabilities must be available in the engine
 *
 * Plugins without a manifest are loaded with a deprecation warning.
 * Hard enforcement is reserved for the next major version.
 *
 * Security note: Plugin modules are loaded via dynamic import() using
 * paths resolved relative to the project's configDir. Plugins have full
 * Node.js access — users should only install trusted plugins.
 */

import { createRequire } from 'node:module';
import { warn, debug } from '@ngcompass/common';
import type { PluginManifest, RuleRegistry, RulePlugin } from '@ngcompass/common';
import { PACKAGE_VERSION } from '@ngcompass/common';

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Engine capabilities available at load time.
 * Used to validate plugin capability requirements.
 */
export interface EngineCapabilities {
    readonly typeCheckingEnabled: boolean;
    readonly templateASTEnabled: boolean;
    readonly cssASTEnabled: boolean;
}

/** Default capabilities (conservative — all optional features off) */
const DEFAULT_CAPABILITIES: EngineCapabilities = {
    typeCheckingEnabled: false,
    templateASTEnabled: true,
    cssASTEnabled: true,
};

/**
 * Loads all plugins listed in the config and registers their rules.
 *
 * @param plugins  - Array of plugin specifiers (package names or file paths)
 * @param configDir - Directory of the ngcompass config file (used as require base)
 * @param registry  - The RuleRegistry to register rules into
 * @param capabilities - Engine capabilities (optional; defaults to conservative set)
 *
 * @throws {Error} if a plugin cannot be resolved or loaded
 * @throws {Error} if a plugin exports an invalid shape
 * @throws {Error} if a plugin's engineVersionRange is incompatible with the current tool
 */
export const loadPlugins = async (
    plugins: string[],
    configDir: string,
    registry: RuleRegistry,
    capabilities: EngineCapabilities = DEFAULT_CAPABILITIES,
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
            const pluginList: RulePlugin[] = Array.isArray(rawExport) ? rawExport : [rawExport];

            let registered = 0;
            for (const plugin of pluginList) {
                if (!isValidPlugin(plugin)) {
                    warn(
                        'plugin-loader',
                        `Plugin "${pluginRef}" exported an invalid rule (missing name or handler). Skipping.`
                    );
                    continue;
                }

                // RFC §7.6: Validate manifest if present
                const manifest = plugin.manifest;
                if (manifest) {
                    const compatError = validateManifestCompatibility(manifest, capabilities, pluginRef);
                    if (compatError) {
                        // Incompatible plugin — this is a hard error (throws)
                        throw new Error(compatError);
                    }
                    debug('plugin-loader', `  ✓ Manifest validated for "${manifest.name}@${manifest.version}"`);
                } else {
                    // No manifest — warn and continue (enforcement in next major)
                    warn(
                        'plugin-loader',
                        `Plugin "${pluginRef}" has no manifest. ` +
                        `Treating as a legacy plugin with no capability declarations. ` +
                        `Please add a PluginManifest export to ensure compatibility.`
                    );
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

// ============================================================
// HELPERS
// ============================================================

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

/**
 * Validates a plugin manifest against the current engine version and capabilities.
 *
 * Returns an error message string if incompatible, or null if compatible.
 *
 * Version range support (RFC §7.6 — no external semver dependency):
 *   Supports the most common range formats:
 *   - "*"           → always compatible
 *   - ">=X.Y.Z"     → current version must be >= X.Y.Z
 *   - "<X.Y.Z"      → current version must be < X.Y.Z
 *   - ">=X.Y.Z <A.B.C" → intersection of the above
 *   - "^X.Y.Z"      → >=X.Y.Z <(X+1).0.0  (caret range)
 *
 * For unsupported range formats the validation is skipped with a warning.
 */
function validateManifestCompatibility(
    manifest: PluginManifest,
    capabilities: EngineCapabilities,
    pluginRef: string
): string | null {
    // 1. Engine version range check
    const currentVersion = PACKAGE_VERSION.replace(/^v/, '');
    const rangeError = checkVersionRange(
        currentVersion,
        manifest.engineVersionRange,
        pluginRef,
        manifest.name,
        manifest.version
    );
    if (rangeError) return rangeError;

    // 2. Capability checks
    if (manifest.capabilities?.requiresTypeInfo && !capabilities.typeCheckingEnabled) {
        return (
            `Plugin "${manifest.name}@${manifest.version}" requires type information ` +
            `(requiresTypeInfo: true) but type-checking is not enabled in the current engine configuration. ` +
            `Enable type-checking or remove this plugin.`
        );
    }

    if (manifest.capabilities?.requiresTemplateAST && !capabilities.templateASTEnabled) {
        return (
            `Plugin "${manifest.name}@${manifest.version}" requires template AST ` +
            `(requiresTemplateAST: true) but template parsing is not available.`
        );
    }

    if (manifest.capabilities?.requiresCssAST && !capabilities.cssASTEnabled) {
        return (
            `Plugin "${manifest.name}@${manifest.version}" requires CSS AST ` +
            `(requiresCssAST: true) but CSS parsing is not available.`
        );
    }

    return null;
}

/**
 * Checks whether `currentVersion` satisfies the given `range` string.
 * Returns an error message if not satisfied, or null if satisfied / range is unrecognised.
 */
function checkVersionRange(
    currentVersion: string,
    range: string,
    pluginRef: string,
    pluginName: string,
    pluginVersion: string
): string | null {
    const trimmed = range.trim();

    if (!trimmed || trimmed === '*') return null;

    // Parse currentVersion into numeric tuple
    const current = parseVersion(currentVersion);
    if (!current) {
        warn('plugin-loader', `Cannot parse current tool version "${currentVersion}" — skipping range check for "${pluginRef}"`);
        return null;
    }

    // Expand caret range "^X.Y.Z" → ">=X.Y.Z <(X+1).0.0"
    const expandedRange = trimmed.startsWith('^')
        ? expandCaretRange(trimmed.slice(1))
        : trimmed;

    if (!expandedRange) {
        warn('plugin-loader', `Unsupported version range "${range}" in plugin "${pluginRef}" — skipping check`);
        return null;
    }

    // Split composite range by whitespace (e.g. ">=1.0.0 <2.0.0" → two constraints)
    const constraints = expandedRange.split(/\s+/).filter(Boolean);

    for (const constraint of constraints) {
        const match = constraint.match(/^(>=|<=|>|<|=|==)(\d+\.\d+\.\d+.*)$/);
        if (!match) {
            warn('plugin-loader', `Unrecognised constraint "${constraint}" in range "${range}" for "${pluginRef}" — skipping`);
            continue;
        }

        const op = match[1] as '>=' | '<=' | '>' | '<' | '=' | '==';
        const required = parseVersion(match[2]);
        if (!required) {
            warn('plugin-loader', `Cannot parse version "${match[2]}" in range "${range}" for "${pluginRef}" — skipping`);
            continue;
        }

        const cmp = compareVersions(current, required);
        const satisfied =
            op === '>=' ? cmp >= 0 :
                op === '<=' ? cmp <= 0 :
                    op === '>' ? cmp > 0 :
                        op === '<' ? cmp < 0 :
            /* = | == */  cmp === 0;

        if (!satisfied) {
            return (
                `Plugin "${pluginName}@${pluginVersion}" requires engine version "${range}" ` +
                `but the current version is "${currentVersion}". ` +
                `Update ngcompass or use a compatible plugin version.`
            );
        }
    }

    return null;
}

// ============================================================
// VERSION UTILITIES
// ============================================================

type VersionTuple = [number, number, number];

function parseVersion(v: string): VersionTuple | null {
    const parts = v.replace(/^v/, '').split('.').map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return null;
    return [parts[0], parts[1], parts[2]];
}

function compareVersions(a: VersionTuple, b: VersionTuple): number {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
}

function expandCaretRange(base: string): string | null {
    const parsed = parseVersion(base);
    if (!parsed) return null;
    const [major] = parsed;
    const nextMajor = major + 1;
    return `>=${base} <${nextMajor}.0.0`;
}

