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
    /**
     * Set to `true` when the rule needs the project-wide import graph,
     * component → template mapping, or other cross-file metadata provided
     * by `ProjectContext`.
     *
     * Rules declaring this are routed to the type-aware execution path (main
     * thread) so they always receive a populated `context.project`.
     * Implies `typeChecker` for routing purposes (the TypeScript Program is
     * required to build the import graph).
     */
    readonly projectContext?: boolean;
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
// RULE LIST (for `compass rules` command)
// ==============================================================================

/**
 * A single entry in the rules list output.
 * Consumed by the RulesReporter to render a grouped, filterable rule catalog.
 */
export interface RuleListEntry {
    readonly name: string;
    readonly description: string;
    readonly domain: string;
    readonly severity: string;
    readonly presets: readonly string[];
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

// ==============================================================================
// PROJECT CONTEXT  (CTX-001)
// Shared, read-only, pre-computed project-level metadata passed to rules that
// declare `requires.projectContext: true`.  Built once per analysis run by
// `buildProjectContext()` in @ngcompass/engine and threaded into RuleContext
// via RuleContextFactory.  All entries use absolute, normalised file paths.
// ==============================================================================

/**
 * Component file cluster: the TypeScript class file and its associated
 * template, styles, and spec (mirrors ComponentNode in @ngcompass/planner
 * without creating a cross-package dependency).
 */
export interface ComponentFiles {
    /** Absolute path to the `.component.ts` file. */
    readonly tsPath: string;
    /** Absolute path to the external template file, if any. */
    readonly templatePath?: string;
    /** Absolute paths to associated style files. */
    readonly stylePaths: ReadonlyArray<string>;
    /** Absolute path to the spec file, if any. */
    readonly specPath?: string;
}

/**
 * Angular module metadata extracted from `@NgModule` or standalone
 * `@Component` decorators.  Populated by CTX-004; initially empty.
 */
export interface NgModuleInfo {
    /** Absolute path to the module/component file. */
    readonly filePath: string;
    /** Class names declared in this module (or standalone imports array). */
    readonly declarations: ReadonlySet<string>;
    /** Class names imported by this module/standalone component. */
    readonly imports: ReadonlySet<string>;
    /** Class names exported from this module. */
    readonly exports: ReadonlySet<string>;
    /** Provider class names registered in this module/component. */
    readonly providers: ReadonlySet<string>;
    /** `true` for standalone components; `false` for NgModule-based. */
    readonly isStandalone: boolean;
}

/**
 * Project-wide, read-only context shared across all rules in a single run.
 *
 * Computed once by `buildProjectContext()` (@ngcompass/engine) before task
 * dispatch and injected into every `RuleContext` for rules that opt-in via
 * `requires.projectContext: true`.
 *
 * All file paths are absolute and normalised with `path.resolve()`.
 */
export interface ProjectContext {
    /**
     * Forward import graph: absolute file path → set of absolute paths it
     * directly imports (intra-project only; external packages excluded).
     */
    readonly importGraph: ReadonlyMap<string, ReadonlySet<string>>;

    /**
     * Reverse import graph: absolute file path → set of absolute paths that
     * directly import it.  Enables "who uses this file?" queries in O(1).
     */
    readonly reverseImportGraph: ReadonlyMap<string, ReadonlySet<string>>;

    /**
     * Angular module / standalone component map.  (CTX-004)
     *
     * Key:   absolute path to the `@NgModule` or standalone `@Component` file.
     * Value: `NgModuleInfo` with declarations, imports, exports, providers.
     *
     * Populated by scanning all `@NgModule` and `@Component({ standalone: true })`
     * decorators in the project.  Empty for files that are neither.
     */
    readonly ngModuleMap: ReadonlyMap<string, NgModuleInfo>;

    /**
     * Set of absolute file paths for all standalone Angular entities.  (CTX-004)
     *
     * Includes files that contain `@Component({ standalone: true })`,
     * `@Directive({ standalone: true })`, or `@Pipe({ standalone: true })`.
     *
     * Rules can use this to detect module-based components subject to a
     * standalone-first migration policy, or to validate that standalone
     * components only reference dependencies in their own `imports` array.
     */
    readonly standaloneComponents: ReadonlySet<string>;

    /**
     * Class name → absolute file path resolver.  (CTX-004)
     *
     * Maps the name of every exported class in the project to the absolute
     * path of the file that declares it.  Enables NgModule rules to resolve
     * the class names stored in `NgModuleInfo.declarations` / `imports` /
     * `exports` / `providers` to concrete file paths without a linear scan.
     *
     * Only directly-exported class declarations are indexed (`export class Foo`);
     * re-exports through barrel files are not followed.
     *
     * Example:
     *   `project.classToFile.get('FooComponent')` → `'/src/app/foo/foo.component.ts'`
     */
    readonly classToFile: ReadonlyMap<string, string>;

    /**
     * Component file cluster map.
     * Key: absolute path to the `.component.ts` file.
     * Value: associated template, styles, and spec paths.
     */
    readonly componentGraph: ReadonlyMap<string, ComponentFiles>;

    /**
     * Full set of absolute file paths discovered by the scanner for this run.
     */
    readonly projectFiles: ReadonlySet<string>;

    /** Root directory of the project (absolute, normalised). */
    readonly rootDir: string;

    // ── CTX-002 additions ────────────────────────────────────────────────────

    /**
     * Set of barrel file absolute paths.
     *
     * A barrel file is one whose every top-level statement is an
     * `export … from '…'` re-export declaration (no regular imports,
     * no class/function/variable declarations).  The canonical example is
     * an `index.ts` or `public-api.ts` that re-exports sibling modules.
     *
     * Rules can use this to skip barrel files (no logic to lint) or to
     * follow re-export chains when tracing where a symbol is consumed.
     */
    readonly barrelFiles: ReadonlySet<string>;

    /**
     * External dependency map (CTX-002).
     *
     * Key:   absolute path of the project source file.
     * Value: set of npm package names (scope-aware bare specifiers, e.g.
     *        `'@angular/core'`, `'rxjs'`) imported by that file.
     *
     * Sub-path specifiers are normalised to the package name:
     *   `'rxjs/operators'`      → `'rxjs'`
     *   `'@angular/core/rxjs-interop'` → `'@angular/core'`
     *
     * Relative imports and absolute paths are excluded.
     * Entries are only present for files that have at least one external dep —
     * files with no external deps simply have no entry in the map.
     */
    readonly externalDeps: ReadonlyMap<string, ReadonlySet<string>>;

    // ── CTX-003 additions ────────────────────────────────────────────────────

    /**
     * Reverse map: absolute template file path → absolute component `.ts` path.
     *
     * Enables template rules to answer "which component owns this template?"
     * in O(1) without scanning the whole `componentGraph`.
     *
     * Built automatically from `componentGraph` by `buildProjectContext()`.
     * Only files that have an explicit external template appear here; inline
     * templates are associated via `componentGraph` keyed on the `.ts` path.
     */
    readonly templateToComponent: ReadonlyMap<string, string>;
}

// ==============================================================================
// COMPONENT ↔ TEMPLATE CROSS-REFERENCE  (CTX-003)
// Structural and semantic link between a component class file and its
// associated template, styles, and spec.  Populated by RuleContextFactory
// when ProjectContext is available and the file under analysis is a component
// or its template.  Zero cost for all other file types.
// ==============================================================================

/**
 * Cross-reference between an Angular component and its associated files.
 *
 * Attached to `RuleContext.crossRef` for rules running on:
 *   - `.component.ts` files — gives access to `templatePath`, `stylePaths`,
 *     `specPath`, and `templateReferences` (members used in the template).
 *   - `.component.html` template files — gives access to `componentPath`
 *     and `publicMembers` (members declared on the component class).
 *
 * `undefined` for all other file types and when `project` is unavailable.
 */
export interface ComponentCrossRef {
    /** Absolute path to the `.component.ts` class file. */
    readonly componentPath: string;

    /**
     * Absolute path to the external template `.html` file.
     * `undefined` when the component uses an inline `template: '…'` string.
     */
    readonly templatePath?: string;

    /** Absolute paths to associated style files (`.scss`, `.css`, …). */
    readonly stylePaths: ReadonlyArray<string>;

    /** Absolute path to the spec file, if any. */
    readonly specPath?: string;

    /**
     * Names of public members (properties and methods) declared directly in
     * the component class, extracted from the TypeScript `SourceFile`.
     *
     * Available in **template rules** to verify that every bound property /
     * called method actually exists in the component class.
     *
     * Populated only when the type-aware execution path is active
     * (`ts.Program` exists).  Private, protected, and `#private` members are
     * excluded.
     */
    readonly publicMembers?: ReadonlySet<string>;

    /**
     * Identifiers from the template that reference the component — property
     * reads, method calls, and event-handler expressions whose implicit
     * receiver is the component instance (`this`).
     *
     * Available in **component rules** to detect unused public members (a
     * member not in this set is likely unreferenced in the template).
     *
     * Populated when the template AST is already loaded for the current
     * analysis batch (i.e. the rule or a peer rule declared `htmlAst: true`).
     */
    readonly templateReferences?: ReadonlySet<string>;
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
    /**
     * Project-wide cross-file metadata (import graph, component clusters, …).
     *
     * Populated only for rules that declare `requires.projectContext: true`.
     * `undefined` for all other rules — access is always guarded by an opt-in
     * flag so there is zero overhead on rules that don't need it.
     */
    readonly project?: ProjectContext;

    /**
     * Component ↔ template cross-reference (CTX-003).
     *
     * Non-`undefined` when `project` is available **and** the file under
     * analysis is either a `.component.ts` file or its associated template.
     * Provides structural links (paths) and optional semantic sets
     * (`publicMembers`, `templateReferences`) at zero extra parse cost for
     * files that don't match either category.
     */
    readonly crossRef?: ComponentCrossRef;
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
