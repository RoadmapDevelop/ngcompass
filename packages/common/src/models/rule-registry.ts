import type { RuleConfigFull } from './rule-config.js';
import type { RuleMetadata } from './rule-metadata.js';

export interface RuleRegistryEntry {
  readonly name: string;
  readonly metadata: RuleMetadata;
  readonly defaultConfig: RuleConfigFull;
}

export type RuleRegistryMap = ReadonlyMap<string, RuleRegistryEntry>;

export interface RegisterOptions {
  allowOverride?: boolean;
}

export interface RulePlugin {
  readonly name: string;

  readonly handler: unknown;
  readonly meta?: Partial<RuleMetadata>;
  readonly manifest?: import('./plugin.js').PluginManifest;
}

export interface RuleRegistry {
  register(plugin: RulePlugin, opts?: RegisterOptions): void;
  get(name: string): unknown;
  has(name: string): boolean;
  getRuleNames(): ReadonlyArray<string>;
  getAll(): ReadonlyMap<string, unknown>;
  getMeta(name: string): Partial<RuleMetadata> | undefined;
  getMetadata(name: string): RuleMetadata | undefined;
  getRegistryEntry(name: string): RuleRegistryEntry | undefined;
  toReadonlyMap(): ReadonlyMap<string, RuleRegistryEntry>;
  readonly size: number;
}
