# ngcompass — Architecture Inventory

> **Date:** 2026-02-28
> **Auditor:** Automated structural review (Claude Sonnet 4.6)
> **Branch:** `feat_quality`
> **Tool versions:** pnpm@10.26.0 · Turbo@2.8.3 · TypeScript@5.9.3 · Vitest@4.x

---

## Table of Contents

1. [Monorepo Overview](#1-monorepo-overview)
2. [Package Inventory](#2-package-inventory)
3. [Internal Dependency Graph](#3-internal-dependency-graph)
4. [Architectural Layers](#4-architectural-layers)
5. [Public API Surface Audit](#5-public-api-surface-audit)
6. [Key Architectural Patterns](#6-key-architectural-patterns)
7. [Current-State Risks Summary](#7-current-state-risks-summary)

---

## 1. Monorepo Overview

| Property | Value |
|----------|-------|
| **Workspace manager** | pnpm@10.26.0 with `pnpm-workspace.yaml` |
| **Build orchestrator** | Turbo 2.8.3 (tasks: build, typecheck, test, lint) |
| **Language** | TypeScript 5.9.x (ESM-first, Node16/bundler module resolution) |
| **Test framework** | Vitest 4.x (globals mode, v8 coverage, 90/90/85/90 thresholds) |
| **Bundler** | tsup 8.x (wraps esbuild; outputs CJS + ESM + .d.ts) |
| **Release** | Changesets (independent versioning, `baseBranch: main`) |
| **Runtime target** | Node.js ≥ 18.0.0 |
| **Packages** | 6 (`common`, `core`, `cli`, `reporters`, `rules`, `testing`) |
| **Total LOC (approx.)** | ~4 000 (src only, excluding dist/tests) |

### Workspace Root Files

| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Declares `packages/*` as workspace packages |
| `turbo.json` | Task pipeline, remote cache enabled, inputs/outputs declared |
| `tsconfig.json` | Root TS config — `Node16/Node16`, `composite:true` |
| `tsconfig.build.json` | Extends root, adds `outDir/rootDir`, excludes spec files |
| `tsconfig.spec.json` | **CJS/legacy** config for ts-jest (separate from vitest) |
| `.eslintrc.cjs` | ESLint config — `recommended-requiring-type-checking` included but most rules disabled |
| `vitest.config.ts` | Root vitest config with SWC transformer, 90% coverage thresholds |
| `.swcrc` | SWC compiler config for test transforms |
| `.changeset/config.json` | Release config, `updateInternalDependencies: patch` |
| `tsup.config.ts` | Shared tsup config factory (`createConfig()`) — **currently unused** |

---

## 2. Package Inventory

### @ngcompass/common

| Field | Value |
|-------|-------|
| **Purpose** | Shared domain types, error taxonomy, constants, logger, AST utilities |
| **Status** | ✅ Active |
| **Entry point** | `src/index.ts` |
| **Exports** | `constants`, `interfaces`, `errors`, `types`, `ast/utils`, `logger` |
| **Lines (src)** | ~700 |
| **Production deps** | None |
| **Internal deps** | None (foundation layer) |
| **Owner** | Platform |

**Key exports:** `NormalizedAnalyzerConfig`, `AnalyzerConfig`, `InfrastructureError*`, `PluginManifest`, `TelemetryConfig`, `Logger`, `KNOWN_NAMESPACES`, `CACHE_VERSION`, `PACKAGE_VERSION`, `DEFAULT_INCLUDE_PATTERNS`, `Severity`, `Result<T,E>` / `Ok` / `Err`

**Missing exports (gap):** `createPosition`, `normalizePath` in `ast/utils.ts` are **not re-exported** from `src/index.ts`, making them effectively inaccessible via the public API (tests import them directly which causes resolution issues).

---

### @ngcompass/core

| Field | Value |
|-------|-------|
| **Purpose** | Core engine: file scanning, config loading, AST parsing, rule registry, execution planner, analysis orchestrator, multi-tier cache |
| **Status** | ✅ Active — **God-package** |
| **Entry point** | `src/index.ts` (107-line barrel) |
| **Exports** | Everything from 8+ subsystems |
| **Lines (src)** | ~2 500+ |
| **Production deps** | 16 external packages incl. `typescript@^5.9.3`, `oxc-parser`, `zod`, `cacache`, `lru-cache`, `xxhash-wasm` |
| **Internal deps** | `@ngcompass/common` |
| **Owner** | Core Engine |
| **Build entry points** | `src/index.ts`, `src/planner/worker.ts`, `src/engine/execution-worker.ts` |

**Subsystems exposed directly from the single barrel:**

| Subsystem | Sub-path | Notable exports |
|-----------|----------|----------------|
| Cache | `cache/` | `createCacheContext`, `getCacheContext`, `resetGlobalCache` |
| Config | `config/` | `resolveConfig`, `validateConfig`, `initConfig` |
| Scanner | `scanner/` | `scan` |
| Rules | `rules/` | `resolveRules`, `getEnabledRules`, rule types, 19 built-in rules |
| Planner | `planner/` | `buildExecutionPlan` |
| Engine | `engine/` | `runAnalysis` |
| Parsers | `parsers/` | `parseTypeScript`, `parseTemplate` |
| Registry | `rules/registry/` | `getGlobalRegistry`, `loadPlugins` |

⚠️ **Side-effect import:** `src/index.ts` contains `import './rules/register-all.js'` — importing **anything** from `@ngcompass/core` silently registers all 19 built-in rules into the global mutable registry.

---

### @ngcompass/rules

| Field | Value |
|-------|-------|
| **Purpose** | (Intended) External-facing rule package / plugin registry |
| **Status** | ⚠️ **Stub** — public API is `export const rules = '@ngcompass/rules'` |
| **Lines (src)** | ~5 |
| **Production deps** | `@ngcompass/common`, `@ngcompass/core` |
| **Owner** | Rules Team |

**Problem:** All 19 rule implementations live inside `@ngcompass/core/src/rules/migration/`. The `rules` package is architecturally misleading — it declares a dependency on `core` but provides nothing. The `tsconfig.json` includes the cross-package path `"../core/src/rules/domains"` which references a **non-existent directory**.

---

### @ngcompass/reporters

| Field | Value |
|-------|-------|
| **Purpose** | Output formatters: console (rich + compact), JSON, SARIF, config health reporter |
| **Status** | ✅ Active |
| **Entry point** | `src/index.ts` |
| **Lines (src)** | ~650 |
| **Production deps** | `@babel/code-frame`, `picocolors`, `@ngcompass/common`, `@ngcompass/core` |
| **Internal deps** | `@ngcompass/common` + **`@ngcompass/core`** |
| **Owner** | Platform |

**Coupling concern:** `reporters` depends on `@ngcompass/core` to import `RuleFailure`, `RuleResult`, `RuleSeverity` types. These are domain types that should live in `@ngcompass/common` so that `reporters` only needs the foundation package, not the full engine.

---

### @ngcompass/cli

| Field | Value |
|-------|-------|
| **Purpose** | CLI binary (`compass`): command registration, pipeline orchestration, exit code management |
| **Status** | ✅ Active |
| **Entry point** | `src/index.ts` → `src/bin/ngcompass.ts` |
| **Build entry points** | `src/index.ts`, `src/bin/ngcompass.ts` |
| **Lines (src)** | ~450 |
| **Production deps** | `commander`, `chalk`*, `ora`*, `@ngcompass/common`, `@ngcompass/core`, `@ngcompass/reporters`, `@ngcompass/rules` |
| **Owner** | Platform |

\* `chalk@^5.0.0` and `ora@^7.0.0` appear in production dependencies but are **not used** in any reviewed source file. Likely vestiges from a previous design.

---

### @ngcompass/testing

| Field | Value |
|-------|-------|
| **Purpose** | (Intended) Shared test utilities and rule test harness |
| **Status** | ⚠️ **Stub** — public API is `export const testing = '@ngcompass/testing'` |
| **Lines (src)** | ~5 |
| **Production deps** | `@ngcompass/common` |
| **Owner** | Platform |

**Problem:** No test utilities are implemented. Each package that needs test helpers either duplicates setup code or goes without.

---

## 3. Internal Dependency Graph

```
@ngcompass/cli
    ├── @ngcompass/common
    ├── @ngcompass/core
    │       └── @ngcompass/common
    ├── @ngcompass/reporters
    │       ├── @ngcompass/common
    │       └── @ngcompass/core      ← reporters → core coupling
    └── @ngcompass/rules
            ├── @ngcompass/common
            └── @ngcompass/core

@ngcompass/testing
    └── @ngcompass/common

Legend:
  ──►  workspace:* dependency (declared)
  🔴  architectural concern
```

**Topological order (build sequence):** `common` → `testing` → `core` → `reporters` → `rules` → `cli`

**No circular dependencies** exist in declared production dependencies.

---

## 4. Architectural Layers

### Current state (implicit layers)

```
┌──────────────────────────────────────────────────────┐
│                     CLI Layer                        │
│              @ngcompass/cli                          │
│  (command orchestration, exit codes, UX options)     │
└───────────────────────┬──────────────────────────────┘
                        │ depends on
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ @ngcompass/  │ │ @ngcompass/  │ │ @ngcompass/  │
│   rules      │ │  reporters   │ │   [future]   │
│  (STUB)      │ │              │ └──────────────┘
└──────┬───────┘ └──────┬───────┘
       │                │ both depend on
       └────────┬───────┘
                ▼
┌───────────────────────────────────────────────────────┐
│                  @ngcompass/core                      │
│  GOD-PACKAGE:                                         │
│  cache · config · scanner · parser ·                  │
│  rules registry · rule implementations ·              │
│  planner · engine · orchestrator                      │
└───────────────────────┬───────────────────────────────┘
                        │ depends on
                        ▼
┌───────────────────────────────────────────────────────┐
│                 @ngcompass/common                     │
│  types · errors · constants · logger · ast utils      │
└───────────────────────────────────────────────────────┘
```

### Target layers (proposed — see `target-architecture.md`)

```
Layer 4 (CLI)         @ngcompass/cli
Layer 3 (Apps)        @ngcompass/reporters  @ngcompass/rules
Layer 2 (Domain)      @ngcompass/engine  @ngcompass/cache  @ngcompass/config
Layer 1 (Foundation)  @ngcompass/common  @ngcompass/testing
```

---

## 5. Public API Surface Audit

### Exports completeness

| Package | Public exports | Known gaps |
|---------|---------------|------------|
| `common` | Constants, interfaces, errors, types, logger | `createPosition`, `normalizePath` from `ast/utils.ts` are **not exported** |
| `core` | All subsystems via 107-line barrel | No sub-path exports; consumers get the entire engine |
| `reporters` | Reporters, factory, types, output helpers | — |
| `rules` | Single string constant | No rule implementations; all rules are in `core` |
| `cli` | `run()` function | — |
| `testing` | Single string constant | No test utilities |

### Exports field analysis

All packages use the minimal single-entry exports map:
```json
{ ".": { "types": "...", "import": "...", "require": "..." } }
```

**No sub-path exports exist.** Consumers cannot selectively import `@ngcompass/core/cache` or `@ngcompass/core/rules` — they must take the entire barrel, including the side-effect rule registration.

### Missing `sideEffects` declaration

No package declares `"sideEffects"` in `package.json`. The `@ngcompass/core` barrel performs `import './rules/register-all.js'` which mutates global state. Without `"sideEffects": true`, bundlers may drop this in tree-shaking mode, breaking rule registration silently.

---

## 6. Key Architectural Patterns

### Used consistently

| Pattern | Where |
|---------|-------|
| `Result<T,E>` / `Ok` / `Err` | `scanner`, `config`, `planner`, `rules` — functional error handling |
| Worker threads | `planner/worker.ts`, `engine/execution-worker.ts` — parallelism for file analysis |
| Multi-tier cache | `cache/` — Memory (L1) + Disk (L2 via cacache + atomic writes) |
| `InfrastructureErrorCollector` | `engine/orchestrator.ts` — structured error accumulation |
| Plugin system | `rules/registry/` — external rule plugins loadable via `plugins[]` config |
| Incremental analysis | `planner/builder.ts` — global hash + file hash → cache hit/miss |
| Vitest + SWC | Root vitest config — fast test transform without full tsc compilation |

### Used inconsistently / partially

| Pattern | Issue |
|---------|-------|
| `errorCollector.record()` | Only in `orchestrator.ts`; `single-pass-engine.ts` uses `console.error` directly |
| TypeScript project references | Root `composite:true` declared but all packages set `composite:false` |
| Shared tsup config factory | `tsup.config.ts` at root exports `createConfig()` but zero packages import it |
| Named exports for options objects | `discoverResources(path, true, true, true, true)` uses positional booleans |

---

## 7. Current-State Risks Summary

| Risk | Severity | Category |
|------|----------|----------|
| `@ngcompass/core` is a god-package | 🔴 High | Architecture |
| `rules` and `testing` packages are stubs | 🟠 Medium | Architecture |
| Side-effect registration on any `core` import | 🔴 High | Coupling |
| `reporters` depends on `core` for domain types | 🟠 Medium | Boundary |
| `rules/tsconfig.json` includes non-existent cross-package path | 🟠 Medium | Build |
| `typescript` in core production deps (not peer dep) | 🟠 Medium | Dependency |
| `jest`/`ts-jest` leftovers in `common` devDeps | 🟡 Low | Dependency |
| `chalk`/`ora` unused in cli deps | 🟡 Low | Dependency |
| Both CI workflows trigger on wrong/different branches | 🔴 High | CI/CD |
| pnpm v8 in `test.yml` vs pnpm@10 in root | 🔴 High | CI/CD |
| Missing `check-coverage.js` script referenced in CI | 🔴 High | CI/CD |
| No Turbo in CI (wasted caching opportunity) | 🟠 Medium | Performance |
| All type-aware ESLint rules disabled | 🟠 Medium | Quality gate |
| `PACKAGE_VERSION = "v0.0.0"` hardcoded | 🟡 Low | Release |
| No sub-path exports (tree-shaking blocked) | 🟠 Medium | Performance |
| Missing `sideEffects` field | 🟠 Medium | Bundling |

---

*See `boundary-violations.md`, `dependency-governance.md`, `build-quality-report.md`, and `target-architecture.md` for detailed remediation plans.*
