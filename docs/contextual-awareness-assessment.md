# ngcompass Contextual Awareness Assessment

## Senior Architect Review — March 2026

---

## 1. Current State: How Contextual Is Your Linter?

### Verdict: **Level 3–4 — Type-Aware + Project-Graph-Aware**

| Level | Description | Status |
|-------|-------------|--------|
| 1 | Syntax-only (regex/token) | ✅ Exceeded |
| 2 | Single-file AST + Angular template/style | ✅ All 29 rules |
| 3 | Type-aware cross-file resolution | ✅ 4 rules use TypeChecker |
| 4 | Project-graph-aware (imports, DI, modules) | ✅ Implemented (CTX-001 → CTX-004) |
| 5 | Workspace-aware (monorepo boundaries, libs) | 🔲 Not yet |

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
│  ✅ TypeChecker (if typeChecker required)            │
│  ✅ Locator (line/column mapping)                    │
│  ✅ Rule options from config                         │
│  ✅ ProjectContext.importGraph                       │
│  ✅ ProjectContext.reverseImportGraph                │
│  ✅ ProjectContext.ngModuleMap                       │
│  ✅ ProjectContext.standaloneComponents              │
│  ✅ ProjectContext.componentGraph                    │
│  ✅ ProjectContext.templateToComponent               │
│  ✅ RuleContext.crossRef (template ↔ component)      │
│                                                      │
│  CANNOT see:                                         │
│  ❌ DI provider tree (CTX-006 — pending)             │
│  ❌ Route configuration (CTX-007 — pending)          │
│  ❌ Shared analysis across all rules (CTX-005)       │
│  ❌ Monorepo library boundaries                      │
└─────────────────────────────────────────────────────┘
```

### Rule-by-Rule Contextual Classification (29 rules)

| Rule | Category | TypeChecker | ProjectContext | CrossRef |
|------|----------|:-----------:|:--------------:|:--------:|
| `prefer-on-push` | performance | No | No | No |
| `template-no-call-expression` | performance | No | No | No |
| `template-trackby-required` | performance | No | No | No |
| `template-no-object-literal-binding` | performance | No | No | No |
| `template-no-array-literal-binding` | performance | No | No | No |
| `prefer-inject` | modern-api | **Yes** | No | No |
| `signal-prefer-input-signal` | modern-api | No | No | No |
| `signal-prefer-output-function` | modern-api | No | No | No |
| `signal-prefer-model` | modern-api | No | No | No |
| `component-no-manual-detect-changes` | correctness | No | No | No |
| `signal-no-side-effects-in-computed` | correctness | No | No | No |
| `signal-effect-must-be-destroy-scoped` | correctness | No | No | No |
| `signal-no-effect-in-constructor` | correctness | No | No | No |
| `rxjs-no-nested-subscribe` | correctness | No | No | No |
| `rxjs-no-subscribe-in-component` | reactivity | No | No | No |
| `rxjs-require-take-until-destroyed` | reactivity | No | No | No |
| `rxjs-avoid-behaviorsubject-for-local-state` | reactivity | **Yes** | No | **Yes** |
| `rxjs-avoid-subject-as-event-bus` | reactivity | No | No | No |
| `rxjs-prefer-to-signal-for-template-state` | reactivity | **Yes** | No | **Yes** |
| `to-signal-require-initial-value` | reactivity | No | No | No |
| `signal-prefer-computed-over-sync-effect` | reactivity | **Yes** | No | No |
| `signal-avoid-untracked-overuse` | reactivity | No | No | No |
| `no-bypass-sanitization` | security | No | No | No |
| `template-no-unsafe-bindings` | security | No | No | No |
| `no-document-access` | ssr | No | No | No |
| `prefer-after-render-over-after-view-init` | ssr | No | No | No |
| `template-prefer-control-flow` | template | No | No | No |
| `template-no-async-pipe-duplication` | template | No | No | No |
| `spec-no-focused-test` | testing | No | No | No |

**Bottom line: 4/29 rules use TypeChecker. 2/29 use CrossRef. 0/29 rules yet use importGraph, ngModuleMap, or standaloneComponents — these are built and ready, but no rule has been upgraded to consume them (see CTX-008).**

---

## 2. Architectural Strengths

1. **Single-pass engine with stream dispatch** — O(N) traversal, O(1) per-node. Per-file rules remain fast and parallelized even as project context grows.

2. **TypeChecker integration** — `type-aware-context.ts` creates one project-wide `ts.Program`. Type-aware tasks now run with `effectiveMaxWorkers` concurrency (was hard-coded 1). The Program is shared and read-only — no data-race risk.

3. **Two-phase type-aware execution** — `warmup()` on `TypeAwareAnalysisContext` makes `ts.Program` initialization explicit before file batches begin. Debug logs report phase boundaries precisely.

4. **Per-file cache eviction** — `AnalysisContext.evict(filePath)` is called after every file batch. Peak memory is now bounded to `concurrency × file_size` instead of `total_files × file_size`. `fileCache` is also LRU-capped at 128 entries as a hard ceiling.

5. **ProjectContext layer** — Import graph, reverse graph, NgModule map, standalone components, component graph, and template-to-component reverse map are all pre-computed once per run and passed read-only to rules that opt in.

6. **Content-addressable caching** — SHA256-based task IDs extend naturally to project-level artifacts (add import graph hash as an additional cache key dimension).

7. **Plugin system** — `RuleRegistry` + `RulePlugin` means third-party rules benefit from the same context enrichment for free.

---

## 3. Open Tickets

Tickets are ordered by **impact/effort ratio** (highest first). Completed tickets have been removed.

---

### TICKET-CTX-005: Multi-File Aggregation Rules (Post-Analysis Phase)

**Priority:** High | **Effort:** M | **Depends on:** CTX-001 ✅

**Problem:**
The current architecture only supports per-file rules. Some valuable checks require seeing results across all files:
- "Every component in this module uses OnPush" (project-level assertion)
- "No circular dependencies in the import graph" (graph-level)
- "All shared services are `providedIn: 'root'`" (cross-file pattern)

**Proposal:**
Add a `PostAnalysisRule` type that runs after all per-file rules complete:

```typescript
interface PostAnalysisRule {
  readonly name: string;
  readonly phase: 'post-analysis';
  analyze(input: PostAnalysisInput): RuleFailure[];
}

interface PostAnalysisInput {
  readonly results: ReadonlyArray<RuleResult>;
  readonly project: ProjectContext;
  readonly files: ReadonlyArray<string>;
}
```

**Execution flow:**
```
Per-File Rules (parallel / workers)
        ↓
Post-Analysis Rules (sequential, main thread)
        ↓
Final Results
```

**New rules this enables:**
- `project-no-circular-dependencies` — detect import cycles in the importGraph
- `project-consistent-change-detection` — all components in a module use same strategy
- `project-no-orphan-components` — components not declared in any module
- `project-barrel-file-depth` — barrel re-export chains too deep

**Acceptance criteria:**
- [ ] Post-analysis rules receive all per-file results + project context
- [ ] They run after all per-file rules (including type-aware)
- [ ] Results are included in final output with proper severity
- [ ] Caching works (invalidate post-analysis when any input file changes)

---

### TICKET-CTX-008: Expose `ProjectContext` to Existing Rules

**Priority:** Medium | **Effort:** S | **Depends on:** CTX-001 ✅

**Problem:**
`ProjectContext` (importGraph, ngModuleMap, standaloneComponents, componentGraph) is fully built and attached to `RuleContext` for every run — but zero existing rules consume it. The data exists; it just goes unused.

**Upgrade candidates:**

| Rule | Enhancement | Value |
|------|-------------|-------|
| `rxjs-no-subscribe-in-component` | Skip if subscription result is stored in a service (via importGraph) | Reduce false positives |
| `rxjs-prefer-to-signal-for-template-state` | Only flag if observable is actually used in the template (via crossRef) | Eliminate false positives |
| `prefer-on-push` | Group by NgModule — report "Module X: 3/5 components use OnPush" | Actionable reporting |
| `template-no-call-expression` | Verify called method exists in component class (via crossRef) | Catch undefined method calls |
| `prefer-inject` | Check if injected class is actually `@Injectable` (via ngModuleMap) | Reduce false positives |

**Acceptance criteria:**
- [ ] Each rule enhancement is behind a feature flag (opt-in via rule options)
- [ ] No regression in performance for users who don't enable project context
- [ ] Each enhancement measurably reduces false positive rate

---

### TICKET-CTX-006: DI Provider Tree Analysis

**Priority:** Medium | **Effort:** L | **Depends on:** CTX-001 ✅, CTX-004 ✅

**Problem:**
Rules cannot see the dependency injection tree, blocking:
- Detecting services provided at wrong scope (component vs root vs module)
- Finding duplicate providers across modules
- Validating that `providedIn: 'root'` services don't hold component state

**Proposal:**
Add DI tree to `ProjectContext`:

```typescript
interface DIProviderInfo {
  readonly className: string;
  readonly filePath: string;
  readonly providedIn: 'root' | 'platform' | 'any' | string;
  readonly scope: 'singleton' | 'module' | 'component';
  readonly dependencies: ReadonlyArray<string>;
}

interface ProjectContext {
  // ... existing ...
  readonly diTree: ReadonlyMap<string, DIProviderInfo>;
}
```

**New rules this enables:**
- `di-no-circular-dependency`
- `di-singleton-no-component-state`
- `di-no-duplicate-provider`
- `di-scope-mismatch`

**Acceptance criteria:**
- [ ] Maps all `@Injectable` classes to their provider scope
- [ ] Resolves constructor injection dependencies
- [ ] Handles `inject()` function-based injection
- [ ] Handles `providers` arrays in `@Component` and `@NgModule`

---

### TICKET-CTX-007: Route & Lazy Loading Awareness

**Priority:** Medium | **Effort:** M | **Depends on:** CTX-001 ✅, CTX-002 ✅

**Problem:**
Rules cannot see the routing configuration, blocking detection of:
- Lazy-loaded modules importing eagerly-loaded services
- Missing route guards
- Bundle size implications of imports crossing lazy boundaries

**Proposal:**
Add route map to `ProjectContext`:

```typescript
interface RouteInfo {
  readonly path: string;
  readonly component?: string;
  readonly loadComponent?: string;
  readonly loadChildren?: string;
  readonly guards: ReadonlyArray<string>;
  readonly children: ReadonlyArray<RouteInfo>;
}

interface ProjectContext {
  // ... existing ...
  readonly routeMap: ReadonlyArray<RouteInfo>;
  readonly lazyBoundaries: ReadonlyMap<string, ReadonlySet<string>>;
}
```

**New rules this enables:**
- `route-no-eager-import-in-lazy`
- `route-guard-required`
- `route-no-orphan-component`
- `route-lazy-boundary-violation`

**Acceptance criteria:**
- [ ] Parses `RouterModule.forRoot/forChild` route arrays
- [ ] Parses standalone `provideRouter()` configurations
- [ ] Resolves `loadComponent` and `loadChildren` paths
- [ ] Maps lazy boundaries to file sets

---

### TICKET-CTX-009: Cross-File Caching Strategy for Project Context

**Priority:** Medium | **Effort:** M | **Depends on:** CTX-001 ✅

**Problem:**
`ProjectContext` is recomputed on every run. On a 2,000-file project this adds 200–400ms before any rule executes. The current per-file SHA256 cache doesn't cover project-level artifacts.

**Proposal:**

```typescript
interface ProjectCacheEntry {
  readonly globalHash: string;          // hash of all file paths + content hashes
  readonly projectContext: SerializedProjectContext;
  readonly computedAt: number;
}
```

**Invalidation strategy:**
- **Full recompute:** file added, removed, or renamed
- **Partial recompute:** file changed → re-resolve only changed file's edges + dependents

**Acceptance criteria:**
- [ ] Project context is persisted and loaded between runs
- [ ] Incremental updates for single-file changes (< 50ms)
- [ ] Full recomputation fallback when incremental is unsafe
- [ ] Cache versioned — bumped on tool version update

---

### TICKET-CTX-010: `StreamType.ClassMember` for Field-Level Rules

**Priority:** Medium | **Effort:** S | **No dependencies**

**Problem:**
Three rules (`rxjs-avoid-behaviorsubject`, `rxjs-avoid-subject-as-event-bus`, `rxjs-prefer-to-signal-for-template-state`) manually iterate class body members inside their handlers. This duplicates traversal logic the engine already performs and breaks the stream-dispatch architecture.

**Proposal:**

```typescript
interface ClassMemberNode {
  readonly member: ClassBodyMember;
  readonly parentClass: AngularClassNode;
  readonly decorators: ReadonlyArray<Decorator>;
  readonly accessibility: 'public' | 'private' | 'protected';
  readonly isStatic: boolean;
}
```

Register as `StreamType.ClassMember` in the visitor-registry. Rules receive individual members dispatched by the engine.

**Acceptance criteria:**
- [ ] `StreamType.ClassMember` registered in visitor-registry
- [ ] Engine dispatches individual class members to handlers
- [ ] At least one existing rule refactored to use it
- [ ] No performance regression

---

### TICKET-CTX-011: Rule Confidence Scoring

**Priority:** Low | **Effort:** S | **No dependencies**

**Problem:**
All rule failures are reported with equal confidence. Rules without TypeChecker are inherently less certain — a `.subscribe()` call may be on an Observable or on a custom class.

**Proposal:**

```typescript
interface RuleFailure {
  // ... existing ...
  readonly confidence?: 'high' | 'medium' | 'low';
  readonly reason?: string;
}
```

- `high` — TypeChecker-verified or syntactically unambiguous
- `medium` — Pattern-matched with good heuristics
- `low` — Best-effort guess based on syntax alone

**Reporter integration:**
- Console reporter badge: `[!] high`, `[?] medium`, `[~] low`
- JSON reporter includes confidence field
- CLI supports `--min-confidence medium`

**Acceptance criteria:**
- [ ] `confidence` field added to `RuleFailure` in `@ngcompass/common`
- [ ] At least 5 rules emit confidence levels
- [ ] Console reporter shows confidence indicator
- [ ] CLI supports `--min-confidence` filter

---

### TICKET-CTX-012: Watch Mode with Incremental Project Context

**Priority:** Low | **Effort:** L | **Depends on:** CTX-001 ✅, CTX-009

**Problem:**
No watch mode exists. Developers re-run the full CLI after every save.

**Proposal:**

```
ngcompass analyze --watch
```

1. Full analysis on first run
2. Watch for file changes via `chokidar` or `fs.watch`
3. On change: re-parse changed file, update ProjectContext incrementally, re-run only affected tasks
4. Display incremental diff to terminal

**Acceptance criteria:**
- [ ] File change detected in < 100ms
- [ ] Only affected files re-analyzed
- [ ] Project context updates incrementally (uses CTX-009)
- [ ] Ctrl+C exits cleanly with no dangling handles
- [ ] Rapid consecutive saves are debounced

---

## 4. Roadmap

```
✅ Phase 1 — Foundation
  ✅ CTX-001  ProjectContext interface & infrastructure
  ✅ CTX-002  Import graph builder (forward + reverse + barrels)
  ✅ CTX-003  Template ↔ Component cross-reference
  ✅ CTX-004  NgModule / standalone boundary map

🔲 Phase 2 — Rule Enrichment (next up)
  🔲 CTX-008  Wire existing rules to ProjectContext data
  🔲 CTX-010  ClassMember stream type
  🔲 CTX-011  Confidence scoring

🔲 Phase 3 — Deep Angular Semantics
  🔲 CTX-005  Post-analysis aggregation rules
  🔲 CTX-006  DI provider tree
  🔲 CTX-007  Route / lazy loading awareness

🔲 Phase 4 — Developer Experience
  🔲 CTX-009  Cross-file caching strategy
  🔲 CTX-012  Watch mode with incremental updates
```

---

## 5. Comparison with Industry

| Feature | ESLint | angular-eslint | Nx | **ngcompass (current)** |
|---------|--------|---------------|-----|------------------------|
| Single-file AST | ✅ | ✅ | — | ✅ |
| Type-aware rules | ✅ via typescript-eslint | ✅ via typescript-eslint | — | ✅ (4 rules) |
| Template analysis | ❌ | ✅ | — | ✅ |
| Import graph | ❌ | ❌ | ✅ | ✅ CTX-002 |
| Module boundaries | ❌ | Partial | ✅ | ✅ CTX-004 |
| DI analysis | ❌ | ❌ | ❌ | 🔲 CTX-006 |
| Post-analysis rules | ❌ | ❌ | ✅ dep graph | 🔲 CTX-005 |
| Cross-file rules | ❌ | ❌ | ✅ | ✅ CTX-001 |
| Route awareness | ❌ | ❌ | Partial | 🔲 CTX-007 |
| Component ↔ template crossref | ❌ | ❌ | ❌ | ✅ CTX-003 |

**Differentiator:** No tool in the Angular ecosystem combines single-pass per-file performance with a full Angular semantic model (import graph, module boundaries, component/template crossref). ESLint is single-file only. Nx has the project graph but no rule depth. ngcompass is the only tool with both.

---

## 6. Architectural Principle

> **Keep the single-pass engine for per-file rules. Add project context as a pre-computed, read-only, cached layer that rules can opt into.**

This preserves:
- Sub-5ms per-file execution for syntax-only rules
- Worker thread parallelization for the common case
- Deterministic, content-addressable caching
- Zero cost for rules that don't need project context

While enabling:
- Cross-file intelligence when rules opt in
- Post-analysis aggregation rules (CTX-005)
- Incremental project context updates in watch mode (CTX-012)
