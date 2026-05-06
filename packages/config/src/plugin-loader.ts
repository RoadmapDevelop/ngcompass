import { createRequire } from 'node:module';
import { warn, debug } from '@ngcompass/common';
import type {
    PluginManifest,
    RuleRegistry,
    RulePlugin
} from '@ngcompass/common';
import { PACKAGE_VERSION } from '@ngcompass/common';

/**
 * Engine capabilities available at load time.
 * These are used to ensure a plugin doesn't request a feature (like Type Checking)
 * that isn't currently active in the engine.
 */
export interface EngineCapabilities {
    readonly typeCheckingEnabled: boolean;
    readonly templateASTEnabled: boolean;
    readonly cssASTEnabled: boolean;
}

/** * Default capabilities (conservative) 
 * Assumes core parsing is available but advanced features are disabled.
 */
const DEFAULT_CAPABILITIES: EngineCapabilities = {
    typeCheckingEnabled: false,
    templateASTEnabled: true,
    cssASTEnabled: true,
};

/**
 * Orchestrates the resolution, importing, and registration of external rule plugins.
 * * @param plugins - Specifiers for plugins (npm packages or relative paths).
 * @param configDir - The directory of the configuration file, used as the resolution root.
 * @param registry - The registry where validated rules will be stored.
 * @param capabilities - The current engine feature set for compatibility checks.
 * * @throws {Error} Aggregate error if one or more plugins fail to load or validate.
 */
export const loadPlugins = async (
    plugins: string[],
    configDir: string,
    registry: RuleRegistry,
    capabilities: EngineCapabilities = DEFAULT_CAPABILITIES,
): Promise<void> => {
    if (plugins.length === 0) return;

    debug('plugin-loader', `Initializing loader for ${plugins.length} plugin(s) at ${configDir}`);

    const _require = createRequire(configDir + '/package.json');
    const pluginErrors: string[] = [];

    for (const pluginRef of plugins) {
        try {
            /**
             * Phase 1: Resolution
             * Locates the plugin on the filesystem, prioritizing project-local 
             * node_modules via the configuration directory.
             */
            let resolvedPath: string;
            try {
                resolvedPath = _require.resolve(pluginRef);
            } catch {
                resolvedPath = pluginRef;
            }

            /**
             * Phase 2: Dynamic Import
             * Loads the module. Supports both ESM and CJS via dynamic import().
             */
            const module = await import(resolvedPath);
            const rawExport = module.default ?? module;
            const pluginList: RulePlugin[] = Array.isArray(rawExport) ? rawExport : [rawExport];

            let registeredCount = 0;

            /**
             * Phase 3: Validation & Registration
             * Each rule in the plugin is verified for structure and manifest compatibility.
             */
            for (const plugin of pluginList) {
                if (!isValidPlugin(plugin)) {
                    warn('plugin-loader', `Plugin "${pluginRef}" exported an invalid structure. Skipping.`);
                    continue;
                }

                const { manifest } = plugin;

                if (manifest) {
                    const error = validateManifestCompatibility(manifest, capabilities);
                    if (error) throw new Error(error);

                    debug('plugin-loader', `❯ Validated: ${manifest.name}@${manifest.version}`);
                } else {
                    warn('plugin-loader', `Plugin "${pluginRef}" is missing a manifest. Please update for future compatibility.`);
                }

                registry.register(plugin);
                registeredCount++;
                debug('plugin-loader', `❯ Registered Rule: ${plugin.name}`);
            }

            debug('plugin-loader', `Plugin "${pluginRef}" processed: ${registeredCount} rules active.`);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            pluginErrors.push(`- "${pluginRef}": ${message}`);
        }
    }

    if (pluginErrors.length > 0) {
        throw new Error(
            `[ngcompass] Plugin Load Failure:\n${pluginErrors.join('\n')}\n` +
            `Ensure plugins are installed and satisfy version requirements.`
        );
    }
};

/**
 * Validates that an object conforms to the RulePlugin interface.
 */
function isValidPlugin(value: unknown): value is RulePlugin {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    const handler = p.handler as { handle?: unknown } | undefined;

    return (
        typeof p.name === 'string' &&
        p.name.length > 0 &&
        handler?.handle instanceof Function
    );
}

/**
 * Validates a plugin's declared requirements against the running engine.
 */
function validateManifestCompatibility(
    manifest: PluginManifest,
    capabilities: EngineCapabilities,
): string | null {
    const currentVersion = PACKAGE_VERSION.replace(/^v/, '');

    /**
     * Requirement: Version Range
     */
    const rangeError = checkVersionRange(
        currentVersion,
        manifest.engineVersionRange,
        manifest.name,
        manifest.version
    );
    if (rangeError) return rangeError;

    /**
     * Requirement: Engine Capabilities
     */
    const requirements = [
        { key: 'requiresTypeInfo', current: capabilities.typeCheckingEnabled, label: 'Type Information' },
        { key: 'requiresTemplateAST', current: capabilities.templateASTEnabled, label: 'Template AST' },
        { key: 'requiresCssAST', current: capabilities.cssASTEnabled, label: 'CSS AST' }
    ] as const;

    for (const req of requirements) {
        if (manifest.capabilities?.[req.key] && !req.current) {
            return `Plugin "${manifest.name}@${manifest.version}" requires ${req.label} support, which is currently disabled.`;
        }
    }

    return null;
}

/**
 * Simple SemVer range checker.
 * Note: Avoids external dependencies by handling common caret and comparison ranges manually.
 */
function checkVersionRange(
    currentVersion: string,
    range: string,
    pluginName: string,
    pluginVersion: string
): string | null {
    const trimmed = range.trim();
    if (!trimmed || trimmed === '*') return null;

    const current = parseVersion(currentVersion);
    if (!current) return null;

    const expanded = trimmed.startsWith('^') ? expandCaretRange(trimmed.slice(1)) : trimmed;
    if (!expanded) return null;

    const constraints = expanded.split(/\s+/).filter(Boolean);

    for (const constraint of constraints) {
        const match = constraint.match(/^(>=|<=|>|<|=|==)(\d+\.\d+\.\d+.*)$/);
        if (!match) continue;

        const op = match[1];
        const required = parseVersion(match[2]);
        if (!required) continue;

        const diff = compareVersions(current, required);
        const isSatisfied =
            op === '>=' ? diff >= 0 :
                op === '<=' ? diff <= 0 :
                    op === '>' ? diff > 0 :
                        op === '<' ? diff < 0 :
                            diff === 0;

        if (!isSatisfied) {
            return `Plugin "${pluginName}@${pluginVersion}" requires engine "${range}", found "${currentVersion}".`;
        }
    }

    return null;
}

/**
 * Version parsing and comparison utilities.
 */
type VersionTuple = [number, number, number];

function parseVersion(v: string): VersionTuple | null {
    const match = v.trim().match(/^v?\.?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: VersionTuple, b: VersionTuple): number {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
}

function expandCaretRange(base: string): string | null {
    const parsed = parseVersion(base);
    return parsed ? `>=${base} <${parsed[0] + 1}.0.0` : null;
}
