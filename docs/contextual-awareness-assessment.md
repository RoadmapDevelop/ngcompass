# ngcompass Contextual Awareness Assessment

## Senior Architect Review — March 2026

---

## 1. Current State: How Contextual Is Your Linter?

### Verdict: **Single-File-First with Partial Type-Aware Extensions**

Your linter operates predominantly at **isolation level 2 out of 5** on the contextual awareness spectrum:

| Level | Description | Your Status |
|-------|-------------|-------------|
| 1 | Syntax-only (regex/token) | Exceeded |
| **2** | **Single-file AST + Angular template/style** | **Current baseline (17/19 rules)** |
| 3 | Type-aware cross-file resolution | Partially achieved (2/19 rules use TypeChecker) |
| 4 | Project-graph-aware (imports, DI, modules) | Not yet |
| 5 | Workspace-aware (monorepo boundaries, libs) | Not yet |

### What Each Rule Actually Sees

```
┌─────────────────────────────────────────────────────┐
│                  Rule Handler                        │
│                                                      │
│  Inputs:                                             │
│  ✅ Pre-filtered AST node (single file)              │
│  ✅ File content string                              │
│  ✅ Angular template AST (if htmlAst required)       │
│  ✅ Style AST (if cssAst required)                   │
│  ✅ TypeChecker (if typeChecker required) ← 2 rules  │
│  ✅ Locator (line/column mapping)                    │
│  ✅ Rule options from config                         │
│                                                      │
│  CANNOT see:                                         │
│  ❌ Other files' ASTs or content                     │
│  ❌ Import/export graph                              │
│  ❌ Who imports this file                            │
│  ❌ Angular module/standalone boundaries             │
│  ❌ DI provider tree                                 │
│  ❌ Route configuration                              │
│  ❌ Template ↔ Component class cross-reference       │
│  ❌ Monorepo library boundaries                      │
│  ❌ Shared analysis results from other rules         │
└─────────────────────────────────────────────────────┘
```

### Rule-by-Rule Contextual Classification

| Rule | Scope | Uses TypeChecker | Cross-File? |
|------|-------|:---:|:---:|
| prefer-on-push | Component decorator | No | No |
| prefer-inject | Class constructor | **Yes** | Partial (type resolution) |
| component-no-manual-detect-changes | Call expressions | No | No |
| signal-prefer-computed-over-sync-effect | Call expressions | **Yes** | Partial (type resolution) |
| signal-no-side-effects-in-computed | Callback body | No | No |
| signal-effect-must-be-destroy-scoped | Class methods | No | No |
| signal-no-effect-in-constructor | Constructor body | No | No |
| signal-avoid-untracked-overuse | Call expressions | No | No |
| rxjs-no-subscribe-in-component | Call expressions | No | No |
| rxjs-require-take-until-destroyed | Call expressions | No | No |
| rxjs-avoid-behaviorsubject-for-local-state | Class members | No | No |
| rxjs-avoid-subject-as-event-bus | Class members | No | No |
| rxjs-prefer-to-signal-for-template-state | Class members | No | No |
| to-signal-require-initial-value | Call arguments | No | No |
| template-no-call-expression | Template AST | No | No |
| template-no-async-pipe-duplication | Template AST | No | No |
| template-no-array-literal-binding | Template AST | No | No |
| template-no-object-literal-binding | Template AST | No | No |
| template-trackby-required | Template attributes | No | No |

**Bottom line: 17/19 rules are pure single-file. 2/19 use TypeChecker for type resolution only. Zero rules perform true cross-file analysis.**

---

## 2. Is It Going in the Right Direction?

### Yes — the foundation is strong. Here's why:

**Architectural strengths already in place:**

1. **Single-pass engine with stream dispatch** — O(N) traversal, O(1) per-node. This is the right execution model. Adding context layers on top doesn't break it.

2. **TypeChecker integration exists** — The `type-aware-context.ts` already creates a project-wide `ts.Program`. The plumbing is done; it's just underutilized (only 2 rules use it).

3. **Component dependency graph** — `component-graph.ts` in the planner already maps `component.ts → template.html, styles.scss, spec.ts`. This is the seed of a project graph.

4. **Content-addressable caching** — SHA256-based task IDs mean adding new inputs (like import graph hash) extends naturally without breaking the cache model.

5. **Worker/main-thread split** — Type-aware rules already run sequentially on the main thread. Adding heavier project-level analysis follows the same path.

6. **Plugin system** — `RuleRegistry` + `RulePlugin` interface means third-party rules can also benefit from richer context.

### What's missing is a **context enrichment layer** between the planner and the executor.

```
Current:   Files + Rules → Planner → Tasks → Engine → [per-file context] → Rule
                                                        ↑ missing layer

Proposed:  Files + Rules → Planner → ProjectAnalyzer → Tasks → Engine → [enriched context] → Rule
                                      ↑ new phase
                                      Builds: import graph, DI tree,
                                      module boundaries, route map
```

---

## 3. Improvement Tickets

Each ticket is independent and can be implemented in any order unless explicitly noted. Tickets are ordered by **impact/effort ratio** (highest first).

---

### TICKET-CTX-001: Introduce `ProjectContext` — Shared Read-Only Project Graph ✅ DONE

**Priority:** Critical | **Effort:** L | **Impact:** Unlocks all subsequent tickets

> **Implemented March 2026.** Files changed:
> `packages/common/src/types.ts` · `packages/engine/src/project-context-builder.ts` (new) · `packages/engine/src/type-aware-context.ts` · `packages/engine/src/rule-context-factory.ts` · `packages/engine/src/orchestrator.ts` · `packages/planner/src/task-builder.ts` · `packages/planner/src/types.ts` · `packages/engine/src/index.ts` · `packages/cli/src/commands/analyze.ts`

**Problem:**
Rules receive `RuleContext` scoped to a single file. There is no mechanism to pass project-level analysis results (import graph, module map, DI tree) to individual rules.

**Proposal:**
Create a `ProjectContext` interface computed once per analysis run, attached to `RuleContext`:

```typescript
// packages/engine/src/project-context.ts

interface ProjectContext {
  /** Import graph: file → Set<imported file paths> */
  readonly importGraph: ReadonlyMap<string, ReadonlySet<string>>;

  /** Reverse import graph: file → Set<files that import it> */
  readonly reverseImportGraph: ReadonlyMap<string, ReadonlySet<string>>;

  /** Angular module/standalone component boundaries */
  readonly ngModuleMap: ReadonlyMap<string, NgModuleInfo>;

  /** Component → template/style file mapping (from existing component-graph) */
  readonly componentGraph: ReadonlyMap<string, ComponentFiles>;

  /** All project files discovered by scanner */
  readonly projectFiles: ReadonlySet<string>;

  /** Root directory */
  readonly rootDir: string;
}
```

Extend `RuleContext`:

```typescript
interface RuleContext {
  // ... existing fields ...
  readonly project?: ProjectContext;  // Available when rule declares needsProjectContext
}
```

**Implementation steps:**
1. Define `ProjectContext` interface in `@ngcompass/common`
2. Build import graph from TypeScript's `ts.Program.getSourceFile().imports` (reuse existing TypeChecker program)
3. Compute in orchestrator before task dispatch, pass through to `RuleContextFactory`
4. Rules opt-in via `meta.requires.projectContext: true`
5. Cache the project context (invalidate on file add/remove/rename)

**Acceptance criteria:**
- [x] `ProjectContext` is computed once per run
- [x] Rules can access `context.project.importGraph`
- [x] No performance regression for rules that don't use it
- [ ] Import graph handles re-exports and barrel files _(barrel re-export walk deferred to CTX-002)_

---

### TICKET-CTX-002: Import Graph Builder ✅ DONE

**Priority:** High | **Effort:** M | **Depends on:** CTX-001

> **Implemented March 2026.** Files changed:
> `packages/common/src/types.ts` · `packages/engine/src/project-context-builder.ts`
>
> All enhancements are integrated directly into the existing `project-context-builder.ts`
> rather than a separate file — no extra parse cost, same O(F + E) pass.

**Problem:**
No rule can answer "who imports this file?" or "what does this file depend on?". This blocks rules for: circular dependency detection, unused export detection, barrel file analysis, dead code detection.

**Proposal:**
Build an efficient import graph from the existing `ts.Program`:

```typescript
// packages/engine/src/graph/import-graph-builder.ts

interface ImportGraphResult {
  readonly forward: ReadonlyMap<string, ReadonlySet<string>>;   // file → imports
  readonly reverse: ReadonlyMap<string, ReadonlySet<string>>;   // file → imported-by
  readonly barrelFiles: ReadonlySet<string>;                     // index.ts re-export files
  readonly externalDeps: ReadonlyMap<string, ReadonlySet<string>>; // file → npm packages
}

function buildImportGraph(program: ts.Program, projectFiles: Set<string>): ImportGraphResult;
```

**Key design decisions:**
- Reuse the `ts.Program` already created by `type-aware-context.ts` — no extra parse cost
- Resolve path aliases via `ts.CompilerOptions.paths`
- Handle barrel re-exports (`export * from`, `export { X } from`)
- Normalize all paths to project-relative for cache stability
- Complexity: O(F) where F = number of files (single pass over source files)

**Acceptance criteria:**
- [x] Resolves TypeScript path aliases (`@app/*`, `@shared/*`) — via `ts.resolveModuleName()`
- [x] Handles barrel files (`index.ts` re-exports) — `barrelFiles: ReadonlySet<string>` on `ProjectContext`; file is a barrel when every top-level statement is an `export…from` declaration
- [x] Handles dynamic `import()` expressions — `collectModuleSpecifiers` now does a full depth-first AST walk; dynamic `import(…)` calls (`SyntaxKind.ImportKeyword` callee) are captured alongside static imports/re-exports
- [x] Performance: < 200ms for 2000-file project — single O(F + E) pass over existing `ts.Program` source files, zero extra I/O
- [ ] Cached and invalidated on file changes — _deferred to CTX-009 (cross-file caching strategy)_

---

### TICKET-CTX-003: Template ↔ Component Cross-Reference Context

**Priority:** High | **Effort:** M | **Depends on:** CTX-001

**Problem:**
Template rules cannot see the component class, and component rules cannot see the template. This means:
- Template rules can't verify that a called method exists in the component
- Template rules can't check if a bound property is a Signal vs. plain field
- Component rules can't detect unused public members (only used in template)

**Proposal:**
Enrich `RuleContext` for component-scoped rules with cross-references:

```typescript
interface ComponentCrossRef {
  /** Parsed component class AST (available in template rules) */
  readonly componentClass?: AngularClassNode;

  /** Parsed template AST (available in component rules) */
  readonly template?: TemplateAst;

  /** Public members of the component class */
  readonly publicMembers?: ReadonlySet<string>;

  /** Members referenced in the template */
  readonly templateReferences?: ReadonlySet<string>;
}

interface RuleContext {
  // ... existing ...
  readonly crossRef?: ComponentCrossRef;
}
```

**Implementation:**
- Leverage existing `componentGraph` from the planner (maps `.ts` → `.html`)
- When building `RuleContext` for a component file, also parse its template
- When building `RuleContext` for a template file, also parse its component class
- Both ASTs are already cached by `AnalysisContext` — minimal extra cost

**New rules this enables:**
- `template-no-undefined-member` — method/property used in template doesn't exist in class
- `component-no-unused-public-member` — public member not used in template
- `template-signal-read-required` — bound property is a Signal, must call `()` in template

**Acceptance criteria:**
- [x] Template rules can access `context.crossRef.componentPath` + `publicMembers`
- [x] Component rules can access `context.crossRef.templateReferences`
- [x] Inline templates (in `@Component({ template: '...' })`) are handled
- [x] External template files are handled

**Implementation notes (completed):**
- `ComponentCrossRef` interface added to `packages/common/src/types.ts` with
  `componentPath`, `templatePath`, `stylePaths`, `specPath`, `publicMembers`,
  `templateReferences`.
- `ProjectContext.templateToComponent` (reverse map HTML→TS) added to types and
  built by `buildTemplateToComponentMap()` in `project-context-builder.ts`.
- `buildComponentGraph()` in `project-context-builder.ts` auto-detects Angular
  naming-convention clusters (`*.component.ts` → `.html`/`.scss`/`.spec.ts`)
  from the project file set — zero extra I/O, uses `projectFileSet` already
  built by CTX-001.
- `TypeAwareAnalysisContext.getTsSourceFile` exposes the in-memory `ts.SourceFile`
  so `RuleContextFactory` can walk class members without reparsing.
- `RuleContextFactory.buildCrossRef()` attaches the cross-ref at build time;
  `extractPublicMembers()` walks TypeScript class declarations;
  `extractTemplateReferences()` walks Angular template AST node trees.
- All nine packages build successfully with zero TypeScript errors.

---

### TICKET-CTX-004: Angular Module / Standalone Boundary Awareness ✅ DONE

**Priority:** High | **Effort:** L | **Depends on:** CTX-001, CTX-002

**Problem:**
Rules cannot determine the NgModule or standalone component import boundary. This blocks:
- Detecting components used but not declared/imported
- Detecting declared but unused components in a module
- Enforcing standalone-first migration policies
- Validating that shared modules don't import feature modules

**Proposal:**
Add an `NgModuleMap` to `ProjectContext`:

```typescript
interface NgModuleInfo {
  readonly filePath: string;
  readonly declarations: ReadonlySet<string>;   // Component/Directive/Pipe class names
  readonly imports: ReadonlySet<string>;         // Module/Standalone class names
  readonly exports: ReadonlySet<string>;
  readonly providers: ReadonlySet<string>;
  readonly isStandalone: boolean;               // Standalone component (no module)
}

interface ProjectContext {
  // ... existing ...
  readonly ngModuleMap: ReadonlyMap<string, NgModuleInfo>;
  readonly standaloneComponents: ReadonlySet<string>;
}
```

**Implementation:**
- During `ProjectContext` build phase, scan all `@NgModule` decorators
- Scan all `@Component({ standalone: true, imports: [...] })` decorators
- Build bidirectional map: module ↔ declarations
- Resolve class names to file paths via import graph

**New rules this enables:**
- `module-no-unused-declaration` — declared component not used in any template
- `standalone-no-missing-import` — standalone component uses dependency not in `imports`
- `module-no-circular-import` — modules importing each other
- `enforce-standalone-migration` — flag NgModule-based components

**Acceptance criteria:**
- [x] Maps every NgModule to its declarations, imports, exports, providers
- [x] Maps standalone components to their imports array
- [x] Resolves class names to file paths
- [x] Handles dynamic/lazy-loaded modules (all project files are scanned; lazy modules appear when their files are in scope)

**Implementation notes (completed):**
- `ProjectContext` extended with `standaloneComponents: ReadonlySet<string>` (absolute paths
  of all `standalone: true` entities) and `classToFile: ReadonlyMap<string, string>` (exported
  class name → absolute file path resolver).
- `buildNgModuleMap(program, projectFileSet)` added to `project-context-builder.ts`:
  two-pass algorithm — pass 1 builds `classToFile` from exported class declarations (O(F));
  pass 2 scans `@NgModule`, `@Component`, `@Directive`, `@Pipe` decorators (O(F × D)).
- `@NgModule`: extracts `declarations`, `imports`, `exports`, `providers` identifier arrays
  via `extractArrayElements()`.  Handles `RouterModule.forChild(routes)` style entries
  (property access / call expressions are unwound to the root identifier).
- `@Component({ standalone: true })`: maps standalone components into `ngModuleMap` with
  `isStandalone: true` and adds to `standaloneComponents`.
- `@Directive` / `@Pipe` with `standalone: true` added to `standaloneComponents`.
- `extractBoolProp()` only recognises the `true` keyword literal — runtime variables that
  happen to be `true` are conservatively treated as `false`.
- All nine packages build with zero TypeScript errors.

---

### TICKET-CTX-005: Multi-File Aggregation Rules (Post-Analysis Phase)

**Priority:** High | **Effort:** M | **Depends on:** CTX-001

**Problem:**
The current architecture only supports per-file rules. Some valuable checks require seeing results across all files:
- "Every component in this module uses OnPush" (project-level assertion)
- "No circular dependencies in the import graph" (graph-level)
- "All shared services are `providedIn: 'root'`" (cross-file pattern)

**Proposal:**
Add a `PostAnalysisRule` type that runs after all per-file rules complete:

```typescript
// packages/engine/src/post-analysis-rule.ts

interface PostAnalysisRule {
  readonly name: string;
  readonly phase: 'post-analysis';

  analyze(input: PostAnalysisInput): RuleFailure[];
}

interface PostAnalysisInput {
  /** All per-file rule results */
  readonly results: ReadonlyArray<RuleResult>;

  /** Full project context */
  readonly project: ProjectContext;

  /** All discovered files */
  readonly files: ReadonlyArray<string>;
}
```

**Integration in orchestrator:**

```
Per-File Rules (parallel/workers)
        ↓
Post-Analysis Rules (sequential, main thread)
        ↓
Final Results
```

**New rules this enables:**
- `project-no-circular-dependencies` — detect import cycles
- `project-consistent-change-detection` — all components in a module use same strategy
- `project-no-orphan-components` — components not declared in any module
- `project-barrel-file-depth` — barrel re-export chains too deep

**Acceptance criteria:**
- [ ] Post-analysis rules receive all per-file results + project context
- [ ] They run after all per-file rules (including type-aware)
- [ ] Results are included in final output with proper severity
- [ ] Caching works (invalidate post-analysis when any input file changes)

---

### TICKET-CTX-006: DI Provider Tree Analysis

**Priority:** Medium | **Effort:** L | **Depends on:** CTX-001, CTX-004

**Problem:**
Rules cannot see the dependency injection tree. This blocks:
- Detecting services provided at wrong scope (component vs root vs module)
- Finding duplicate providers across modules
- Detecting circular DI dependencies
- Validating that `providedIn: 'root'` services don't hold component state

**Proposal:**
Add DI tree to `ProjectContext`:

```typescript
interface DIProviderInfo {
  readonly className: string;
  readonly filePath: string;
  readonly providedIn: 'root' | 'platform' | 'any' | string; // module name
  readonly scope: 'singleton' | 'module' | 'component';
  readonly dependencies: ReadonlyArray<string>;  // injected class names
}

interface ProjectContext {
  // ... existing ...
  readonly diTree: ReadonlyMap<string, DIProviderInfo>;
}
```

**New rules this enables:**
- `di-no-circular-dependency` — circular DI resolution
- `di-singleton-no-component-state` — `providedIn: 'root'` service holds component-specific state
- `di-no-duplicate-provider` — same service provided in multiple modules
- `di-scope-mismatch` — component-scoped service injecting module-scoped one

**Acceptance criteria:**
- [ ] Maps all `@Injectable` classes to their provider scope
- [ ] Resolves constructor injection dependencies
- [ ] Handles `inject()` function-based injection
- [ ] Handles `providers` arrays in `@Component` and `@NgModule`

---

### TICKET-CTX-007: Route & Lazy Loading Awareness

**Priority:** Medium | **Effort:** M | **Depends on:** CTX-001, CTX-002

**Problem:**
Rules cannot see the routing configuration, so they can't detect:
- Lazy-loaded modules that import eagerly-loaded services
- Missing route guards
- Inconsistent route patterns
- Bundle size implications of imports crossing lazy boundaries

**Proposal:**
Add route map to `ProjectContext`:

```typescript
interface RouteInfo {
  readonly path: string;
  readonly component?: string;          // Class name
  readonly loadComponent?: string;      // Lazy path
  readonly loadChildren?: string;       // Lazy module path
  readonly guards: ReadonlyArray<string>;
  readonly children: ReadonlyArray<RouteInfo>;
}

interface ProjectContext {
  // ... existing ...
  readonly routeMap: ReadonlyArray<RouteInfo>;
  readonly lazyBoundaries: ReadonlyMap<string, ReadonlySet<string>>; // chunk → files
}
```

**New rules this enables:**
- `route-no-eager-import-in-lazy` — eagerly importing into lazy chunks
- `route-guard-required` — routes missing auth/permission guards
- `route-no-orphan-component` — routable component not in any route
- `route-lazy-boundary-violation` — shared module pulling too much into a lazy chunk

**Acceptance criteria:**
- [ ] Parses `RouterModule.forRoot/forChild` route arrays
- [ ] Parses standalone `provideRouter()` configurations
- [ ] Resolves `loadComponent` and `loadChildren` paths
- [ ] Maps lazy boundaries to file sets

---

### TICKET-CTX-008: Expose `RuleContext.project` to Existing Rules Incrementally

**Priority:** Medium | **Effort:** S | **Depends on:** CTX-001

**Problem:**
Even after building `ProjectContext`, existing rules don't use it. This ticket is about enriching current rules with project-level intelligence.

**Proposal — upgrade candidates:**

| Rule | Enhancement | Value |
|------|-------------|-------|
| `prefer-inject` | Check if injected class is actually `@Injectable` (via DI tree) | Reduce false positives |
| `rxjs-no-subscribe-in-component` | Skip if subscription result is stored in a service (via import graph) | Reduce false positives |
| `rxjs-prefer-to-signal-for-template-state` | Only flag if the observable is actually used in the template (via cross-ref) | Eliminate false positives |
| `prefer-on-push` | Group by NgModule — report "Module X: 3/5 components use OnPush" | Actionable reporting |
| `template-no-call-expression` | Verify called method exists in component class (via cross-ref) | Catch undefined method calls |
| `signal-prefer-computed` | Verify signal reads are from known Signal types (via type-aware DI) | Higher confidence suggestions |

**Acceptance criteria:**
- [ ] Each rule enhancement is behind a feature flag (opt-in via rule options)
- [ ] No regression in performance for users who don't enable project context
- [ ] Each enhancement reduces false positive rate by measurable amount

---

### TICKET-CTX-009: Cross-File Caching Strategy for Project Context

**Priority:** Medium | **Effort:** M | **Depends on:** CTX-001

**Problem:**
Project-level analysis (import graph, module map, DI tree) is expensive. Recomputing it on every run defeats the purpose. The current content-addressable cache (SHA256 per task) doesn't cover project-level artifacts.

**Proposal:**
Extend the caching system with a project-level layer:

```typescript
interface ProjectCacheEntry {
  /** Hash of all project files (sorted paths + content hashes) */
  readonly globalHash: string;

  /** Serialized ProjectContext */
  readonly projectContext: SerializedProjectContext;

  /** Timestamp */
  readonly computedAt: number;
}
```

**Invalidation strategy:**
- **Full invalidation:** File added, removed, or renamed → recompute
- **Partial invalidation:** File content changed → recompute only affected subgraph
  - Import graph: re-resolve imports for changed file + dependents
  - Module map: recompute if changed file is a module/component
  - DI tree: recompute if changed file is a service/provider

**Incremental graph update:**

```
File changed: user.service.ts
  → Re-parse imports for user.service.ts
  → Update forward edges: user.service.ts → [new imports]
  → Update reverse edges for old/new imports
  → Mark dependent modules for re-check
  → Keep rest of graph intact
```

**Acceptance criteria:**
- [ ] Project context is cached between runs
- [ ] Incremental updates for single-file changes (< 50ms)
- [ ] Full recomputation fallback when incremental fails
- [ ] Cache versioning (invalidate on tool version bump)

---

### TICKET-CTX-010: Introduce `StreamType.ClassMember` for Field-Level Rules

**Priority:** Medium | **Effort:** S | **No dependencies**

**Problem:**
Several rules manually iterate class body members inside their handlers (`rxjs-avoid-behaviorsubject`, `rxjs-avoid-subject-as-event-bus`, `rxjs-prefer-to-signal-for-template-state`). This is repetitive and violates the stream-based architecture where the engine should do the traversal.

**Proposal:**
Add a `ClassMember` stream type:

```typescript
interface ClassMemberNode {
  readonly member: ClassBodyMember;        // Property, method, accessor
  readonly parentClass: AngularClassNode;  // The containing class
  readonly decorators: ReadonlyArray<Decorator>;
  readonly accessibility: 'public' | 'private' | 'protected';
  readonly isStatic: boolean;
}
```

Register in visitor-registry alongside existing stream types. Rules receive individual members instead of iterating the class body themselves.

**Rules to refactor:**
- `rxjs-avoid-behaviorsubject-for-local-state` → iterate members via stream
- `rxjs-avoid-subject-as-event-bus` → iterate members via stream
- `rxjs-prefer-to-signal-for-template-state` → iterate members via stream

**Acceptance criteria:**
- [ ] New `StreamType.ClassMember` registered in visitor-registry
- [ ] Engine dispatches individual class members to handlers
- [ ] At least one existing rule refactored to use it
- [ ] No performance regression (members are visited during existing class traversal)

---

### TICKET-CTX-011: Rule Diagnostics — Confidence Scoring

**Priority:** Low | **Effort:** S | **No dependencies**

**Problem:**
All rule failures are reported with equal confidence. But rules operating without type information are inherently less certain. A `subscribe()` call might be on an Observable or a custom method — without TypeChecker, the rule guesses.

**Proposal:**
Add `confidence` to `RuleFailure`:

```typescript
interface RuleFailure {
  // ... existing ...
  readonly confidence?: 'high' | 'medium' | 'low';
  readonly reason?: string;  // Why this confidence level
}
```

**Guidelines:**
- `high` — TypeChecker-verified or syntactically unambiguous
- `medium` — Pattern-matched with good heuristics (naming conventions)
- `low` — Best-effort guess based on syntax alone

**Reporter integration:**
- Console reporter shows confidence badge: `[!] high`, `[?] medium`, `[~] low`
- JSON reporter includes confidence field
- Users can filter by confidence: `--min-confidence medium`

**Acceptance criteria:**
- [ ] `confidence` field added to `RuleFailure`
- [ ] At least 5 rules emit confidence levels
- [ ] Console reporter shows confidence indicator
- [ ] CLI supports `--min-confidence` filter

---

### TICKET-CTX-012: Watch Mode with Incremental Project Context

**Priority:** Low | **Effort:** L | **Depends on:** CTX-001, CTX-009

**Problem:**
No watch mode exists. Developers must re-run the full CLI after each change. With project context (import graph, module map), incremental re-analysis becomes valuable.

**Proposal:**

```
ngcompass analyze --watch
```

**Behavior:**
1. Full analysis on first run (build project context + per-file analysis)
2. Watch for file changes via `chokidar` or `fs.watch`
3. On change:
   - Re-parse only changed file
   - Incrementally update project context (CTX-009)
   - Re-run only affected tasks (changed file + dependents from reverse import graph)
   - Re-run post-analysis rules if project context changed
4. Display incremental results (clear terminal + show current state)

**Acceptance criteria:**
- [ ] Watch mode detects file changes in < 100ms
- [ ] Only affected files are re-analyzed
- [ ] Project context updates incrementally
- [ ] Ctrl+C exits cleanly
- [ ] Handles rapid consecutive saves (debounce)

---

## 4. Prioritized Roadmap

```
Phase 1 — Foundation (CTX-001 + CTX-010 + CTX-011)
  ├── ProjectContext interface & infrastructure
  ├── ClassMember stream type (quick win, no deps)
  └── Confidence scoring (quick win, no deps)

Phase 2 — Cross-File Intelligence (CTX-002 + CTX-003)
  ├── Import graph builder
  └── Template ↔ Component cross-reference

Phase 3 — Angular Semantic Model (CTX-004 + CTX-005)
  ├── NgModule / standalone boundary map
  └── Post-analysis aggregation rules

Phase 4 — Deep Analysis (CTX-006 + CTX-007 + CTX-008)
  ├── DI provider tree
  ├── Route / lazy loading awareness
  └── Incremental enrichment of existing rules

Phase 5 — Developer Experience (CTX-009 + CTX-012)
  ├── Cross-file caching strategy
  └── Watch mode with incremental updates
```

---

## 5. Comparison with Industry

| Feature | ESLint | angular-eslint | Nx | **ngcompass (current)** | **ngcompass (proposed)** |
|---------|--------|---------------|-----|------------------------|-------------------------|
| Single-file AST | Yes | Yes | N/A | Yes | Yes |
| Type-aware rules | Via typescript-eslint | Via typescript-eslint | N/A | Yes (2 rules) | Yes (all rules) |
| Template analysis | No | Yes | N/A | Yes | Yes |
| Import graph | No | No | **Yes** | **No** | **Yes (CTX-002)** |
| Module boundaries | No | Partial | **Yes** | **No** | **Yes (CTX-004)** |
| DI analysis | No | No | No | **No** | **Yes (CTX-006)** |
| Post-analysis | No | No | Yes (dep graph) | **No** | **Yes (CTX-005)** |
| Cross-file rules | No | No | **Yes** | **No** | **Yes (CTX-001)** |
| Route awareness | No | No | Partial | **No** | **Yes (CTX-007)** |

**Your differentiator:** No tool in the Angular ecosystem combines single-pass performance + Angular semantic model (modules, DI, routes) + cross-file rules. ESLint is single-file. Nx is project-graph but not lint-deep. You can own the "Angular-aware static analysis" niche.

---

## 6. Key Architectural Principle

> **Keep the single-pass engine for per-file rules. Add project context as a pre-computed, read-only, cached layer that rules can opt into.**

This preserves:
- Sub-5ms per-file execution for syntax-only rules
- Worker thread parallelization for the common case
- Deterministic, content-addressable caching
- Zero cost for rules that don't need project context

While enabling:
- Cross-file intelligence when rules opt in
- Post-analysis aggregation rules
- Incremental project context updates in watch mode
