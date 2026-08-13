# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (dev, with source maps)
pnpm build

# Build (production, minified — required before publish)
pnpm build:prod

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for a single package
pnpm --filter @ngcompass/engine vitest run

# Run a single test file
pnpm --filter @ngcompass/rules vitest run src/rules/reactivity/rxjs-no-subscribe-in-component.rule.test.ts

# Typecheck all packages
pnpm typecheck

# Validate packages are ship-ready (dist exists, no leaked sources, all fields present)
pnpm validate:packages

# Run smoke test + validate before releasing
pnpm prerelease:check

# Publish beta (build → validate → changeset publish --tag beta → promote latest)
pnpm release:beta

# Publish stable
pnpm release:stable

# Clear turbo/node_modules cache
pnpm clean
```

## Monorepo Layout

Turborepo monorepo using pnpm workspaces. All packages are under `packages/`. Build order is enforced by Turbo through `^build` dependencies. The root `package.json` is `private: true`.

| Package              | Name on npm            | Role                                                                              |
| -------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `packages/cli`       | `ngcompass`            | Binary entry point, command registration, analysis orchestration                  |
| `packages/config`    | `@ngcompass/config`    | Config discovery (lilconfig/jiti), validation, normalization, plugin loading      |
| `packages/scanner`   | `@ngcompass/scanner`   | File discovery via git or glob, file-list cache                                   |
| `packages/rules`     | `@ngcompass/rules`     | All built-in rules, presets, `RuleRegistry`, `resolveRules`                       |
| `packages/planner`   | `@ngcompass/planner`   | Task graph construction, content-addressed task IDs, incremental filtering        |
| `packages/engine`    | `@ngcompass/engine`    | Single-pass AST execution, worker pool, type-aware chunking, `RuleContextFactory` |
| `packages/ast`       | `@ngcompass/ast`       | Oxc TypeScript parser, Angular HTML parser, CSS parser, node stream types         |
| `packages/cache`     | `@ngcompass/cache`     | Multi-layer cache (config, file, plan, result, analysis, AST, meta, source)       |
| `packages/reporters` | `@ngcompass/reporters` | Console, JSON, SARIF, HTML reporters                                              |
| `packages/common`    | `@ngcompass/common`    | Shared domain types (`RuleContext`, `RuleResult`, `AnalysisResult`, `Task`, etc.) |

`packages/site` is the documentation website and is not published to npm.

## Analysis Pipeline

The full lifecycle is documented in `docs/architecture.md`. The short version:

```
CLI → resolveConfig → scan files → resolveRules → buildExecutionPlan → runAnalysis → reporters
```

The planner is the performance center. It builds content-addressed `taskId`s from file hashes + rule options. On warm runs, the planner can short-circuit at three levels: full analysis cache hit (by `globalHash`), plan cache hit, or per-task result cache hit. Only tasks with no cached result reach the engine.

The engine splits tasks into **syntax-only** (run in worker pool) and **type-aware** (main thread, chunked TypeScript Programs). Rules declare which they need via `RuleMetadata.dependencyType`.

## Adding a Rule

1. Create `packages/rules/src/rules/<domain>/<rule-name>.rule.ts`.
2. Use a stream-typed factory from `@ngcompass/engine`:
   - `createComponentRule` — `@Component` classes
   - `createAnyAngularClassRule` — any Angular-decorated class
   - `createDecoratedPropertyRule` — class properties with decorators
   - `createTemplateExpressionRule` / `createTemplateAttributeRule` / `createTemplateBlockRule` / `createTemplateRule` — template AST
   - `createCallExpressionRule` / `createNewExpressionRule` — call/new expressions
3. Declare `RuleMetadata` with `dependencyType` (`syntax` | `type-aware` | `project-context`) and `requires` (what resources the rule needs).
4. Register the rule in `packages/rules/src/registry/register-all.ts`.
5. Add the rule to the appropriate preset in `packages/rules/src/presets/`.

Rules are passive observers — they receive pre-filtered stream nodes. They must not perform their own AST traversal, allocate large data structures per node, or store mutable state between invocations.

## Rule Handler Contract

```ts
interface RuleHandler<TNode> {
  readonly name: string;
  readonly streamType: StreamType;
  handle(node: TNode, context: RuleContext): RuleFailure[];
}
```

`RuleContext` provides: `fileContent`, `filePath`, `program` (Oxc AST), `locator` (line/column), `typeChecker` (optional), `template` (optional Angular AST), `projectContext` (optional cross-file metadata). Never store `RuleContext` references beyond the synchronous `handle()` call.

## Type System

- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
- `module: "Node16"` / `moduleResolution: "Node16"` — import extensions matter for ESM interop.
- Builds target ES2022.
- Compiled with SWC (`unplugin-swc`) via tsup for packages, and via vitest for tests.
- Each package has its own `tsconfig.json` extending the root.

## Model Layout

Every package keeps its type declarations in `src/models/`, separate from the code that uses them. `packages/common` is the reference implementation.

```
packages/<name>/src/
  models/
    index.ts        <- barrel: only `export *` / `export type *` lines
    <domain>.ts     <- one file per domain concept
  <logic files>
```

| Rule                                                                                                                                            | Rationale                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **`interface`s, `type` aliases, and type-only generic helpers live in `src/models/`.**                                                           | A logic file that also declares types hides its dependencies and grows without bound.        |
| **Group model files by domain concept, not by kind.** `models/task.ts`, never `models/interfaces.ts`.                                            | Kind-based files are a dumping ground; domain files tell you where a type belongs.           |
| **`models/index.ts` re-exports every model file and declares nothing itself.**                                                                   | One import path per package; the barrel stays mechanical and merge-friendly.                 |
| **Runtime values stay out of `models/`.** The one exception is a const-object enum and its derived type (`RuleCategory`), which move as a unit.  | Splitting the pair would leave the type unable to reference its own values.                  |
| **A model file may import from another model file, never from a logic file.** The single exception is `import type` of a class whose instances appear in a model — `Locator` in `RuleContext`, `ParseError` in `AnalysisResult`. | `models/` is a leaf. A model reaching into logic means the type is in the wrong place.       |
| **Module-private types stay in their logic file.**                                                                                              | The barrel re-exports everything in `models/`; moving a private type there would widen the public API. |
| **`src/index.ts` decides the public surface.** Star-export the barrel only when every model is already public; otherwise re-export the public model files by name (`@ngcompass/ast` hides `HostDirectiveMetadata` this way). | The barrel is the package's internal import path, not automatically its public API. |
| **Relative imports carry the `.js` extension**, and type-only imports use `import type` / `export type`.                                         | `module: "Node16"` requires it, and the extension-less form fails at runtime, not at build.  |
| **A type inferred from a zod schema moves only if that schema is already exported.** `ValidatedConfig` moved; `AnalyzerConfig` stayed in `schemas/schema.ts` because it infers from a module-private schema. | Widening a schema's visibility to satisfy a type move inverts the dependency.                |

Moving a type is behaviour-preserving only if the public type surface is unchanged. The verification gate is the built declaration file:

```bash
pnpm build && cp packages/<name>/dist/index.d.ts /tmp/<name>-before.d.ts
pnpm build && diff /tmp/<name>-before.d.ts packages/<name>/dist/index.d.ts
```

tsup emits declarations in module-graph order, so restructuring imports reorders the file even when nothing changed. A raw diff of ordering alone is acceptable **only** when the sorted set of top-level declarations and the trailing export list are byte-identical. Compare those two directly rather than eyeballing the raw diff.

When even that compare is non-empty, the reordering has reached inside a declaration — a changed module graph can reorder union members (`'memory' | 'local'`) or object properties, which is textual noise but not a type change. Do not accept it on inspection. Escalate to a structural check: copy the baseline alongside the new `dist/index.d.ts`, generate a file that asserts every exported name is mutually assignable between the two, and compile it under `tsc --strict`. Equivalence is proven when the name sets match exactly and the assignability check compiles clean; anything else is a real surface change.

## Testing

Tests use Vitest with globals enabled (`describe`, `it`, `expect` without imports). Test files match `**/*.{test,spec}.ts`. Coverage thresholds are intentionally low during beta — do not lower them further.

To test a rule, construct a minimal `RuleContext` stub and call the handler directly. The engine and planner have integration tests in their respective `src/` directories. Do not mock the cache or file system in integration tests — use real temp directories.

## Cache Invalidation

The cache is content-addressed at multiple levels. If you change:

- A rule's logic or options → task IDs for that rule change automatically (options are hashed into the task ID).
- `packages/common` types (e.g. `RuleResult` shape) → bump `CACHE_SCHEMA_VERSION` in `@ngcompass/cache` to invalidate persisted results.
- The planner's task-building logic → bump `PLAN_CACHE_VERSION`.

Never delete or rename a cached field without bumping the relevant version constant.

## Release Flow

All 10 publishable packages must be released together. Versions are kept in sync manually across all `package.json` files. The `changeset publish` step reads the current version from each `package.json` and publishes.

```bash
# Standard beta publish (builds, validates, publishes to beta tag, promotes latest)
pnpm release:beta
```

Verify after publish:

```bash
npm view ngcompass dist-tags
# Expected: { beta: 'x.y.z-beta', latest: 'x.y.z-beta' }
```

## Conventions

- Domain errors use typed result objects (`Result<T>`) not thrown exceptions, except in truly unrecoverable startup paths.
- Progress and debug output goes to `stderr`. Machine-readable output (JSON, SARIF) goes to `stdout`.
- All inter-package imports use workspace package names (`@ngcompass/common`), never relative paths across package boundaries.
- The `site` package is excluded from the build pipeline and publish step.
- `packages/cli/src/commands/analyze.ts` is the canonical reference for the full analysis lifecycle.

---

# Coding Standards

These standards exist because this codebase is performance-sensitive and parses customer code at scale. Violating them creates real, measurable regressions — not stylistic noise.

## Type Discipline

| Rule                                                                                                                         | Rationale                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Never use `any`.** Use `unknown` if the type is truly unknown, then narrow with type guards.                               | `any` silently disables the entire type system at that point and propagates.                |
| **Never use `as` casts** unless narrowing from `unknown` after a runtime check, or asserting `as const`. Prefer type guards. | `as` is a lie to the compiler. Type guards are checked.                                     |
| **Prefer `interface` for object shapes, `type` for unions/intersections/utility types.**                                     | Interfaces are extensible and produce better errors; `type` aliases handle everything else. |
| **Use `readonly` on every array and object field that is not mutated after construction.**                                   | Immutability is enforceable in TypeScript and prevents whole classes of bugs.               |
| **No optional parameters with side-effect defaults.** Pass explicit values from callers.                                     | Hidden defaults make call sites unreadable and behavior surprising.                         |
| **No `Record<string, any>` or `object` as a parameter type.** Define a real interface.                                       | These types accept anything and assert nothing.                                             |
| **Function return types must be explicit** for any exported function. Inferred returns are fine for local helpers.           | Public API stability requires explicit contracts.                                           |

## Error Handling

```ts
// ❌ Do not throw for domain errors
function loadConfig(path: string): NormalizedAnalyzerConfig {
  if (!exists(path)) throw new Error('config not found');
  // ...
}

// ✅ Return a Result<T>
function loadConfig(
  path: string
): Result<NormalizedAnalyzerConfig, ConfigError> {
  if (!exists(path)) return err({ kind: 'ConfigNotFound', path });
  // ...
  return ok(normalized);
}
```

- **Throw only for programmer errors** (unreachable states, broken invariants). Domain errors flow as values.
- **Never swallow errors silently.** No empty `catch {}`. Either handle, log, or rethrow.
- **No `try/catch` around code that cannot throw.** Wrapping pure logic in try/catch adds noise and slows V8 optimization.
- **Cache deserialization is the one place** where catching corruption and rebuilding is correct. Document it inline.

## Performance Rules (Hot Path)

These apply to the engine, planner, single-pass traversal, and rule handlers. Code that runs once at startup can be more relaxed.

| Rule                                                                                                                                                               | Why                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **No allocations inside AST traversal callbacks.** Reuse arrays, avoid `.map`/`.filter`/`.reduce` chains that build intermediate arrays in the visitor dispatch.   | Single-pass engine visits millions of nodes; per-node allocations dominate the profile.                                           |
| **Avoid `Object.keys`/`Object.values`/`Object.entries`** inside hot loops. Iterate known properties directly.                                                      | These create intermediate arrays and copy keys.                                                                                   |
| **Cache regex objects at module scope.** Never construct `new RegExp` per call in a rule handler.                                                                  | Regex compilation is expensive.                                                                                                   |
| **Use `Map` for keyed lookups by string,** not plain objects.                                                                                                      | `Map` has predictable O(1) and supports clear without recreation.                                                                 |
| **Bounded caches must have eviction.** When adding any cache, use `CACHE_LIMIT` constants and clear on overflow (see `rxjs-no-subscribe-in-component.rule.ts:19`). | Unbounded caches in long-running CI processes leak memory.                                                                        |
| **Never call `JSON.parse`/`JSON.stringify` in a rule handler.** Inputs are already typed; serialization belongs at cache boundaries only.                          | These are surprisingly expensive at scale.                                                                                        |
| **Use `for` loops over `forEach`/`for...of`** when iterating arrays in hot paths.                                                                                  | V8 optimizes classical `for` more aggressively. Reserve `forEach`/`for...of` for code where readability matters and perf doesn't. |

## Clean Code (Project-Specific)

- **Function size**: aim for ≤30 lines of executable code (excluding blank lines). If longer, the function is doing multiple things — extract.
- **Cyclomatic complexity ≤10** per function. Replace nested conditionals with early returns or lookup tables.
- **Pure functions by default.** Side effects (cache writes, file I/O, logging) should live at orchestration layers (commands, engine runner), not inside rules, planners, or pure transformations.
- **Naming**:
  - Functions: verb + noun (`resolveRules`, `buildExecutionPlan`, `getProgram`). No `do`, `handle`, `process`, `manage` as standalone verbs — they say nothing.
  - Booleans: `is*`, `has*`, `should*`, `can*`. Never `flag`, `status`, `state` for a boolean.
  - Async functions returning `Promise<T>`: don't suffix with `Async` — TypeScript already encodes this.
  - Constants: `SCREAMING_SNAKE_CASE` only for module-level immutable primitives. Object/array constants stay `camelCase`.
- **No magic numbers.** Extract to a named constant at module scope. See `LIMITS` constants in `packages/config/src/health/checks/`.
- **No dead code.** If you remove a feature, remove it everywhere — don't leave commented-out blocks or unreachable branches "in case we need it later." Git has the history.

## SOLID — Applied to This Codebase

These apply where they help. Do not introduce abstractions just to satisfy a letter.

- **S (Single Responsibility)**: each package has one responsibility (see Monorepo Layout). When tempted to add cache logic to the engine or rule resolution to the planner, stop — that's the wrong package.
- **O (Open/Closed)**: new rules extend the registry without modifying the engine. New reporters extend `getReporter(format)` without modifying analysis. If a feature requires changing the engine to support a new rule type, the engine abstraction is wrong.
- **L (Liskov Substitution)**: all `Reporter` implementations must work everywhere a `Reporter` is expected. Don't add reporter-specific bailout logic in callers.
- **I (Interface Segregation)**: `RuleContext` is intentionally fat because rules pull what they need. But never expand a narrow interface (like `Result<T>`) to satisfy one new consumer — create a new type.
- **D (Dependency Inversion)**: the engine depends on `RuleRegistry` interface, not on concrete rules. The cache depends on driver contracts, not specific backends. Maintain this — never `import` a concrete rule into the engine.

## Clean Architecture (Layered Boundaries)

The package layout is the architecture. Layers may only depend inward, never outward:

```
CLI (orchestration)
  ↓
config / scanner / planner / engine / reporters
  ↓
rules / cache / ast
  ↓
common (pure types, no logic)
```

| Forbidden                                                                  | Reason                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `@ngcompass/common` importing from any other package                       | Common is the foundation — circular imports kill the build    |
| `@ngcompass/engine` importing concrete rules                               | Rules are plugins; engine must not know what they are         |
| `@ngcompass/rules` importing from `@ngcompass/planner` or `@ngcompass/cli` | Rules are domain; planner is workflow                         |
| Reporters reading the filesystem directly                                  | Reporters receive `AnalysisResult` — they don't go fetch data |
| Anything outside CLI calling `process.exit`                                | Only the CLI decides exit codes                               |

## No Comments In Code

- **Code comments are forbidden** in source, test, script, and configuration files. Do not add JSDoc, `@fileoverview` blocks, block comments, line comments, section banners, TODO comments, commented-out code, or disable comments.
- **Remove existing comments from any code file you modify.** When touching a source, test, script, or configuration file, erase comments from that entire file in the same change.
- **Use code structure instead of comments.** If something needs explanation, improve names, extraction, types, or control flow until the code explains itself.
- **Markdown prose is exempt.** Documentation files may use normal prose, but embedded code examples should still avoid comments.

## Node.js Specifics

- **ESM only.** No CommonJS in source files. The build emits both via tsup. Imports include the `.js` extension as required by `module: "Node16"`.
- **Never use `require()`** in source. Use `import` or `await import()` for dynamic loading.
- **Don't block the event loop in hot paths.** Use worker threads (`@ngcompass/engine` worker pool) for CPU-bound parallel work. Use `setImmediate` to yield in long loops only when the loop runs on the main thread during user interaction.
- **No `process.exit()` outside the CLI command layer.** Library code returns errors; the CLI translates them to exit codes.
- **No synchronous `fs` calls in hot paths.** Exception: startup, where sync I/O is acceptable and clearer. Hot paths use `fs/promises`.
- **Remove `EventEmitter` listeners explicitly.** Workers, watchers, and signal handlers all leak if listeners stack up across runs.
- **`AbortController` for cancellation.** Long-running operations (workers, type-aware chunks) must accept an `AbortSignal` and check `signal.aborted` at chunk boundaries.
- **Environment variables**: read once at startup into a typed config object. Never `process.env.X` in library code.

## Monorepo Discipline

- **Import only from package public exports.** Never reach into another package's `src/` or `dist/` directly. If you need an internal symbol from another package, export it properly.
- **No circular package dependencies.** Run `pnpm turbo build --dry` if you suspect one — it will fail loudly.
- **Workspace deps use `workspace:*`** in package.json. Never pin a sibling package to a specific version — that breaks monorepo versioning.
- **Add a sibling package to `dependencies`, `peerDependencies`, or `devDependencies`** the moment you import from it. The `validate:packages` script will catch missing entries.
- **Version bumps are atomic across all 10 packages.** Use `changeset version` or manual `pnpm` find-and-replace — never leave them out of sync.
- **One concern per package.** If a new feature spans 3 packages, ask whether one of them is the wrong place.

## Testing

- **Test the public API, not the implementation.** A test that imports from `src/internal/` is testing the wrong layer.
- **No mocks of types you own.** If you need to fake `RuleContext`, build a real one with minimal inputs — your tests will catch shape regressions automatically.
- **Each test isolates its temp dirs.** Use `os.tmpdir()` + a unique subdirectory. Never share state across tests.
- **Integration tests touch real I/O.** The cache, scanner, and engine have integration tests with real files. Do not stub these — that defeats their purpose.
- **One assertion concept per `it()` block.** Multiple `expect()` calls are fine if they verify the same concept; don't pack unrelated assertions together.
- **Test names describe behavior, not method names.** `it('skips ignored files when gitignore matches')` not `it('scan() works')`.

## What NOT to Do (Common LLM Mistakes)

- **Don't add abstractions before they're needed.** Three similar lines is better than a premature helper. Wait for the fourth occurrence.
- **Don't add defensive checks for impossible states.** If a value is typed `string`, don't check `if (typeof x !== 'string')` — TypeScript already guarantees it.
- **Don't wrap working code in try/catch "just in case."** Each try/catch must catch a specific, documented failure mode.
- **Don't add disable comments.** Fix the issue or adjust configuration instead.
- **Don't refactor unrelated code in a feature PR.** Refactors get their own PRs so reviewers can evaluate them independently.
- **Don't add new dependencies casually.** Every new npm package is a supply-chain risk. Justify it. Prefer Node built-ins or existing dependencies.
- **Don't generate code that compiles but is unused.** Dead exports, unused parameters, no-op functions — all forbidden by the strict TypeScript config and will fail typecheck.
- **Don't add explanatory code comments.** Improve the code until the explanation is unnecessary.
- **Don't write functions longer than ~50 lines** without extracting helpers. Long functions hide bugs.

## When in Doubt

1. Read the equivalent existing code in the codebase. Match its style and shape.
2. If two existing patterns conflict, prefer the newer one (last writer wins).
3. If still unclear, ask before writing. A 10-second question beats a 1-hour wrong refactor.
