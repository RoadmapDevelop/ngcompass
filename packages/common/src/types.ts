import type { Program } from 'oxc-parser';
import type { Locator } from './utils/locator.js';
import type { ParseError } from './errors.js';

export type Severity = 'warn' | 'error';

export const RuleCategory = {
  Architecture: 'architecture',
  Performance: 'performance',
  SSR: 'ssr',
  Security: 'security',
  Accessibility: 'accessibility',
  Testing: 'testing',
  CodeSmell: 'code-smell',
  Reactivity: 'reactivity',
  BestPractice: 'best-practice',
} as const;

export type RuleCategory = (typeof RuleCategory)[keyof typeof RuleCategory];

export type Result<T, E = Error> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: E };

export const Ok = <T>(data: T): Result<T, never> => ({ ok: true, data });

export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type RuleSeverity = Severity | 'off';

export type RuleConfigShorthand = RuleSeverity;

export interface RuleConfigFull {
  readonly severity: RuleSeverity;
  readonly options?: Readonly<Record<string, unknown>>;
}

export type RuleConfig = RuleConfigShorthand | RuleConfigFull;

export type RulesConfig = Readonly<Record<string, RuleConfig>>;

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
}

export interface ResolvedRule {
  readonly name: string;
  readonly severity: RuleSeverity;
  readonly options: Readonly<Record<string, unknown>>;
  readonly metadata: RuleMetadata;
}

export type ResolvedRulesMap = ReadonlyMap<string, ResolvedRule>;

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
  };
}

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

export interface RuleListEntry {
  readonly name: string;
  readonly description: string;
  readonly domain: string;
  readonly severity: string;
  readonly presets: readonly string[];
}

export interface RuleFailure {
  readonly filePath: string;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly severity: RuleSeverity;
  readonly ruleName: string;

  readonly fix?: string;

  readonly codeExample?: string;
}

export interface RuleResult {
  readonly ruleName: string;
  readonly failures: ReadonlyArray<RuleFailure>;
  readonly taskId?: string;
}

export interface TemplateAst {
  readonly rootNodes: ReadonlyArray<unknown>;

  readonly errors: ReadonlyArray<unknown>;

  readonly templateStartOffset: number;
}

export interface StyleAst {
  readonly ok: boolean;

  readonly code?: Buffer | Uint8Array;

  readonly error?: unknown;
}

export interface ComponentFiles {
  readonly tsPath: string;

  readonly templatePath?: string;

  readonly stylePaths: ReadonlyArray<string>;

  readonly specPath?: string;
}

export interface NgModuleInfo {
  readonly filePath: string;

  readonly declarations: ReadonlySet<string>;

  readonly imports: ReadonlySet<string>;

  readonly exports: ReadonlySet<string>;

  readonly providers: ReadonlySet<string>;

  readonly isStandalone: boolean;
}

export interface ProjectContext {
  readonly importGraph: ReadonlyMap<string, ReadonlySet<string>>;

  readonly reverseImportGraph: ReadonlyMap<string, ReadonlySet<string>>;

  readonly ngModuleMap: ReadonlyMap<string, NgModuleInfo>;

  readonly standaloneComponents: ReadonlySet<string>;

  readonly classToFile: ReadonlyMap<string, string>;

  readonly componentGraph: ReadonlyMap<string, ComponentFiles>;

  readonly projectFiles: ReadonlySet<string>;

  readonly rootDir: string;

  readonly barrelFiles: ReadonlySet<string>;

  readonly externalDeps: ReadonlyMap<string, ReadonlySet<string>>;

  readonly templateToComponent: ReadonlyMap<string, string>;
}

export interface ComponentCrossRef {
  readonly componentPath: string;

  readonly templatePath?: string;

  readonly stylePaths: ReadonlyArray<string>;

  readonly specPath?: string;

  readonly publicMembers?: ReadonlySet<string>;

  readonly signalMembers?: ReadonlySet<string>;

  readonly templateReferences?: ReadonlySet<string>;
}

export interface AngularTypeIndex {
  isFromPackage(
    symbol: import('typescript').Symbol | undefined,
    packageName: string
  ): boolean;

  isFromAngularCore(symbol: import('typescript').Symbol | undefined): boolean;

  isSignal(type: import('typescript').Type | undefined): boolean;

  isWritableSignal(type: import('typescript').Type | undefined): boolean;

  isObservable(type: import('typescript').Type | undefined): boolean;

  isSubjectLike(type: import('typescript').Type | undefined): boolean;

  isHttpClient(type: import('typescript').Type | undefined): boolean;

  isInjectionToken(type: import('typescript').Type | undefined): boolean;

  isEventEmitter(type: import('typescript').Type | undefined): boolean;

  isChangeDetectorRef(type: import('typescript').Type | undefined): boolean;

  isInjectableClass(symbol: import('typescript').Symbol | undefined): boolean;
}

export interface RuleContext {
  readonly sourceFile?: import('typescript').SourceFile;
  readonly filePath: string;
  readonly fileContent: string;
  readonly locator: Locator;
  readonly program?: Program;
  readonly typeChecker?: import('typescript').TypeChecker;

  readonly template?: TemplateAst;

  readonly templateFilePath?: string;
  readonly templateFileContent?: string;
  readonly templateLocator?: Locator;

  readonly style?: StyleAst;
  readonly options?: Readonly<Record<string, unknown>>;

  readonly project?: ProjectContext;

  readonly crossRef?: ComponentCrossRef;

  readonly angularTypes?: AngularTypeIndex;
}

export interface AnalysisResult {
  readonly results: ReadonlyArray<RuleResult>;

  readonly parseErrors: ReadonlyArray<ParseError>;
  readonly stats: {
    readonly totalFiles: number;
    readonly totalErrors: number;
    readonly totalWarnings: number;
    readonly duration: number;

    readonly cacheHitRate?: number;
  };
}

export interface WorkerTaskError {
  readonly task: { readonly taskId: string };
  readonly error: string;
}

export interface HeapUsage {
  readonly usedBytes: number;
  readonly limitBytes: number;
}

export interface WorkerFileProgress {
  readonly kind: 'file-progress';
  readonly filePath: string;
  readonly taskCount: number;
  readonly issueCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly duration: number;
  readonly typeAware: boolean;
}

export interface WorkerMessageResult {
  readonly results: RuleResult[];
  readonly errors: WorkerTaskError[];
}
