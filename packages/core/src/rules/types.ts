/**
 * Rule Resolution Types
 *
 * Types for Phase 1.5: Rule Discovery & Resolution
 * Handles loading, merging, and resolving rules from config + presets
 */

import { Severity, Result, Ok, Err } from "@ngcompass/common";
import type { Locator } from "../utils/locator.js";

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
export type PresetReference = string;

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
// Result type imported from @ngcompass/common
export type { Result };
export { Ok, Err };

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
// ==============================================================================
// RULE EXECUTION TYPES
// ==============================================================================

export interface RuleFailure {
    readonly filePath: string;
    readonly message: string;
    readonly line: number;
    readonly column: number;
    readonly severity: RuleSeverity;
    readonly ruleName: string;
    /**
     * Optional actionable fix recommendation shown in reporter output.
     * Plain English description of how to resolve the violation.
     * Example: "Add standalone: true to @Component({ ... })"
     */
    readonly fix?: string;
}

export interface RuleResult {
    readonly ruleName: string;
    readonly failures: ReadonlyArray<RuleFailure>;
    readonly taskId?: string;
}

export interface RuleContext {
    readonly sourceFile?: import('typescript').SourceFile; // Deprecated
    readonly filePath: string; // The file being analyzed
    readonly fileContent: string; // Raw content for line/col mapping
    readonly locator: Locator; // Line/column mapping helper
    readonly program?: import('oxc-parser').Program;
    readonly template?: import('../parsers/html').HtmlParserResult;
    readonly style?: import('../parsers/css').CssParserResult;
    readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Analysis aggregate output.
 */
export interface AnalysisResult {
    readonly results: ReadonlyArray<RuleResult>;
    /**
     * Parse errors encountered during analysis (collected, not thrown).
     * Allows analysis to continue for other files while surfacing tool errors
     * separately from rule violations in the reporter output.
     */
    readonly parseErrors: ReadonlyArray<import('@ngcompass/common').ParseError>;
    readonly stats: {
        readonly totalFiles: number;
        readonly totalErrors: number;
        readonly totalWarnings: number;
        readonly duration: number;
    };
}

