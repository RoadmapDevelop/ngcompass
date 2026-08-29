import type { RuleSeverity } from './rule-config.js';

export type RuleDependencyType =
  | 'standalone'
  | 'component'
  | 'styles'
  | 'imports'
  | 'spec';

export interface RuleAstRequirements {
  readonly tsAst?: boolean;
  readonly htmlAst?: boolean;
  readonly cssAst?: boolean;
  readonly specAst?: boolean;
  readonly typeChecker?: boolean;

  readonly projectContext?: boolean;
}

export interface RuleFilePatterns {
  readonly include?: ReadonlyArray<string>;
  readonly exclude?: ReadonlyArray<string>;
}

export interface RuleMetadata {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly dependencyType: RuleDependencyType;
  readonly requires: RuleAstRequirements;
  readonly filePatterns?: RuleFilePatterns;
  readonly minAngularVersion?: string;
}

export interface ResolvedRule {
  readonly name: string;
  readonly severity: RuleSeverity;
  readonly options: Readonly<Record<string, unknown>>;
  readonly metadata: RuleMetadata;
}

export type ResolvedRulesMap = ReadonlyMap<string, ResolvedRule>;

export interface RuleListEntry {
  readonly name: string;
  readonly description: string;
  readonly domain: string;
  readonly severity: string;
  readonly presets: readonly string[];
}
