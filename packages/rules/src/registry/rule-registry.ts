import type { RuleListEntry } from '@ngcompass/common';
import type { RegisterOptions, RulePlugin } from '../models/index.js';
import type { RuleHandler } from '@ngcompass/engine';
import { RuleMetadata, RuleRegistryEntry } from '@ngcompass/common';
import { RECOMMENDATIONS } from '../recommendations.js';
import { getPresetsForRule } from '../presets/index.js';
import { allPreset } from '../presets/all.js';

const DEFAULT_RULE_CONFIG = { severity: 'warn' as const, options: {} };

export class RuleRegistry {
  private readonly _handlers = new Map<string, RuleHandler<unknown>>();
  private readonly _meta = new Map<string, Partial<RuleMetadata>>();

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

  get(name: string): RuleHandler<unknown> | undefined {
    return this._handlers.get(name);
  }

  has(name: string): boolean {
    return this._handlers.has(name);
  }

  getRuleNames(): ReadonlyArray<string> {
    return Array.from(this._handlers.keys());
  }

  getAll(): ReadonlyMap<string, RuleHandler<unknown>> {
    return this._handlers;
  }

  getMeta(name: string): Partial<RuleMetadata> | undefined {
    return this._meta.get(name);
  }

  getMetadata(name: string): RuleMetadata | undefined {
    if (!this._handlers.has(name)) return undefined;
    const overrides = this._meta.get(name) ?? {};
    return {
      name,
      description: overrides.description ?? `Rule: ${name}`,
      category: overrides.category ?? 'general',
      dependencyType: overrides.dependencyType ?? 'standalone',
      requires: { tsAst: true, ...overrides.requires },
      filePatterns: overrides.filePatterns,
      minAngularVersion: overrides.minAngularVersion,
    };
  }

  getRegistryEntry(name: string): RuleRegistryEntry | undefined {
    const metadata = this.getMetadata(name);
    if (!metadata) return undefined;
    return { name, metadata, defaultConfig: DEFAULT_RULE_CONFIG };
  }

  toReadonlyMap(): ReadonlyMap<string, RuleRegistryEntry> {
    const map = new Map<string, RuleRegistryEntry>();
    for (const name of this._handlers.keys()) {
      const entry = this.getRegistryEntry(name);
      if (entry) map.set(name, entry);
    }
    return map;
  }

  get size(): number {
    return this._handlers.size;
  }
}

let _globalRegistry: RuleRegistry | null = null;

export function getGlobalRegistry(): RuleRegistry {
  if (!_globalRegistry) {
    _globalRegistry = new RuleRegistry();
  }
  return _globalRegistry;
}

export function resetGlobalRegistry(): void {
  _globalRegistry = null;
}

export function isKnownRule(name: string): boolean {
  return getGlobalRegistry().has(name);
}

export function getRuleMetadata(name: string): RuleMetadata | undefined {
  return getGlobalRegistry().getMetadata(name);
}

export function getAllRuleNames(): ReadonlyArray<string> {
  return getGlobalRegistry().getRuleNames();
}

export function getRuleRegistryMap(): ReadonlyMap<
  string,
  RuleRegistryEntry
> {
  return getGlobalRegistry().toReadonlyMap();
}

export function getRuleListEntries(): RuleListEntry[] {
  const registry = getGlobalRegistry();
  const entries: RuleListEntry[] = [];

  for (const name of registry.getRuleNames()) {
    const meta = registry.getMetadata(name);
    entries.push({
      name,
      description:
        RECOMMENDATIONS[name] ?? meta?.description ?? `Rule: ${name}`,
      domain: meta?.category ?? 'general',
      severity: (allPreset.rules as Record<string, string>)[name] ?? 'warn',
      presets: getPresetsForRule(name),
    });
  }

  return entries;
}
