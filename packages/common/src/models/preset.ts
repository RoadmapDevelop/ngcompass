import type { RulesConfig } from './rule-config.js';
import type { ResolvedRulesMap } from './rule-metadata.js';

export interface PresetConfig {
  readonly name: string;
  readonly description?: string;
  readonly extends?: string | ReadonlyArray<string>;
  readonly rules: RulesConfig;
}

export type BuiltinPreset =
  | 'recommended'
  | 'strict'
  | 'performance'
  | 'reactivity'
  | 'security'
  | 'ssr'
  | 'zoneless'
  | 'all';

export type PresetReference = string;

export interface RuleResolutionResult {
  readonly rules: ResolvedRulesMap;
  readonly metadata: {
    readonly totalRules: number;
    readonly enabledRules: number;
    readonly disabledRules: number;
    readonly presetsLoaded: ReadonlyArray<string>;
    readonly resolutionTime: number;
    readonly skippedByVersion: ReadonlyArray<string>;
  };
}
