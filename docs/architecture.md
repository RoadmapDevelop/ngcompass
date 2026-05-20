# ngcompass Architecture

> Version: v0.1.4-beta

## 1. Purpose and Scope

ngcompass is a static analysis platform for Angular projects. It analyzes TypeScript classes, Angular templates, styles, RxJS usage, Signals patterns, SSR safety, security risks, and project-level architectural relationships. The product is implemented as a TypeScript monorepo with a CLI front end, a configuration and rule-resolution layer, a scanner, a task-centric execution planner, a high-performance analysis engine, a cache subsystem, and multiple reporters.

This document describes the architecture from process startup to final report emission. It is intended for maintainers, contributors, and technical reviewers who need to understand how data flows through the tool and where each subsystem is responsible for correctness, performance, and extensibility.

## 2. Architectural Principles

ngcompass follows these core design principles:

- Task-centric execution: each rule invocation against a file is represented as a content-addressed task.
- Single-pass analysis: rules are grouped and executed against shared AST traversals wherever possible.
- Incremental performance: file discovery, plan generation, per-task results, and full analysis results are cached independently.
- Angular-specific semantics: the planner and engine understand Angular components, templates, styles, specs, decorators, and project graph relationships.
- Explicit capability declaration: rules declare what resources they need, such as TypeScript AST, HTML AST, CSS AST, type checker, or project context.
- Plugin-ready boundary: rule registration is centralized in a registry that accepts built-in and external rules.
- Reporter isolation: analysis output is transformed into console, JSON, HTML/UI, or SARIF without changing core execution.

## 3. Monorepo Package Map

```mermaid
flowchart TB
    CLI["ngcompass<br/>Command parsing and run orchestration"]
    CONFIG["@ngcompass/config<br/>Config discovery, loading, validation, profiles, plugins"]
    SCANNER["@ngcompass/scanner<br/>Git/glob file discovery and filtering"]
    RULES["@ngcompass/rules<br/>Built-in rules, presets, registry, resolution"]
    PLANNER["@ngcompass/planner<br/>File classification, resource discovery, task graph"]
    ENGINE["@ngcompass/engine<br/>Task execution, contexts, workers, single-pass traversal"]
    AST["@ngcompass/ast<br/>Oxc TS parser, Angular HTML parser, CSS parser, streams"]
    CACHE["@ngcompass/cache<br/>Memory/disk drivers and cache services"]
    REPORTERS["@ngcompass/reporters<br/>Console, JSON, HTML/UI, SARIF"]
    COMMON["@ngcompass/common<br/>Shared types, constants, errors, logging"]
    SITE["@ngcompass/site<br/>Documentation/site package"]

    CLI --> CONFIG
    CLI --> SCANNER
    CLI --> RULES
    CLI --> PLANNER
    CLI --> ENGINE
    CLI --> REPORTERS
    CLI --> CACHE

    CONFIG --> COMMON
    CONFIG --> CACHE
    RULES --> ENGINE
    RULES --> COMMON
    PLANNER --> COMMON
    PLANNER --> CACHE
    ENGINE --> AST
    ENGINE --> PLANNER
    ENGINE --> CACHE
    ENGINE --> COMMON
    SCANNER --> CACHE
    SCANNER --> COMMON
    REPORTERS --> COMMON
    CACHE --> COMMON
```

### Package Responsibilities

| Package | Primary Responsibility | Key Artifacts |
|---|---|---|
| `ngcompass` | User-facing command line orchestration | `ngcompass analyze`, `init`, `config`, `cache`, `rules` |
| `@ngcompass/config` | Discover, load, normalize, validate, and profile configuration | `resolveConfig`, config health checks, plugin loader |
| `@ngcompass/scanner` | Discover source files from Git or glob patterns | `scan`, git discovery, filters, stats |
| `@ngcompass/rules` | Built-in rules, presets, rule registry, rule resolution | `registerAllBuiltinRules`, `resolveRules`, presets |
| `@ngcompass/planner` | Convert files plus rules into executable tasks | `buildExecutionPlan`, task IDs, resource graph, indexes |
| `@ngcompass/engine` | Execute tasks and aggregate results | `runAnalysis`, `executeBatchedTasks`, worker pool, type-aware context |
| `@ngcompass/ast` | Parse and traverse source artifacts | Oxc TypeScript AST, Angular HTML AST, CSS parser, node streams |
| `@ngcompass/cache` | Provide durable and memory caches | config, file, plan, result, analysis, AST, metadata caches |
| `@ngcompass/reporters` | Render results for humans and machines | console, JSON, SARIF, HTML/UI reporters |
| `@ngcompass/common` | Shared domain model and utilities | `AnalyzerConfig`, `RuleResult`, `RuleContext`, `ProjectContext` |

## 4. End-to-End Analysis Lifecycle

The `analyze` command is the primary workflow. It starts in `ngcompass` (CLI), then delegates to each subsystem in a strict sequence.

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant CLI as CLI Command
    participant Config as Config Loader
    participant Cache as Runtime Cache
    participant Scanner as Scanner
    participant Rules as Rule Resolver
    participant Planner as Planner
    participant Engine as Engine
    participant Reporter as Reporter

    User->>CLI: ngcompass analyze
    CLI->>Config: resolveConfig(cwd, profile)
    Config->>Cache: read cached validation if key matches
    Config-->>CLI: NormalizedAnalyzerConfig
    CLI->>Cache: createRuntimeCache(config, cwd)
    CLI->>Scanner: scan(include, exclude, tsconfig, cache)
    Scanner-->>CLI: Discovered files
    CLI->>Rules: resolveRules(config)
    Rules-->>CLI: Enabled resolved rules
    CLI->>Planner: buildExecutionPlan(files, rules, cache)
    Planner->>Cache: load full analysis or plan cache
    Planner->>Cache: filter per-task result cache
    Planner-->>CLI: ExecutionPlanOutput
    CLI->>Engine: runAnalysis(plan, cache, parser options)
    Engine->>Cache: retrieve skipped results
    Engine->>Cache: persist global analysis result
    Engine-->>CLI: AnalysisResult
    CLI->>Reporter: summary, parseErrors, report
    CLI->>Cache: save per-task results and flush
    Reporter-->>User: Console, JSON, HTML/UI, or SARIF output
```

The lifecycle is implemented in `packages/cli/src/commands/analyze.ts` as these conceptual stages:

1. Load configuration and plugins.
2. Discover files.
3. Resolve enabled rules.
4. Build an execution plan.
5. Run analysis.
6. Emit reports.
7. Save and flush caches.
8. Decide process exit code from configured failure policy.

## 5. CLI Startup and Command Orchestration

The binary entry point is `packages/cli/src/bin/ngcompass.ts`. Startup performs the following:

1. Creates a Commander program named `ngcompass`.
2. Registers global options: `-V, --version` and `--debug`.
3. Creates an initial cache context via `createCacheContext()`.
4. Registers signal and exception handlers (SIGINT, SIGTERM, uncaughtException, unhandledRejection).
5. Registers built-in rules into the global rule registry.
6. Registers CLI commands.
7. Parses the command line.
8. Flushes cache before normal exit.

```mermaid
flowchart TD
    Start["Process starts"]
    Program["Create Commander program"]
    GlobalOptions["Register global options and preAction hook"]
    Cache["Create startup CacheContext"]
    Signals["Install SIGINT, SIGTERM, exception handlers"]
    Rules["registerAllBuiltinRules()"]
    Commands["registerCommands(program, cache)"]
    Parse["program.parseAsync(process.argv)"]
    Flush["cache.flush()"]
    Exit["process.exit(code)"]

    Start --> Program --> GlobalOptions --> Cache --> Signals --> Rules --> Commands --> Parse --> Flush --> Exit
```

The CLI separates presentation from execution. It instantiates reporters early, but the analysis pipeline produces domain objects such as `ExecutionPlanOutput`, `AnalysisResult`, `RuleResult`, and `ParseError`. Reporters receive those objects after execution and transform them into the selected output format.

### 5.1 Command Flag Reference

**`analyze`** — run static analysis.

| Flag | Description |
|---|---|
| `-p, --profile <name>` | Configuration profile to run |
| `--force` | Ignore cached results and re-run all checks |
| `--format <fmt>` | Reporter format: `console` \| `json` \| `sarif` \| `html` \| `ui` |
| `--compact` | Use compact, ESLint-style output (console format only) |
| `-q, --quiet` | Show summary counts only, suppress violation details |
| `--no-recommendation` | Suppress fix recommendations from output |
| `--output <path>` | Output path for HTML reports (default: `ngcompass-report.html`) |
| `--rule <id>` | Run only one rule — useful for debugging or focused checks |
| `--mode <mode>` | Performance mode: `eco` \| `balanced` \| `turbo` (default: `balanced`) |
| `--max-workers <n>` | Cap the number of worker threads (lower = less memory, e.g. `--max-workers 2`) |
| `--skip-type-check` | Skip rules that require the TypeScript type checker (fastest, lowest memory) |

Hidden power-user flags (not shown in `--help`): `--type-aware-chunk-size`, `--type-aware-concurrency`, `--type-aware-file-concurrency`, `--type-aware-isolation`, `--type-aware-chunk-strategy`. See Section 11 for semantics.

**`init`** — create a starter configuration.

| Flag | Description |
|---|---|
| `-f, --force` | Overwrite an existing configuration file |
| `--cwd <path>` | Project directory where the configuration will be created (default: `process.cwd()`) |

**`config health`** — validate the active configuration.

| Flag | Description |
|---|---|
| `-p, --profile <name>` | Configuration profile to validate |

**`cache clear`** — clear cached data.

| Flag | Description |
|---|---|
| `-p, --profile <name>` | Configuration profile used to resolve cache settings |
| `--type <type>` | Cache type to clear: `ast` \| `config` \| `results` \| `all` (default: `all`) |

**`cache info`** and **`cache path`** both accept `-p, --profile <name>` to resolve profile-specific cache settings.

**`rules [ruleName]`** — browse or inspect rules.

| Flag | Description |
|---|---|
| `--preset <name>` | Filter by preset: `recommended` \| `strict` \| `performance` \| `reactivity` \| `all` |

## 6. Configuration Architecture

Configuration is handled by `@ngcompass/config`. Its public entry point is `resolveConfig`.

### 6.1 Discovery

Configuration discovery uses `lilconfig` and searches for:

- `ngcompass.config.ts`
- `ngcompass.config.js`
- `ngcompass.config.mjs`
- `ngcompass.config.cjs`
- `ngcompass.config.json`
- `.ngcompassrc`
- `.ngcompassrc.json`
- `package.json`

TypeScript and JavaScript config files are loaded through `jiti`. JSON and extensionless files are parsed as JSON. The discovery step also reads the raw file content and computes a SHA-1 content hash for validation cache keys.

### 6.2 Resolution and Validation

```mermaid
flowchart TD
    Find["findAndLoadConfig(cwd)"]
    Hash["Compute content hash"]
    CacheKey["Build validation cache key<br/>contentHash + profile + toolVersion + schemaVersion"]
    CacheHit{"Config cache hit?"}
    Validate["validateConfiguration(rawConfig, context)"]
    Normalize["Apply defaults, profiles, cache options, workers, output policy"]
    Health["Produce HealthReport"]
    Persist["Cache ConfigValidationResult"]
    Return["Return NormalizedAnalyzerConfig"]

    Find --> Hash --> CacheKey --> CacheHit
    CacheHit -- yes --> Return
    CacheHit -- no --> Validate --> Normalize --> Health --> Persist --> Return
```

The normalized configuration guarantees stable runtime fields:

- `cache` is always a full object, not a boolean.
- `maxWorkers` has a concrete numeric value.
- `outputFormat`, `failOnSeverity`, and `maxWarnings` are resolved.
- `rules` is always present.

Default cache behavior is enabled, local, and stored at `node_modules/.cache/ngcompass` with a 24-hour TTL. Default worker count is based on host CPU count minus one, capped at four workers by default, with a minimum of one. Users can still opt into more parallelism with `maxWorkers`.

### 6.3 Plugin Loading

When `config.plugins` is present, the CLI calls `loadPlugins(pluginList, configDir, getGlobalRegistry())`. Plugins register `RulePlugin` objects into the same `RuleRegistry` used by built-in rules. This keeps the engine independent from whether a rule is built in or external.

## 7. Scanner Architecture

The scanner converts configuration patterns into an absolute file list. It is optimized for large Git repositories but falls back to glob discovery when needed.

```mermaid
flowchart TD
    Input["ScanOptions<br/>rootDir, include, exclude, ignorePatterns"]
    Normalize["normalizeOptions"]
    Expand["expandPatterns"]
    TsConfig{"parserOptions.project?"}
    TsPatterns["Read tsconfig include/exclude/files"]
    Access["Validate rootDir accessibility"]
    Git{"Is Git repository?"}
    ScanCache{"File-list and stats cache hit?"}
    GitList["executeGitDiscovery"]
    Glob["executeGlob"]
    FilterGlob["filterByGlob"]
    ApplyFilters["applyFilters<br/>gitignore and configured ignores"]
    Stats["calculateStats"]
    Save["Save file-list and stats cache"]
    Output["ScanResult.files"]

    Input --> Normalize --> Expand --> TsConfig
    TsConfig -- yes --> TsPatterns --> Access
    TsConfig -- no --> Access
    Access --> Git --> ScanCache
    ScanCache -- yes --> Output
    ScanCache -- no --> GitList
    Git -- no --> Glob
    GitList --> FilterGlob --> ApplyFilters
    Glob --> ApplyFilters
    ApplyFilters --> Stats --> Save --> Output
```

The scanner cache stores the discovered file list plus scan statistics such as
extension counts and total size. On a cache hit it reuses those statistics
instead of restatting every file.

The scanner cache key includes:

- Normalized root directory.
- Expanded include and ignore patterns.
- Git repository fingerprint or directory fingerprint.
- Scanner cache version.

This means changes in tracked files, discovery patterns, or repository state invalidate the file-list cache.

## 8. Rule System Architecture

Rules are passive observers over pre-filtered node streams. They do not own the traversal. Instead, each rule declares:

- Name.
- Stream type.
- Handler.
- Metadata.
- Dependency type.
- Required analysis resources.

### 8.1 Rule Registry

The `RuleRegistry` is the single source of truth for handlers and metadata. It prevents accidental duplicate registration unless an explicit override option is supplied.

```mermaid
classDiagram
    class RuleRegistry {
        -Map handlers
        -Map meta
        +register(plugin, opts)
        +get(name)
        +has(name)
        +getRuleNames()
        +getAll()
        +getMetadata(name)
        +toReadonlyMap()
    }

    class RulePlugin {
        +name
        +handler
        +meta
        +manifest
    }

    class RuleHandler {
        +name
        +streamType
        +handle(node, context)
        +meta
    }

    RulePlugin --> RuleHandler
    RuleRegistry --> RulePlugin
```

### 8.2 Built-In Rule Domains

Built-in rules are registered in `packages/rules/src/registry/register-all.ts`. The domains are:

| Domain | Purpose |
|---|---|
| Correctness | Prevent defects, lifecycle misuse, memory leaks, and reactive side effects |
| Performance | Avoid rendering bottlenecks and change-detection inefficiencies |
| Security | Detect unsafe bindings and sanitization bypasses |
| SSR | Detect browser-only API usage and render lifecycle risks |
| Reactivity | Enforce RxJS and Angular Signals patterns |
| Modern API | Encourage Angular 17+ APIs such as `inject`, signal inputs, outputs, and models |
| Template | Enforce template syntax and async-pipe patterns |
| Testing | Detect focused tests and similar CI blind spots |

### 8.3 Rule Resolution

Rule resolution combines presets and local configuration:

```mermaid
flowchart TD
    Config["NormalizedAnalyzerConfig"]
    Extends["Resolve extends chain"]
    Presets["Load built-in or external presets"]
    Merge["Merge preset rules"]
    UserRules["Apply config.rules with highest precedence"]
    Registry["Lookup rule metadata in RuleRegistry"]
    Filter["Filter severity != off"]
    Enabled["Enabled ResolvedRulesMap"]

    Config --> Extends --> Presets --> Merge --> UserRules --> Registry --> Filter --> Enabled
```

The resolver skips unknown rules rather than crashing resolution. The validation layer can still report configuration issues depending on health checks.

## 9. Planner Architecture

The planner is the architectural center of ngcompass performance. It converts a file list and enabled rules into a set of executable tasks with stable content-addressed identities.

### 9.1 Planner Inputs and Outputs

Inputs:

- Absolute files from the scanner.
- Enabled `ResolvedRulesMap`.
- Project root.
- Runtime cache context.
- Incremental options, such as force rerun.
- Optional worker count and overrides.

Output:

- `tasks`: flat task-centric execution list.
- `plan`: file-centric compatibility view.
- `indexes`: precomputed lookup indexes.
- `skippedTasks`: tasks satisfied by the result cache.
- `cachedResults`: optional preloaded cached results.
- `globalHash`: content hash for the full plan and analysis result.
- `precomputedAnalysis`: full cached `AnalysisResult`, when available.
- `changedFiles` and `cachedFiles`.

### 9.2 Plan Build Flow

```mermaid
flowchart TD
    Start["buildExecutionPlan(options)"]
    Hasher["initHasher()"]
    Validate["Validate files and rules"]
    Context["Create TaskBuilderContext"]
    WarmMeta["Warm hash cache from metadata"]
    GlobalHash["calculateGlobalHash(files, rules, version context)"]
    AnalysisCache{"Full analysis cache hit?"}
    PlanCache{"Plan cache hit?"}
    ComponentGraph["Build ComponentDependencyGraph"]
    Preclassify["Preclassify logic files by Angular decorators"]
    BuildTasks["Build tasks per file and rule"]
    SavePlan["Serialize and cache full plan"]
    ResultCache["filterCachedTasks"]
    Indexes["Build file and task indexes"]
    Output["ExecutionPlanOutput"]

    Start --> Hasher --> Validate --> Context --> WarmMeta --> GlobalHash --> AnalysisCache
    AnalysisCache -- yes --> Output
    AnalysisCache -- no --> PlanCache
    PlanCache -- yes --> ResultCache
    PlanCache -- no --> ComponentGraph --> Preclassify --> BuildTasks --> SavePlan --> ResultCache
    ResultCache --> Indexes --> Output
```

Metadata warmup happens before `globalHash` calculation. On warm runs this lets
the planner rebuild the project hash from file stats plus persisted content
hashes, only re-reading files whose size or modification time changed. On cold
runs it also seeds the metadata cache before task construction so later warm
runs can avoid full-project content reads.

### 9.3 File Classification

The planner classifies files into the following `FileType` values:

- `component`
- `directive`
- `pipe`
- `service`
- `module`
- `guard`
- `logic`
- `angular-class`
- `spec`
- `template`
- `style`
- `config`
- `unknown`

Level-2 classification upgrades plain logic files to `angular-class` when the file content contains Angular decorators. This allows rules that target Angular classes to run on files that do not follow conventional file naming.

### 9.4 Resource Discovery

A rule task may depend on multiple related files:

- Primary TypeScript file.
- External or inline template.
- Style files.
- Spec file.

The planner builds a component dependency graph once per cold plan. The task builder then resolves component resources in O(1). If graph lookup misses, it falls back to directory discovery.

```mermaid
flowchart LR
    ComponentTS["example.component.ts"]
    Template["example.component.html"]
    Style1["example.component.scss"]
    Style2["example.component.css"]
    Spec["example.component.spec.ts"]

    ComponentTS --> Template
    ComponentTS --> Style1
    ComponentTS --> Style2
    ComponentTS --> Spec
```

### 9.5 Task Identity

The task is the fundamental execution unit.

```mermaid
classDiagram
    class Task {
        +taskId
        +ruleName
        +filePath
        +severity
        +options
        +inputs
        +needsTypeChecker
        +needsProjectContext
    }

    class TaskInputs {
        +typescript
        +template
        +styles
        +spec
    }

    class FileInput {
        +path
        +hash
        +needsAst
    }

    Task --> TaskInputs
    TaskInputs --> FileInput
```

`taskId` is calculated from:

- Rule name.
- Content hashes for all task inputs.
- Rule options.
- Optional cache key context, including tool and rule-set version information.

This makes cache invalidation precise. A template-only change invalidates the tasks that depend on that template. A rule option change invalidates tasks for that rule. A tool or rule registry change can invalidate old task IDs.

### 9.6 Incremental Filtering

After all tasks exist, the planner asks the result cache which `taskId`s already exist.

```mermaid
flowchart TD
    AllTasks["All generated tasks"]
    Force{"--force?"}
    HasMany["cache.results.hasMany(taskIds)"]
    Split["Split into pending and skipped"]
    Load{"loadCachedResults?"}
    GetMany["cache.results.getMany(cachedTaskIds)"]
    Incremental["IncrementalPlan"]

    AllTasks --> Force
    Force -- yes --> Incremental
    Force -- no --> HasMany --> Split --> Load
    Load -- yes --> GetMany --> Incremental
    Load -- no --> Incremental
```

The engine receives only pending tasks as `plan.tasks`, plus `skippedTasks` and optional cached results. This is why warm analysis can avoid AST parsing and rule execution entirely.

## 10. Engine Architecture

The engine executes an `ExecutionPlanOutput` and returns an `AnalysisResult`.

### 10.1 Execution Strategy

The engine splits pending tasks into two groups:

- Syntax-only tasks: do not need TypeScript type checker or project context.
- Type-aware tasks: require a TypeScript `Program`, `TypeChecker`, or `ProjectContext`.

```mermaid
flowchart TD
    Plan["ExecutionPlanOutput"]
    Precomputed{"precomputedAnalysis valid?"}
    Split["Split tasks"]
    Syntax["Syntax-only tasks"]
    TypeAware["Type-aware/project-context tasks"]
    WorkerDecision{"syntax task count > threshold?"}
    WorkerPool["Worker pool execution"]
    Local["Local pLimit execution"]
    TypeChunks["Chunked type-aware execution"]
    Cached["Retrieve skipped cached results"]
    Merge["Merge executed + cached results"]
    Stats["calculateStats"]
    Persist["Cache full AnalysisResult by globalHash"]
    Result["AnalysisResult"]

    Plan --> Precomputed
    Precomputed -- yes --> Result
    Precomputed -- no --> Split
    Split --> Syntax --> WorkerDecision
    WorkerDecision -- yes --> WorkerPool --> Merge
    WorkerDecision -- no --> Local --> Merge
    Split --> TypeAware --> TypeChunks --> Merge
    Plan --> Cached --> Merge
    Merge --> Stats --> Persist --> Result
```

### 10.2 Analysis Context

`AnalysisContext` provides memoized access to file resources:

- `readFile(filePath)`.
- `getProgram(filePath)` for Oxc AST.
- `getTemplate(filePath)` for external or inline Angular template AST.
- `getStyle(filePath)` for CSS-like style AST.
- `evict(filePath)` for memory control.

It uses an LRU cache for file content and maps for parsed artifacts. The engine evicts per-file resources after that file's task batch completes.

### 10.3 Type-Aware Context

`TypeAwareAnalysisContext` extends `AnalysisContext` with:

- `getTypeChecker(filePath)`.
- `getProjectContext()`.
- `getTsSourceFile(filePath)`.
- `warmup()`.

It creates a TypeScript `Program` from `parserOptions.project` or the nearest `tsconfig.json`. For large repositories it narrows root names to the files in the current type-aware chunk. This controls memory while preserving TypeScript's transitive import resolution.

Project-context import graph construction uses TypeScript's module-resolution
cache while walking import specifiers, avoiding repeated package/path resolution
work inside each type-aware chunk.

Type-aware execution is chunked by file count. The default chunk size is 100 files, or 50 files for very large type-aware runs. Each chunk gets a fresh TypeScript `Program`, which becomes eligible for garbage collection after the chunk completes. Type-aware batches run one file batch at a time by default to avoid holding many parsed artifacts beside a TypeScript `Program`.

The adaptive chunk ceiling is computed at runtime from available memory, total
memory, CPU count, and the V8 heap limit. User-provided chunk size is treated as
the starting target, then clamped to that machine-derived cap. The cap is
speed-biased on machines with ample free memory, while low-memory systems keep
a smaller ceiling. During execution the chunk size steps down on high heap
pressure and grows only after sustained low pressure, so large machines can use
bigger Programs while smaller machines stay conservative.

Type-aware chunk ordering supports a dependency pre-pass or a simple path sort.
The dependency strategy reads TypeScript roots with bounded concurrency and
falls back to simple ordering if the pre-pass exceeds its time budget. The
simple strategy skips import inspection entirely, which is useful for very large
repositories where chunk preparation itself becomes visible.

Type-aware chunk concurrency is configurable and defaults to one. Raising it
allows multiple type-aware chunks to build separate TypeScript Programs at the
same time, trading memory for speed. The value is clamped by the effective
worker count and an absolute safety ceiling.

Type-aware file concurrency is a separate control inside each chunk. It reuses
the same TypeScript Program while processing multiple file batches at once,
which can improve throughput without creating additional Programs, but it may
hold more parsed file/template artifacts in memory.

Chunks that only need the TypeScript `TypeChecker` skip `ProjectContext`
construction. `ProjectContext` is built only for chunks containing
project-context rules, because import graphs, component graphs, and NgModule
maps add meaningful memory pressure on top of the compiler Program. After each
chunk the analysis context explicitly clears file, AST, template, style,
`Program`, `TypeChecker`, and `ProjectContext` references before the next chunk
starts.

### 10.4 Rule Context Factory

Before a rule batch executes, `RuleContextFactory` constructs a `RuleContext`:

```mermaid
flowchart TD
    File["filePath"]
    Context["ExecutionContext"]
    Content["fileContent"]
    Program["Oxc Program"]
    Locator["Locator line/column mapper"]
    TypeChecker["TypeChecker if available"]
    Template["Template AST if required"]
    Project["ProjectContext if available"]
    CrossRef["ComponentCrossRef when applicable"]
    RuleContext["RuleContext"]

    File --> Context
    Context --> Content
    Context --> Program
    Content --> Locator
    Context --> TypeChecker
    Context --> Template
    Context --> Project
    Project --> CrossRef
    Content --> RuleContext
    Program --> RuleContext
    Locator --> RuleContext
    TypeChecker --> RuleContext
    Template --> RuleContext
    Project --> RuleContext
    CrossRef --> RuleContext
```

The factory also builds component/template cross references when project context exists. Those cross references include:

- Component path.
- Template path.
- Style paths.
- Spec path.
- Public class members.
- Signal-like members.
- Template references.

## 11. Performance Modes

The `analyze` command exposes a single `--mode` flag that selects a named performance preset. Individual type-aware tuning flags still exist for power users but are hidden from `--help` to keep the interface simple. When an individual flag is passed it takes precedence over the active mode.

### 11.1 Mode Presets

| Setting | `eco` | `balanced` (default) | `turbo` |
|---|---|---|---|
| `typeAwareConcurrency` | 1 | 2 | 2 |
| `typeAwareFileConcurrency` | 1 | 2 | 4 |
| `typeAwareChunkSize` | 100 | 300 | 500 |
| `typeAwareIsolation` | auto | auto | off |
| `typeAwareChunkStrategy` | dependency | simple | simple |

**eco** minimizes memory by processing one type-aware chunk at a time with the safest chunk ordering strategy. It is the right choice for CI environments with limited RAM or for machines running many parallel jobs.

**balanced** is the default. It doubles chunk and file concurrency and switches to the simpler chunk strategy, which skips the import-graph pre-pass and produces meaningfully faster cold runs without significant memory overhead on typical developer machines.

**turbo** maximizes throughput by using larger chunks, more in-process file concurrency, and disabling process isolation entirely. It is suited for fast developer machines where memory is not a concern.

### 11.2 Priority Chain

```
explicit type-aware flag  >  --mode preset  >  engine default
```

This means `--mode turbo --type-aware-file-concurrency 8` uses the turbo preset for every setting except `typeAwareFileConcurrency`, which is overridden to 8.

`maxWorkers` keeps the existing configuration precedence: explicit `--max-workers` wins over the normalized config value.

### 11.3 Usage

```sh
ngcompass analyze                         # balanced (default)
ngcompass analyze --mode eco              # low memory, CI-friendly
ngcompass analyze --mode turbo            # maximum speed on capable machines
ngcompass analyze -p strict               # run with a named profile
ngcompass analyze --skip-type-check       # syntax-only, fastest path

# Power-user override: turbo preset with a custom chunk size
ngcompass analyze --mode turbo --type-aware-chunk-size 800
```

## 12. Single-Pass Analysis Engine

The single-pass engine is the high-throughput path for rule execution. It appears in `packages/engine/src/single-pass-engine.ts`.

Rules declare a `streamType`, such as:

- `AngularClass`
- `AnyAngularClass`
- `DecoratedProperty`
- `TemplateExpression`
- `TemplateAttribute`
- `TemplateBlock`
- `Template`
- `CallExpression`
- `NewExpression`

The engine builds a visitor map from stream type to Oxc AST node type:

```mermaid
flowchart LR
    Rules["Rule handlers"]
    VisitorMap["buildVisitorMap"]
    AST["Oxc Program"]
    Walk["walkProgram iterative DFS"]
    Dispatch["O(1) node.type dispatch"]
    Failures["Failures grouped by rule"]
    Template["Template analysis post-walk"]
    Results["RuleResult[]"]

    Rules --> VisitorMap
    AST --> Walk --> Dispatch --> Failures
    VisitorMap --> Dispatch
    Template --> Failures
    Failures --> Results
```

### 11.1 AST Traversal

The AST traversal is iterative pre-order DFS. It avoids recursive call-stack risk and avoids `Object.keys()` allocations on every node. Non-child fields such as `parent`, `span`, `loc`, `range`, `start`, `end`, and `type` are skipped.

### 11.2 Visitor Dispatch

For each AST node:

1. The engine reads `node.type`.
2. It looks up registered visitor entries for that node type.
3. Each entry filters the raw node into a stream-specific node.
4. Matching stream nodes are passed to the rule handler.
5. Failures are grouped by rule name.

Template streams are dispatched after the TypeScript AST walk. The engine calls `analyzeTemplate(context.template)` and dispatches template expressions, attributes, blocks, and whole-template analysis to template-specific handlers.

### 11.3 Performance Monitoring

The engine records:

- Total traversal time.
- Nodes visited.
- Per-rule timing and invocation count when debug/profiling is enabled.
- Component analyzer cache hits and misses.
- Performance budget violations.

Budgets differ depending on whether a type checker is present.

## 13. Worker Architecture

Worker execution is used for large sets of syntax-only tasks. Type-aware tasks remain on the main thread because they need a shared TypeScript `Program` and project context.

```mermaid
flowchart TD
    Tasks["Syntax-only tasks"]
    Group["Group by file"]
    Distribute["Distribute file groups by bucket load"]
    Worker1["Worker 1"]
    Worker2["Worker 2"]
    WorkerN["Worker N"]
    Progress["File progress events"]
    Results["RuleResult arrays"]
    Merge["Merged results"]

    Tasks --> Group --> Distribute
    Distribute --> Worker1
    Distribute --> Worker2
    Distribute --> WorkerN
    Worker1 --> Progress
    Worker2 --> Progress
    WorkerN --> Progress
    Worker1 --> Results
    Worker2 --> Results
    WorkerN --> Results
    Results --> Merge
```

Workers are resolved from the `@ngcompass/rules/execution-worker` package path when possible. If worker resolution fails, the engine falls back to local concurrent execution using `p-limit`.

The worker distribution algorithm keeps all tasks for the same file together. This prevents duplicate parsing and makes progress reporting file-oriented.

## 14. AST and Parsing Architecture

`@ngcompass/ast` provides parsing, node streams, template analysis, and traversal helpers.

| Artifact | Parser or Analyzer | Usage |
|---|---|---|
| TypeScript/TSX | `oxc-parser` | Fast syntax AST for rule streams |
| Angular HTML | `angular-html-parser` | Template expressions, attributes, blocks |
| CSS-like styles | CSS parser wrapper | Style-oriented rules |
| Inline templates | Template extractor from Oxc program | Maps inline template offsets to source locations |
| AST traversal | Iterative DFS walker | Single-pass engine traversal |

The Angular HTML parser is configured with Angular block tokenization enabled. Template ASTs preserve `templateStartOffset`, so inline-template diagnostics can be mapped back to the correct line and column in the TypeScript file.

## 15. Cache Architecture

The cache package provides multiple services over memory and disk drivers. Runtime cache is created from normalized config through `createRuntimeCache`.

```mermaid
flowchart TB
    Runtime["createRuntimeCache(config, cwd)"]
    Context["CacheContext"]
    Sources["sources<br/>memory"]
    AST["asts<br/>L1 memory + L2 disk/memory"]
    Results["results<br/>packed disk or memory"]
    Configs["configs<br/>atomic disk or memory"]
    Meta["metas<br/>JSON disk or memory"]
    Plans["plans<br/>disk or memory"]
    Files["files<br/>disk or memory"]
    Analysis["analysis<br/>full AnalysisResult by global hash"]

    Runtime --> Context
    Context --> Sources
    Context --> AST
    Context --> Results
    Context --> Configs
    Context --> Meta
    Context --> Plans
    Context --> Files
    Context --> Analysis
```

### 14.1 Cache Services

| Cache Service | Key | Value | Main Consumer |
|---|---|---|---|
| Config cache | Config hash | `ConfigValidationResult` | Config loader |
| File cache | Scan key | Discovered file list and scan statistics | Scanner |
| Plan cache | Global hash | Serialized full execution plan | Planner |
| Result cache | Task ID | `RuleResult` | Planner and engine |
| Analysis cache | Global hash | Full `AnalysisResult` | Planner and engine |
| AST cache | Content hash | Parsed AST entry | Config enrichment and parser-adjacent flows |
| Meta cache | File path/hash metadata | Hash warmup metadata | Planner |
| Source cache | File content | In-memory source entries | Cache subsystem consumers |

### 14.2 Cache Layers and Fast Paths

```mermaid
flowchart TD
    Cold["Cold run"]
    Scan["Discover files"]
    Plan["Build full plan"]
    Execute["Execute tasks"]
    SaveTask["Write task results"]
    SaveAnalysis["Write full analysis result"]
    Warm["Warm run"]
    GlobalHit{"Full analysis cache hit?"}
    Return["Return cached AnalysisResult"]
    Partial{"Task results cached?"}
    ExecutePartial["Execute only missing tasks"]

    Cold --> Scan --> Plan --> Execute --> SaveTask --> SaveAnalysis
    Warm --> GlobalHit
    GlobalHit -- yes --> Return
    GlobalHit -- no --> Partial
    Partial -- all --> Return
    Partial -- some --> ExecutePartial
```

The fastest warm path is a full analysis cache hit by `globalHash`. In that case the planner returns an `ExecutionPlanOutput` with `precomputedAnalysis`, and the engine validates and returns it without parsing or rule execution.

If the full analysis cache is unavailable but per-task result cache entries exist, the planner filters cached tasks out and the engine retrieves cached `RuleResult`s.

### 14.3 Result Cache Write-Behind

The result cache buffers writes in memory during analysis. `setMany` records pending results, and `flush` drains them to disk. When the underlying driver supports bulk writes, all buffered results and metadata can be written in one batch. This reduces I/O overhead on large projects.

## 16. Reporting Architecture

Reporters are selected by CLI option or config output format.

```mermaid
flowchart TD
    Analysis["AnalysisResult"]
    Summary["ResultSummary"]
    ReporterFactory["getReporter(format)"]
    Console["ConsoleReporter"]
    JSON["JsonReporter"]
    HTML["HtmlReporter"]
    SARIF["SarifReporter"]
    Compound["CompoundReporter for non-console formats<br/>progress to stderr, payload to stdout/file"]

    ReporterFactory --> Console
    ReporterFactory --> Compound
    Compound --> JSON
    Compound --> HTML
    Compound --> SARIF
    Analysis --> Console
    Analysis --> Compound
    Summary --> Console
    Summary --> Compound
```

For JSON, SARIF, and HTML/UI output, a `CompoundReporter` emits progress to stderr and sends structured output to the underlying reporter. This prevents progress text from corrupting machine-readable stdout.

`ResultSummary` includes:

- Scanned files.
- Discovered files.
- Files with violations.
- Total tasks.
- Cached tasks.
- Error and warning counts.
- Failure policy.
- Duration.

The CLI decides the final exit code using:

- Any error count greater than zero.
- `failOnSeverity: "warn"` with warnings.
- Warning count greater than `maxWarnings`.

## 17. Data Model Overview

```mermaid
erDiagram
    AnalyzerConfig ||--|| NormalizedAnalyzerConfig : validates_to
    NormalizedAnalyzerConfig ||--o{ ResolvedRule : resolves
    ResolvedRule ||--o{ Task : produces
    Task ||--|| TaskInputs : has
    TaskInputs ||--|| FileInput : includes
    ExecutionPlanOutput ||--o{ Task : executes
    ExecutionPlanOutput ||--o{ Task : skips
    Task ||--o| RuleResult : returns
    RuleResult ||--o{ RuleFailure : contains
    AnalysisResult ||--o{ RuleResult : aggregates
```

### Principal Domain Types

| Type | Package | Description |
|---|---|---|
| `AnalyzerConfig` | common | User-authored configuration shape |
| `NormalizedAnalyzerConfig` | common | Runtime-safe validated config |
| `ResolvedRule` | common | Rule config plus metadata |
| `Task` | planner | Content-addressed unit of work |
| `ExecutionPlanOutput` | planner | Full planner result for engine |
| `RuleContext` | common | Resources passed to rule handlers |
| `RuleResult` | common | Result for one rule execution |
| `RuleFailure` | common | One diagnostic finding |
| `AnalysisResult` | common | Final aggregate output |
| `ProjectContext` | common | Cross-file metadata for project-aware rules |

## 18. Project Context and Cross-File Analysis

Project context is constructed only for type-aware or project-context rules. It contains:

- Forward import graph.
- Reverse import graph.
- Angular module metadata.
- Standalone component set.
- Class-to-file map.
- Component file graph.
- Project file set.
- Barrel files.
- External dependency map.
- Template-to-component map.

```mermaid
flowchart TB
    Program["TypeScript Program"]
    Files["Scanner-discovered files"]
    Builder["buildProjectContext"]
    ImportGraph["Import graph"]
    ReverseGraph["Reverse import graph"]
    ComponentGraph["Component graph"]
    TemplateMap["templateToComponent"]
    Modules["NgModule and standalone metadata"]
    External["External dependency map"]
    ProjectContext["ProjectContext"]

    Program --> Builder
    Files --> Builder
    Builder --> ImportGraph
    Builder --> ReverseGraph
    Builder --> ComponentGraph
    Builder --> TemplateMap
    Builder --> Modules
    Builder --> External
    ImportGraph --> ProjectContext
    ReverseGraph --> ProjectContext
    ComponentGraph --> ProjectContext
    TemplateMap --> ProjectContext
    Modules --> ProjectContext
    External --> ProjectContext
```

This enables rules to reason about architectural relationships without doing their own project-wide scanning.

## 19. Error Handling and Resilience

ngcompass uses explicit result objects and infrastructure error collection where possible.

Key resilience paths:

- Config validation returns a structured health report.
- Scanner returns `Result<ScanResult>`.
- Planner returns `Result<ExecutionPlanOutput>`.
- Engine returns `Result<AnalysisResult>`.
- Cache deserialization failure is treated as recoverable; the corrupted plan entry is deleted and rebuilt.
- Worker failure terminates remaining workers and propagates a recoverable infrastructure error path.
- Rule execution failures are recorded and isolated so one rule does not necessarily stop the entire file batch.
- Reporters receive parse errors separately from rule failures.

```mermaid
flowchart TD
    Failure["Operational failure"]
    Config["Config issue"]
    Scan["Scan error"]
    Cache["Cache corruption"]
    Rule["Rule execution error"]
    Worker["Worker crash or timeout"]
    Report["Reporter error output"]
    Recover["Recover or continue when safe"]
    Exit["Non-zero exit when required"]

    Failure --> Config --> Report --> Exit
    Failure --> Scan --> Report --> Exit
    Failure --> Cache --> Recover
    Failure --> Rule --> Recover
    Failure --> Worker --> Recover
    Recover --> Report
```

## 20. Performance Model

The performance model is based on reducing repeated work at every layer.

| Layer | Optimization |
|---|---|
| Config | Content-hash validation cache |
| Scanner | Git discovery and file-list cache |
| Planner | Global hash, plan cache, component graph, hash warmup |
| Incremental | `taskId` result-cache filtering |
| Engine | Single-pass AST traversal and batched rule execution |
| Workers | Parallel syntax-only execution by file group |
| Type-aware | Small chunked TypeScript Programs and capped type-aware concurrency for memory control |
| Cache I/O | Packed result cache and write-behind flush |
| Context | LRU file content, memoized ASTs, explicit eviction |

### Cold Run

On a cold run, ngcompass performs the full pipeline:

1. Load and validate config.
2. Discover files.
3. Resolve rules.
4. Build component graph.
5. Hash resources.
6. Generate tasks.
7. Parse and analyze files.
8. Persist per-task and full-analysis caches.

### Warm Run

On a warm run, ngcompass can short-circuit at multiple levels:

1. Config validation cache.
2. Scanner file-list cache.
3. Full analysis cache by global hash.
4. Plan cache by global hash.
5. Result cache by task ID.

The warm path can therefore avoid AST parsing and rule execution entirely when no relevant inputs changed.

## 21. Extensibility Model

### 20.1 Adding a Rule

A new rule typically uses a helper from `@ngcompass/engine`, such as:

- `createComponentRule`
- `createAnyAngularClassRule`
- `createDecoratedPropertyRule`
- `createTemplateExpressionRule`
- `createTemplateAttributeRule`
- `createTemplateBlockRule`
- `createTemplateRule`
- `createCallExpressionRule`
- `createNewExpressionRule`

The rule supplies a stream handler and metadata. Metadata declares dependency type and resource requirements. The planner uses that metadata to decide which files the rule applies to and what resources must be available.

```mermaid
flowchart TD
    Rule["RuleHandler"]
    Meta["RuleMetadata<br/>dependencyType + requires"]
    Register["RuleRegistry.register"]
    Resolve["resolveRules"]
    Plan["Planner creates matching tasks"]
    Execute["Engine dispatches stream nodes"]
    Result["RuleResult"]

    Rule --> Register
    Meta --> Register
    Register --> Resolve --> Plan --> Execute --> Result
```

### 20.2 Adding a Reporter

A reporter implements the reporter contracts in `@ngcompass/reporters`:

- `report(results)`.
- `summary(stats)`.
- `parseErrors(errors)`.
- `error(error)`.
- Progress methods such as `step`, `info`, and `debug`.

The reporter is then added to `getReporter(format)`.

### 20.3 Adding a Cache Strategy

The cache system is driver-oriented. A new storage backend should implement the async driver contract and then be wired into `createCacheContext`. Services such as `ResultCache`, `PlanCache`, and `FileCache` should remain stable and consume the driver abstraction.

## 22. Deployment and Runtime Layout

The CLI is built from `packages/cli/src/bin/ngcompass.ts` into `packages/cli/dist/cli.js` and `cli.cjs`. The package build uses `tsup`. At runtime, the CLI loads other workspace packages from their built `dist` outputs according to package exports and Node module resolution.

Runtime project cache is stored under the analyzed project's configured cache location, usually:

```text
node_modules/.cache/ngcompass
```

Typical subdirectories include:

```text
analysis/
ast/
config/
files/
meta/
plans/
results/
```

## 23. Complete Analysis Pipeline Diagram

```mermaid
flowchart TD
    A["User runs ngcompass analyze"]
    B["CLI initializes reporter and cache"]
    C["Config discovery via lilconfig/jiti"]
    D["Config validation and normalization"]
    E["Runtime cache from normalized config"]
    F["File discovery via Git or glob"]
    G["Rule resolution from presets and config"]
    H["Planner global hash"]
    I{"Full analysis cached?"}
    J["Return cached AnalysisResult"]
    K{"Plan cached?"}
    L["Build component graph and tasks"]
    M["Filter tasks by result cache"]
    N{"Pending tasks?"}
    O["Retrieve cached RuleResult entries"]
    P["Split pending tasks by execution capability"]
    Q["Syntax-only workers or local batches"]
    R["Type-aware chunked main-thread batches"]
    S["RuleContextFactory builds RuleContext"]
    T["Single-pass engine dispatches rule handlers"]
    U["Merge executed and cached results"]
    V["Compute stats and failure status"]
    W["Persist result and analysis caches"]
    X["Reporter emits console/json/html/sarif"]
    Y["CLI exits according to fail policy"]

    A --> B --> C --> D --> E --> F --> G --> H --> I
    I -- yes --> J --> X --> Y
    I -- no --> K
    K -- yes --> M
    K -- no --> L --> M
    M --> N
    N -- no --> O --> U
    N -- yes --> P
    P --> Q --> S
    P --> R --> S
    S --> T --> U
    O --> U
    U --> V --> W --> X --> Y
```

## 24. Summary

ngcompass is structured as a layered analysis platform. The CLI coordinates execution, but the architecture keeps discovery, configuration, planning, execution, caching, rules, AST parsing, and reporting independently testable. The most important internal abstraction is the task: a content-addressed rule execution unit that connects file/resource hashing, incremental caching, planner indexes, worker execution, and final reporting.

The result is a tool that can behave like a full Angular static analyzer on cold runs while returning warm cached results quickly when the project state has not changed.
