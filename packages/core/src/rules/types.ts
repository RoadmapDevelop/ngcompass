/**
 * Rule Resolution Types
 *
 * Types for Phase 1.5: Rule Discovery & Resolution
 * Handles loading, merging, and resolving rules from config + presets
 */

import { Severity } from "@ngcompass/common";

// ==============================================================================
// RULE CONFIGURATION
// ==============================================================================

/**
 * Rule severity levels
 */
export type RuleSeverity = Severity | 'off';

/**
 * Short-hand rule configuration (just severity)
 */
export type RuleConfigShorthand = RuleSeverity;

/**
 * Full rule configuration (severity + options)
 */
export interface RuleConfigFull {
    readonly severity: RuleSeverity;
    readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Rule configuration (either shorthand or full)
 */
export type RuleConfig = RuleConfigShorthand | RuleConfigFull;

/**
 * Rules object (ruleName → config)
 */
export type RulesConfig = Readonly<Record<string, RuleConfig>>;

// ==============================================================================
// RULE METADATA
// ==============================================================================

/**
 * Dependency types for rules
 */
export type RuleDependencyType = 'standalone' | 'component' | 'styles' | 'imports';

/**
 * AST requirements for a rule
 */
export interface RuleAstRequirements {
    readonly tsAst?: boolean;
    readonly htmlAst?: boolean;
    readonly cssAst?: boolean;
    readonly specAst?: boolean;
    readonly typeChecker?: boolean;
}

/**
 * File type patterns a rule applies to
 */
export interface RuleFilePatterns {
    readonly include?: ReadonlyArray<string>;  // e.g., ["*.component.ts"]
    readonly exclude?: ReadonlyArray<string>;  // e.g., ["*.spec.ts"]
}

/**
 * Rule metadata (describes rule behavior)
 */
export interface RuleMetadata {
    readonly name: string;
    readonly description: string;
    readonly category: string;  // e.g., "best-practices", "performance"
    readonly dependencyType: RuleDependencyType;
    readonly requires: RuleAstRequirements;
    readonly filePatterns?: RuleFilePatterns;
}

/**
 * Resolved rule (config + metadata)
 */
export interface ResolvedRule {
    readonly name: string;
    readonly severity: RuleSeverity;
    readonly options: Readonly<Record<string, unknown>>;
    readonly metadata: RuleMetadata;
}

/**
 * Map of resolved rules
 */
export type ResolvedRulesMap = ReadonlyMap<string, ResolvedRule>;

// ==============================================================================
// PRESET CONFIGURATION
// ==============================================================================

/**
 * Preset configuration file structure
 */
export interface PresetConfig {
    readonly name: string;
    readonly description?: string;
    readonly extends?: string | ReadonlyArray<string>;
    readonly rules: RulesConfig;
}

/**
 * Built-in preset names
 */
export type BuiltinPreset =
    | 'recommended'
    | 'strict'
    | 'performance'
    | 'accessibility';

/**
 * Preset reference (builtin or file path)
 */
export type PresetReference = BuiltinPreset | string;

// ==============================================================================
// RESOLUTION RESULT
// ==============================================================================

/**
 * Rule resolution result
 */
export interface RuleResolutionResult {
    readonly rules: ResolvedRulesMap;
    readonly metadata: {
        readonly totalRules: number;
        readonly enabledRules: number;
        readonly disabledRules: number;
        readonly presetsLoaded: ReadonlyArray<string>;
        readonly resolutionTime: number;
    };
}

/**
 * Result type for rule resolution
 */
export type Result<T, E = Error> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: E };

export const Ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// ==============================================================================
// RULE REGISTRY ENTRY
// ==============================================================================

/**
 * Rule registry entry (for looking up metadata)
 */
export interface RuleRegistryEntry {
    readonly name: string;
    readonly metadata: RuleMetadata;
    readonly defaultConfig: RuleConfigFull;
}

/**
 * Rule registry (ruleName → entry)
 */
export type RuleRegistry = ReadonlyMap<string, RuleRegistryEntry>;
