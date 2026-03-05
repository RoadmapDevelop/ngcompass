/**
 * Core type definitions
 */

import type { Program } from "oxc-parser";
import type { Locator } from "./utils/locator.js";
import type { ParseError } from "./errors.js";

/**
 * Violation severity levels:
 *
 *   error  — hard-constraint violations that should block CI / fail the run.
 *   warn   — advisory violations surfaced as warnings.
 */
export type Severity = 'warn' | 'error';

/**
 * Rule categories for organization
 */
export enum RuleCategory {
    Architecture = 'architecture',
    Performance = 'performance',
    SSR = 'ssr',
    Security = 'security',
    Accessibility = 'accessibility',
    Testing = 'testing',
    CodeSmell = 'code-smell',
    Reactivity = 'reactivity',
    BestPractice = 'best-practice',
}

/**
 * Result type for functional error handling
 */
export type Result<T, E = Error> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: E };

/**
 * Creates a successful result
 */
export const Ok = <T>(data: T): Result<T, never> => ({ ok: true, data });

/**
 * Creates a failed result
 */
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

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
    | 'reactivity'
    | 'all';

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
export type RuleRegistryMap = ReadonlyMap<string, RuleRegistryEntry>;

export interface RegisterOptions {
    allowOverride?: boolean;
}

export interface RulePlugin {
    readonly name: string;
    /**
     * The rule handler. Typed as `unknown` here because `@ngcompass/common`
     * cannot import `RuleHandler` from `@ngcompass/engine` (would create a
     * circular dependency). Call sites in `@ngcompass/rules` narrow this to
     * `RuleHandler<unknown>` when registering.
     */
    readonly handler: unknown;
    readonly meta?: Partial<RuleMetadata>;
    readonly manifest?: import('./interfaces.js').PluginManifest;
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
    /**
     * Optional multi-line code snippet illustrating the correct pattern.
     * Displayed below the fix recommendation when no auto-fix is available.
     * Use plain TypeScript — no ANSI codes.
     */
    readonly codeExample?: string;
}

export interface RuleResult {
    readonly ruleName: string;
    readonly failures: ReadonlyArray<RuleFailure>;
    readonly taskId?: string;
}

// ==============================================================================
// TEMPLATE / STYLE AST TYPES
// (Defined here — not imported from @ngcompass/ast — to avoid a circular dep:
//  @ngcompass/ast already depends on @ngcompass/common)
// ==============================================================================

/**
 * Minimal parsed template AST handed to rules via `RuleContext.template`.
 * Mirrors `@ngcompass/ast`'s `HtmlParserResult` without importing it.
 *
 * Rule authors: access `rootNodes` to traverse the Angular HTML tree.
 * Each node is typed `unknown` here; use `@ngcompass/ast`'s node interfaces
 * (e.g. `Element`, `Text`, `BoundAttribute`) for narrowing.
 */
export interface TemplateAst {
    /** Root-level parsed nodes from the Angular HTML parser. */
    readonly rootNodes: ReadonlyArray<unknown>;
    /** Parse errors emitted by the HTML parser (does not throw). */
    readonly errors: ReadonlyArray<unknown>;
    /**
     * Byte offset of the first template character inside the source file.
     * - External `.html` files: always `0`.
     * - Inline templates inside `.ts` files: position after the opening quote.
     * Add this value to node `sourceSpan.start` before calling
     * `context.locator.location()` to obtain correct line/column numbers.
     */
    readonly templateStartOffset: number;
}

/**
 * Minimal parsed style AST handed to rules via `RuleContext.style`.
 * Mirrors `@ngcompass/ast`'s `CssResult` without importing it.
 */
export interface StyleAst {
    /** Whether parsing succeeded. */
    readonly ok: boolean;
    /** Transformed CSS bytes — present when `ok` is `true`. */
    readonly code?: Buffer | Uint8Array;
    /** Parse/transform error — present when `ok` is `false`. */
    readonly error?: unknown;
}

export interface RuleContext {
    /**
     * Lazily-created TypeScript `SourceFile` for this file.
     *
     * Populated on first access by `rule-utils.ts`:`getTsSymbolAtNode()` when a rule
     * requests TypeChecker-based symbol resolution. Creating a `SourceFile` is O(n)
     * in source length; caching it here ensures the cost is paid at most once per
     * file, regardless of how many rules request type information.
     *
     * Rule authors: **do not read or write this field directly.** Use
     * `getTsSymbolAtNode(node, context)` from `rule-utils` instead.
     */
    readonly sourceFile?: import('typescript').SourceFile;
    readonly filePath: string; // The file being analyzed
    readonly fileContent: string; // Raw content for line/col mapping
    readonly locator: Locator; // Line/column mapping helper
    readonly program?: Program;
    readonly typeChecker?: import('typescript').TypeChecker; // Added for advanced type-aware rules
    /**
     * Parsed template AST — use `rootNodes` to traverse the Angular HTML tree.
     * Typed as `TemplateAst` (defined above) to avoid a circular dep on `@ngcompass/ast`.
     */
    readonly template?: TemplateAst;
    /**
     * Parsed style AST — check `ok` before accessing `code`.
     * Typed as `StyleAst` (defined above) to avoid a circular dep on `@ngcompass/ast`.
     */
    readonly style?: StyleAst;
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
    readonly parseErrors: ReadonlyArray<ParseError>;
    readonly stats: {
        readonly totalFiles: number;
        readonly totalErrors: number;
        readonly totalWarnings: number;
        readonly duration: number;
        /**
         * Fraction of tasks whose results were served from cache (0–1).
         * `undefined` when no cache is in use (e.g. first cold run or worker path).
         * Consumers can display this as a percentage: `(cacheHitRate * 100).toFixed(1)%`.
         */
        readonly cacheHitRate?: number;
    };
}

// ==============================================================================
// WORKER INTEROP TYPES  (ENGINE-008)
// Defined here so both @ngcompass/engine and @ngcompass/rules share a single
// source of truth instead of duplicating local interfaces in each package.
// ==============================================================================

/** Describes a task that failed inside a worker thread. */
export interface WorkerTaskError {
    readonly task: { readonly taskId: string };
    readonly error: string;
}

/** Message posted back from a worker thread to the orchestrator. */
export interface WorkerMessageResult {
    readonly results: RuleResult[];
    readonly errors: WorkerTaskError[];
}
