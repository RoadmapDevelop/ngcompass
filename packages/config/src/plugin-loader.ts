import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_VERSION, debug, warn } from '@ngcompass/common';
import type {
  PluginManifest,
  RulePlugin,
  RuleRegistry,
} from '@ngcompass/common';

export interface EngineCapabilities {
  readonly typeCheckingEnabled: boolean;
  readonly templateASTEnabled: boolean;
  readonly cssASTEnabled: boolean;
}

const DEFAULT_CAPABILITIES: EngineCapabilities = {
  typeCheckingEnabled: false,
  templateASTEnabled: true,
  cssASTEnabled: true,
};

export const loadPlugins = async (
  plugins: string[],
  configDir: string,
  registry: RuleRegistry,
  capabilities: EngineCapabilities = DEFAULT_CAPABILITIES
): Promise<void> => {
  if (plugins.length === 0) return;

  debug(
    'plugin-loader',
    `Initializing loader for ${plugins.length} plugin(s) at ${configDir}`
  );

  const requireFn = createRequire(path.join(configDir, 'package.json'));

  const errors: string[] = [];
  for (const pluginRef of plugins) {
    const error = await loadSinglePlugin(
      pluginRef,
      requireFn,
      capabilities,
      registry
    );
    if (error) errors.push(`- "${pluginRef}": ${error}`);
  }

  if (errors.length > 0) {
    throw new Error(
      `[ngcompass] Plugin Load Failure:\n${errors.join('\n')}\n` +
        `Ensure plugins are installed and satisfy version requirements.`
    );
  }
};

async function loadSinglePlugin(
  pluginRef: string,
  requireFn: NodeJS.Require,
  capabilities: EngineCapabilities,
  registry: RuleRegistry
): Promise<string | null> {
  try {
    const resolved = resolvePluginPath(pluginRef, requireFn);
    const rawExport = await importPluginModule(resolved);
    const pluginList: RulePlugin[] = Array.isArray(rawExport)
      ? rawExport
      : [rawExport];

    let registered = 0;
    for (const plugin of pluginList) {
      if (!isValidPlugin(plugin)) {
        warn(
          'plugin-loader',
          `Plugin "${pluginRef}" exported an invalid structure. Skipping.`
        );
        continue;
      }

      if (plugin.manifest) {
        const error = validateManifestCompatibility(
          plugin.manifest,
          capabilities
        );
        if (error) throw new Error(error);
        debug(
          'plugin-loader',
          `❯ Validated: ${plugin.manifest.name}@${plugin.manifest.version}`
        );
      } else {
        warn(
          'plugin-loader',
          `Plugin "${pluginRef}" is missing a manifest. Please update for future compatibility.`
        );
      }

      registry.register(plugin);
      registered++;
      debug('plugin-loader', `❯ Registered Rule: ${plugin.name}`);
    }

    debug(
      'plugin-loader',
      `Plugin "${pluginRef}" processed: ${registered} rules active.`
    );
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function resolvePluginPath(
  pluginRef: string,
  requireFn: NodeJS.Require
): string {
  try {
    return requireFn.resolve(pluginRef);
  } catch {
    return pluginRef;
  }
}

async function importPluginModule(resolvedPath: string): Promise<unknown> {
  const specifier = path.isAbsolute(resolvedPath)
    ? pathToFileURL(resolvedPath).href
    : resolvedPath;
  const module = await import(specifier);
  return (module as { default?: unknown }).default ?? module;
}

function isValidPlugin(value: unknown): value is RulePlugin {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  const handler = p.handler as { handle?: unknown } | undefined;
  return (
    typeof p.name === 'string' &&
    p.name.length > 0 &&
    typeof handler?.handle === 'function'
  );
}

function validateManifestCompatibility(
  manifest: PluginManifest,
  capabilities: EngineCapabilities
): string | null {
  const currentVersion = PACKAGE_VERSION.replace(/^v/, '');

  const rangeError = checkVersionRange(
    currentVersion,
    manifest.engineVersionRange,
    manifest.name,
    manifest.version
  );
  if (rangeError) return rangeError;

  const capabilityChecks = [
    {
      key: 'requiresTypeInfo',
      current: capabilities.typeCheckingEnabled,
      label: 'Type Information',
    },
    {
      key: 'requiresTemplateAST',
      current: capabilities.templateASTEnabled,
      label: 'Template AST',
    },
    {
      key: 'requiresCssAST',
      current: capabilities.cssASTEnabled,
      label: 'CSS AST',
    },
  ] as const;

  for (const check of capabilityChecks) {
    if (manifest.capabilities?.[check.key] && !check.current) {
      return `Plugin "${manifest.name}@${manifest.version}" requires ${check.label} support, which is currently disabled.`;
    }
  }

  return null;
}

type VersionTuple = [number, number, number];

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
const CONSTRAINT_RE = /^(>=|<=|>|<|=|==)(\d+\.\d+\.\d+.*)$/;

function parseVersion(v: string): VersionTuple | null {
  const match = v.trim().match(VERSION_RE);
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

  const expanded = trimmed.startsWith('^')
    ? expandCaretRange(trimmed.slice(1))
    : trimmed;
  if (!expanded) return null;

  const constraints = expanded.split(/\s+/).filter(Boolean);
  for (const constraint of constraints) {
    const match = constraint.match(CONSTRAINT_RE);
    if (!match) continue;

    const op = match[1];
    const required = parseVersion(match[2]);
    if (!required) continue;

    const diff = compareVersions(current, required);
    const satisfied =
      op === '>='
        ? diff >= 0
        : op === '<='
          ? diff <= 0
          : op === '>'
            ? diff > 0
            : op === '<'
              ? diff < 0
              : diff === 0;

    if (!satisfied) {
      return `Plugin "${pluginName}@${pluginVersion}" requires engine "${range}", found "${currentVersion}".`;
    }
  }

  return null;
}
