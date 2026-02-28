# ngcompass — Target Architecture & Migration Plan

> **Date:** 2026-02-28
> **Horizon:** 3–6 months, incremental — no "big bang" rewrite
> **Principles applied:** SRP, OCP, DIP, Law of Demeter, DRY, KISS, Fail Fast

---

## Table of Contents

1. [Target Package Structure](#1-target-package-structure)
2. [Allowed Dependency Directions](#2-allowed-dependency-directions)
3. [Package Responsibility Charter](#3-package-responsibility-charter)
4. [Public API Rules](#4-public-api-rules)
5. [Enforcement Tooling](#5-enforcement-tooling)
6. [Phased Migration Plan](#6-phased-migration-plan)
7. [CI/CD Target State](#7-cicd-target-state)

---

## 1. Target Package Structure

### Current (6 packages, 2 stubs, 1 god-package)

```
packages/
  common/      ← foundation types, utilities
  core/        ← GOD-PACKAGE: engine + cache + scanner + config + rules + planner
  reporters/   ← output formatters (but depends on core unnecessarily)
  rules/       ← STUB (nothing in it)
  cli/         ← binary orchestration
  testing/     ← STUB (nothing in it)
```

### Target (8 focused packages)

```
packages/
  common/        ← foundation: types, errors, constants, logger, result-types  [exists, expand]
  core/          ← engine: orchestrator, planner, scanner, parsers, cache       [shrink]
  rules/         ← rule implementations (migrated from core)                    [populate]
  reporters/     ← output formatters (decoupled from core)                      [decouple]
  testing/       ← rule test harness, vitest helpers                            [implement]
  cli/           ← CLI binary only                                               [exists, trim]
  [future] config/ ← config loading, validation, plugin system                 [extract from core]
  [future] types/  ← shared TypeScript types for plugin authors                [extract from common]
```

> The `config/` and `types/` packages are Phase 3 aspirations. Phases 1–2 achieve the critical decouplings without creating new packages.

---

## 2. Allowed Dependency Directions

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4: Delivery                                                  │
│  @ngcompass/cli                                                     │
│  Can import: common, core, reporters, rules                         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
│ LAYER 3: Apps   │ │ LAYER 3: Apps │ │ LAYER 3: Apps   │
│ @ngcompass/     │ │ @ngcompass/   │ │ @ngcompass/     │
│   reporters     │ │   rules       │ │   testing       │
│ Can import:     │ │ Can import:   │ │ Can import:     │
│   common        │ │   common,core │ │   common        │
│   NOT core      │ └───────┬───────┘ └─────────────────┘
└─────────────────┘         │
              │             │
              └──────┬──────┘
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2: Engine                                                    │
│  @ngcompass/core                                                    │
│  Can import: common                                                 │
│  Cannot import: cli, reporters, rules, testing                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1: Foundation                                                │
│  @ngcompass/common                                                  │
│  Cannot import anything from this monorepo                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Dependency Rules Table

| Consumer ↓ \ Producer → | common | core | reporters | rules | cli | testing |
|--------------------------|--------|------|-----------|-------|-----|---------|
| `common` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `core` | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| `reporters` | ✅ | ❌ **target** | — | ❌ | ❌ | ❌ |
| `rules` | ✅ | ✅ | ❌ | — | ❌ | ❌ |
| `testing` | ✅ | ❌ **target** | ❌ | ❌ | ❌ | — |
| `cli` | ✅ | ✅ | ✅ | ✅ | — | ❌ |

**Key change from current state:**
- `reporters` → `core`: ❌ **Forbidden in target** (currently ✅ in violation)
- `testing` → `core`: ❌ **Forbidden in target** (currently ok but should stay lean)

---

## 3. Package Responsibility Charter

### @ngcompass/common (Foundation)

**Owns:**
- All TypeScript interfaces shared across packages (`AnalyzerConfig`, `NormalizedAnalyzerConfig`, `PluginManifest`, `TelemetryConfig`)
- `RuleFailure`, `RuleResult`, `RuleSeverity` — result-domain types (migrate from `core`)
- Error taxonomy (`AnalyzerError` hierarchy, `InfrastructureError`)
- `Result<T,E>` / `Ok` / `Err` functional error type
- Constants (`PACKAGE_VERSION`, `CACHE_VERSION`, `DEFAULT_INCLUDE_PATTERNS`, `SUPPORTED_ANGULAR_VERSIONS`)
- Logger (`Logger`, `KNOWN_NAMESPACES`, debug/warn/info/error)
- AST position utilities (`createPosition`, `normalizePath`) — **currently missing from exports**

**Must NOT own:**
- Implementation logic (parsing, caching, rule execution)
- External dependencies beyond `typescript` (peer) and basic Node.js built-ins

---

### @ngcompass/core (Engine)

**Owns:**
- File scanner (`scan`, `ScanResult`)
- Multi-tier cache system (`createCacheContext`, `getCacheContext`, `resetGlobalCache`, all driver + service types)
- Config loading, validation, plugin loading (`resolveConfig`, `validateConfig`, `initConfig`, `loadPlugins`)
- AST parsing (`parseTypeScript`, `parseTemplate`, `parseCss`)
- Execution planner (`buildExecutionPlan`, `ExecutionPlan`)
- Analysis engine + orchestrator (`runAnalysis`, `AnalysisResult`)
- Rule registry (`getGlobalRegistry`, `registerAllBuiltinRules` — explicit, not side-effect)

**Must NOT own:**
- Rule implementations (migrate to `@ngcompass/rules`)
- CLI-specific logic
- Output formatting

---

### @ngcompass/rules (Rule Implementations)

**Owns:**
- All built-in rule implementations (currently `core/src/rules/migration/`)
- Rule categories: migration, performance, SSR, accessibility, security
- Default rule presets (`recommended`, `strict`, `ssr-safe`)

**Must NOT own:**
- Engine infrastructure (parsing, caching)
- CLI or reporter logic

**Migration path:** Move `core/src/rules/migration/*.rule.ts` → `rules/src/rules/migration/*.rule.ts`, keeping `core` as the engine host.

---

### @ngcompass/reporters (Output)

**Owns:**
- Console reporter (rich + compact)
- JSON reporter
- SARIF reporter (future)
- Config/init reporter
- Code frame rendering
- `Reporter` interface

**Must NOT own:**
- Analysis engine logic
- Rule implementations

**Key constraint:** Must only import `@ngcompass/common` (not `@ngcompass/core`). `RuleFailure`/`RuleResult` must be in `common`.

---

### @ngcompass/testing (Test Utilities)

**Owns:**
- `createTestRule()` — convenience factory for unit testing rule implementations
- `createMockCacheContext()` — in-memory cache context for tests
- `createMockAnalyzerConfig()` — default config builder
- `RuleTestHarness` — runs a single rule against a synthetic file and returns violations

**Must NOT own:**
- Production analysis engine
- Real parsers (use stubbed/synthetic ASTs in tests)

---

### @ngcompass/cli (Delivery)

**Owns:**
- Command registration (`analyze`, `init`, `cache`, `config`, `rules list`)
- Pipeline orchestration (step functions, exit code management)
- `registerAllBuiltinRules()` call at startup
- User-facing option parsing

**Must NOT own:**
- Business logic (delegate to `core`)
- Output formatting (delegate to `reporters`)

---

## 4. Public API Rules

### Rule 1: `exports` Map Required

Every package must declare an `exports` field mapping `.` to `dist/`:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

Sub-path exports are permitted for worker threads and optional entry points but must be explicitly declared.

### Rule 2: No `src/` imports across packages

```typescript
// Forbidden:
import { something } from '@ngcompass/core/src/cache/context';
import { something } from '../../core/src/cache/context';
```

```typescript
// Required:
import { something } from '@ngcompass/core';
```

Enforced by `eslint-plugin-import` `no-restricted-imports` and `no-internal-modules` rules.

### Rule 3: `sideEffects` Must Be Declared

All packages must declare `"sideEffects": false` or an explicit array of side-effectful files. Pure re-export barrels must be `false`.

### Rule 4: No Barrel Leakage

`src/index.ts` must only re-export symbols that form the package's **intended public API**. Internal utilities used only within the package must not appear in `index.ts`. Use explicit named exports rather than `export *` where possible.

### Rule 5: Peer Dependencies for Host Tooling

`typescript`, and any Angular-specific packages (when added), must be declared as `peerDependencies` with a version range. They must appear in both `peerDependencies` and `devDependencies` (the dev entry for local testing; the peer entry communicates the requirement to consumers).

---

## 5. Enforcement Tooling

### 5.1 ESLint Boundary Enforcement

Add `eslint-plugin-boundaries` to the root ESLint config:

```javascript
// .eslintrc.cjs additions
plugins: ['boundaries'],
settings: {
    'boundaries/elements': [
        { type: 'common', pattern: 'packages/common/src/*' },
        { type: 'core', pattern: 'packages/core/src/*' },
        { type: 'reporters', pattern: 'packages/reporters/src/*' },
        { type: 'rules', pattern: 'packages/rules/src/*' },
        { type: 'testing', pattern: 'packages/testing/src/*' },
        { type: 'cli', pattern: 'packages/cli/src/*' },
    ]
},
rules: {
    'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
            { from: 'core',      allow: ['common'] },
            { from: 'reporters', allow: ['common'] },          // NOT core
            { from: 'rules',     allow: ['common', 'core'] },
            { from: 'testing',   allow: ['common'] },
            { from: 'cli',       allow: ['common', 'core', 'reporters', 'rules'] },
        ]
    }]
}
```

### 5.2 Circular Dependency Detection

Add `madge` or `dpdm` CI check:

```yaml
# .github/workflows/ci.yml (new step)
- name: Check circular dependencies
  run: pnpm exec madge --circular --extensions ts packages/*/src/index.ts
```

This catches circular imports that `eslint-plugin-boundaries` does not (since boundaries checks cross-package, madge catches within-package cycles).

### 5.3 No Deep Imports Rule

```javascript
// .eslintrc.cjs
rules: {
    'no-restricted-imports': ['error', {
        patterns: [
            '@ngcompass/*/src/*',   // no deep src imports
            '@ngcompass/*/dist/*',  // no direct dist imports
        ]
    }]
}
```

### 5.4 No `require()` in Source

```javascript
'@typescript-eslint/no-require-imports': 'error',
```

Allow only in config files and scripts that are explicitly CJS.

### 5.5 Turbo + Remote Cache

```yaml
# CI workflow
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

Configure a Turbo remote cache endpoint (Vercel or self-hosted) to enable cross-run caching in CI.

### 5.6 Bundle Size Budget

Add `bundlewatch` or `size-limit`:

```json
// package.json (root)
{
  "size-limit": [
    { "path": "packages/core/dist/index.js", "limit": "300 KB" },
    { "path": "packages/reporters/dist/index.js", "limit": "50 KB" },
    { "path": "packages/common/dist/index.js", "limit": "20 KB" }
  ]
}
```

Run in CI:
```yaml
- run: pnpm exec size-limit
```

### 5.7 Dependency Audit Gate

```yaml
# CI workflow
- name: Security audit
  run: pnpm audit --audit-level moderate
  continue-on-error: false
```

---

## 6. Phased Migration Plan

### Phase 0: Quick Wins (1 week, zero risk)

These changes fix active breakage and clean up noise without touching architecture.

| # | Action | Ticket |
|---|--------|--------|
| P0.1 | Fix `ci.yml` branch trigger (`master` → `main`) | BLD-01 |
| P0.2 | Fix `test.yml` pnpm version (`8` → `packageManager` auto) | BLD-02 |
| P0.3 | Create `scripts/check-coverage.js` or remove broken step | BLD-03 |
| P0.4 | Remove `chalk`, `ora` from `@ngcompass/cli` deps | DEP-01, DEP-02 |
| P0.5 | Remove `jest`, `ts-jest`, `@types/jest` from `@ngcompass/common` devDeps | DEP-03 (via DG-R3) |
| P0.6 | Remove stale include paths from `core` and `rules` tsconfigs | BLD-06 |
| P0.7 | Export `createPosition` / `normalizePath` from `@ngcompass/common` | BV-05 |
| P0.8 | Standardize test file extensions to `.test.ts` | BLD-08 |

**Definition of Done for Phase 0:**
- All CI checks pass on `main`
- `pnpm install` runs clean with pnpm@10
- Zero stale paths in any tsconfig
- `createPosition` importable from `@ngcompass/common`

---

### Phase 1: Boundary Stabilisation (2–3 weeks)

Establish the correct boundaries without yet restructuring packages.

| # | Action | Ticket |
|---|--------|--------|
| P1.1 | Move `RuleFailure`, `RuleResult`, `RuleSeverity` from `core` → `common` | ARC-01 |
| P1.2 | Remove `@ngcompass/core` from `reporters` production deps | ARC-02 |
| P1.3 | Remove explicit `register-all.js` side-effect from `core/index.ts`; export `registerAllBuiltinRules()` | ARC-03 |
| P1.4 | Call `registerAllBuiltinRules()` explicitly in `cli/src/bin/ngcompass.ts` | ARC-03 |
| P1.5 | Add `"sideEffects": false` to all packages | DEP-09 |
| P1.6 | Add `eslint-plugin-boundaries` with warn-mode rules | ARC-04 |
| P1.7 | Add `no-restricted-imports` for `@ngcompass/*/src/*` patterns | ARC-04 |
| P1.8 | Move `typescript` to `peerDependencies` in both `common` and `core` | DEP-04, DEP-05 |
| P1.9 | Consolidate CI into single workflow with Turbo | BLD-04, BLD-05 |

**Definition of Done for Phase 1:**
- `reporters` builds with zero `@ngcompass/core` imports
- `eslint-plugin-boundaries` running in warn mode with zero new violations
- `sideEffects: false` declared on all packages
- `typescript` in peerDependencies (not production)
- Single unified CI workflow running via Turbo on `main`

---

### Phase 2: rules Package Population (3–4 weeks)

Move rule implementations from `core` to `rules`. This is the most impactful structural change.

| # | Action | Ticket |
|---|--------|--------|
| P2.1 | Move `core/src/rules/migration/*.rule.ts` → `rules/src/rules/migration/*.rule.ts` | ARC-05 |
| P2.2 | Keep `core/src/rules/registry/` in `core` — `rules` imports from core to register | ARC-05 |
| P2.3 | Update `core/src/rules/register-all.ts` to import rules from `@ngcompass/rules` | ARC-05 |
| P2.4 | Export proper rule set and preset from `@ngcompass/rules/src/index.ts` | ARC-05 |
| P2.5 | Populate `@ngcompass/testing` with `createTestRule`, `RuleTestHarness`, `createMockCacheContext` | ARC-06 |
| P2.6 | Migrate rule unit tests from `core/tests/rules/` to `rules/tests/` using `@ngcompass/testing` | ARC-06 |
| P2.7 | Implement `pnpm catalog:` for shared tooling versions | DEP-07 |
| P2.8 | Enable `eslint-plugin-boundaries` in **error** mode | ARC-04 |

**Definition of Done for Phase 2:**
- `@ngcompass/core/src/rules/migration/` is empty (rules in `@ngcompass/rules`)
- `@ngcompass/rules/src/index.ts` exports 19+ rule implementations and preset configs
- `@ngcompass/testing/src/index.ts` exports `createTestRule`, `RuleTestHarness`, `createMockCacheContext`
- Coverage ≥ 90% lines across all non-stub packages
- Boundary violations in ESLint: 0 errors

---

### Phase 3: Engine Sub-Package Extraction (optional, 4–6 weeks)

Extract the config subsystem and types into dedicated packages for cleaner separation and plugin-author ergonomics. Only pursue if the god-package concern remains after Phase 2.

| # | Action |
|---|--------|
| P3.1 | Create `@ngcompass/config` — move `core/src/config/` into it |
| P3.2 | `@ngcompass/core` depends on `@ngcompass/config` for config loading |
| P3.3 | Create `@ngcompass/types` — move `common/src/interfaces.ts` for plugin-author type distribution |
| P3.4 | Enable TypeScript project references (`composite: true` in all packages, `references` arrays) |
| P3.5 | Add sub-path exports to `core` for `core/cache`, `core/scanner`, `core/parsers` |

---

## 7. CI/CD Target State

### Target CI Workflow (single `ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18.x, 20.x, 22.x]

    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }

      - uses: pnpm/action-setup@v4    # reads packageManager from package.json

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Lint, Typecheck, Test, Build (via Turbo)
        run: pnpm exec turbo lint typecheck test build --concurrency=4

      - name: Security audit
        run: pnpm audit --audit-level moderate

      - name: Upload coverage
        if: matrix.node == '20.x'
        uses: codecov/codecov-action@v4
        with:
          files: coverage/lcov.info
```

### Release Workflow (unchanged pattern, improved)

```yaml
name: Release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec turbo build:prod
      - uses: changesets/action@v1
        with: { publish: "pnpm release" }
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}", NPM_TOKEN: "${{ secrets.NPM_TOKEN }}" }
```

---

*Detailed tickets for each phase item are in `ARCH_AUDIT.md`.*
