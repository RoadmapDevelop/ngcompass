# ngcompass — Dependency Governance Plan

> **Date:** 2026-02-28 (updated after remediation pass)
> **Scope:** All `packages/*` production + dev dependencies
> **Methodology:** package.json cross-reference, duplicate detection, usage analysis

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Approved Libraries by Category](#2-approved-libraries-by-category)
3. [Redundant / Unused Dependencies](#3-redundant--unused-dependencies)
4. [Version Alignment Audit](#4-version-alignment-audit)
5. [Dependency Model Issues](#5-dependency-model-issues)
6. [Risk Registry](#6-risk-registry)
7. [Version Alignment Strategy](#7-version-alignment-strategy)
8. [Remediation Backlog](#8-remediation-backlog)

---

## 1. Executive Summary

The monorepo's dependency landscape is **relatively lean** for a TypeScript static analysis tool — no lodash, moment, or rxjs. The initial risks and their current status:

| Category | Initial Count | Remaining | Status |
|----------|--------------|-----------|--------|
| Redundant/unused packages | 5 | **1** | 🟡 One open (DG-R4) |
| Wrong dependency type (prod vs peer vs dev) | 3 | **0** | ✅ All resolved |
| Version divergence across workspace | 3 pairs | **0** | ✅ All resolved via `catalog:` |
| Missing declarations (undeclared peer) | 1 | **0** | ✅ Resolved |
| CI tooling version mismatch | 1 | 1 | 🔴 Still open (see `build-quality-report.md`) |
| Missing `sideEffects` field | 6 packages | 6 | 🟠 Still open (blocked by BV-03) |

---

## 2. Approved Libraries by Category

### Parsing

| Category | Approved | Current | Notes |
|----------|----------|---------|-------|
| TypeScript AST | `typescript` | `peerDep >=4.7.0` | ✅ Peer dep — matches user's TS version |
| HTML parser | `angular-html-parser` | `^10.4.0` | ✅ Appropriate for Angular HTML |
| CSS/SCSS parser | `lightningcss` | `^1.31.1` | ✅ Fast, Rust-based |
| JS/TS fast parser | `oxc-parser` | `^0.112.0` | ✅ Excellent performance |
| Module resolver | `oxc-resolver` | `^11.17.0` | ✅ Companion to oxc-parser |

### File System

| Category | Approved | Current | Notes |
|----------|----------|---------|-------|
| Glob | `tinyglobby` | `^0.2.15` | ✅ Modern, fast |
| Glob matching | `minimatch` | `^10.1.1` | ✅ Widely used |
| .gitignore | `ignore` | `^7.0.3` | ✅ Standard |
| Atomic writes | `write-file-atomic` | `^7.0.0` | ✅ Prevents partial writes |

### Caching

| Category | Approved | Current | Notes |
|----------|----------|---------|-------|
| Disk cache | `cacache` | `^20.0.3` | ✅ npm's own disk cache |
| Memory cache (LRU) | `lru-cache` | `^11.2.5` | ✅ Industry standard |
| Hashing | `xxhash-wasm` | `^1.1.0` | ✅ Fast WASM hash; see note |

> **Note on `xxhash-wasm`:** Carries a WASM binary (~80KB). Acceptable for a CLI tool; would be a concern for a browser/edge deployment. If a non-WASM alternative is needed in future, `xxhashjs` or `farmhash` could replace it.

### Configuration Loading

| Category | Approved | Current | Notes |
|----------|----------|---------|-------|
| Config file discovery | `lilconfig` | `^3.1.3` | ✅ Lightweight, supports JS/JSON configs |
| Config merging | `defu` | `^6.1.4` | ✅ Deep-merge utility |
| Schema validation | `zod` | `^4.3.6` | ✅ |
| Schema error formatting | `zod-validation-error` | `^5.0.0` | ✅ |
| Schema error formatting (redundant) | `zod-error` | `^2.0.0` | ⚠️ **Audit needed** — see DG-R4 |

> **Note on `zod-error@^2.0.0`:** Both `zod-error` and `zod-validation-error` serve overlapping purposes. Audit actual usage in `core/src/` and remove whichever is not imported (DG-R4 open).

### Dynamic Import

| Category | Approved | Current | Notes |
|----------|----------|---------|-------|
| Dynamic require in ESM | `jiti` | `^2.6.1` | ✅ Used for loading `.js` config files at runtime |

### Concurrency

| Category | Approved | Current | Notes |
|----------|----------|---------|-------|
| Concurrency limiter | `p-limit` | `^7.3.0` | ✅ Standard |

### CLI UX

| Category | Approved | Current | Notes |
|----------|----------|---------|-------|
| CLI framework | `commander` | `^11.0.0` | ✅ Widely used |
| Colors | `picocolors` | `^1.1.1` | ✅ Minimal, fast |
| ~~Colors (redundant)~~ | ~~`chalk`~~ | ~~`^5.0.0`~~ | ✅ **Removed** (DG-R1) |
| ~~Spinner~~ | ~~`ora`~~ | ~~`^7.0.0`~~ | ✅ **Removed** (DG-R2) |

### Output Formatting

| Category | Approved | Current | Notes |
|----------|----------|---------|-------|
| Code frame | `@babel/code-frame` | `^7.29.0` | ✅ Industry standard for source context |

---

## 3. Redundant / Unused Dependencies

### ~~DG-R1: `chalk@^5.0.0` in `@ngcompass/cli` — Unused~~ ✅ Fixed

| Field | Detail |
|-------|--------|
| **Package** | `@ngcompass/cli` |
| **Resolution** | `chalk` removed from `packages/cli/package.json` dependencies. |

### ~~DG-R2: `ora@^7.0.0` in `@ngcompass/cli` — Unused~~ ✅ Fixed

| Field | Detail |
|-------|--------|
| **Package** | `@ngcompass/cli` |
| **Resolution** | `ora` removed from `packages/cli/package.json` dependencies. |

### ~~DG-R3: `jest@^30.2.0`, `ts-jest@^29.4.6`, `@types/jest@^30.0.0` in `@ngcompass/common` — Wrong Test Framework~~ ✅ Fixed

| Field | Detail |
|-------|--------|
| **Package** | `@ngcompass/common` |
| **Resolution** | All three packages removed from `packages/common/package.json` devDependencies. The entire `devDependencies` block is now `{ "@types/node", "typescript": "catalog:" }` only. |

### DG-R4: `zod-error@^2.0.0` in `@ngcompass/core` — Potentially Redundant ⚠️ OPEN

| Field | Detail |
|-------|--------|
| **Package** | `@ngcompass/core` |
| **Location** | `dependencies` |
| **Issue** | Both `zod-error` and `zod-validation-error` are installed. They serve overlapping purposes (formatting Zod schema validation errors). One is likely unused. |
| **Action** | Audit `core/src/` for `import ... from 'zod-error'` vs `'zod-validation-error'`. Remove whichever is not used. |
| **Risk** | Low — purely output-formatting utilities |

### ~~DG-R5: `eslint`, `rimraf`, `tsup` in `@ngcompass/common` devDependencies — Duplicated at Root~~ ✅ Fixed

| Field | Detail |
|-------|--------|
| **Package** | `@ngcompass/common` |
| **Resolution** | `eslint`, `rimraf`, `tsup`, `typescript` removed from `packages/common/package.json` devDependencies. All are now inherited from root hoisted dependencies. `typescript` uses `catalog:` in devDependencies of all packages. |

---

## 4. Version Alignment Audit

### Cross-package version ranges (current state after remediation)

| Package | Declared in | Range / Protocol | Status |
|---------|-------------|-----------------|--------|
| `typescript` | `pnpm-workspace.yaml` catalog | `^5.9.3` | ✅ Single source |
| `typescript` | All packages devDeps | `catalog:` | ✅ All aligned |
| `typescript` | `@ngcompass/common` + `@ngcompass/core` peerDeps | `>=4.7.0` | ✅ Peer correctly declared |
| `eslint` | `pnpm-workspace.yaml` catalog | `^8.57.1` | ✅ Single source |
| `tsup` | `pnpm-workspace.yaml` catalog | `^8.5.1` | ✅ Single source |
| `rimraf` | `pnpm-workspace.yaml` catalog | `^6.1.2` | ✅ Single source |
| `vitest` | `pnpm-workspace.yaml` catalog | `^4.0.18` | ✅ Single source |
| `@types/node` | `pnpm-workspace.yaml` catalog | `^25.1.0` | ✅ Single source |
| `jest` | ~~`@ngcompass/common` devDeps~~ | — | ✅ Removed |

**Conclusion:** All version divergence eliminated. The `pnpm catalog:` protocol is in place for all shared build/test tooling. Zero manual version reconciliation required on future upgrades — one change in `pnpm-workspace.yaml` propagates everywhere.

---

## 5. Dependency Model Issues

### ~~DG-M1: `typescript` Should Be a Peer Dependency of `@ngcompass/core`~~ ✅ Fixed

| Field | Detail |
|-------|--------|
| **Previous** | `@ngcompass/core` `dependencies: { "typescript": "^5.9.3" }` |
| **Resolution** | `typescript` moved out of `dependencies`. `peerDependencies: { "typescript": ">=4.7.0" }` added. `devDependencies: { "typescript": "catalog:" }` retained for local builds. |

```json
// packages/core/package.json — current state
{
    "peerDependencies": { "typescript": ">=4.7.0" },
    "devDependencies": { "typescript": "catalog:" }
}
```

### ~~DG-M2: `typescript` Not Declared in `@ngcompass/common` Production Dependencies~~ ✅ Fixed

| Field | Detail |
|-------|--------|
| **Previous** | `typescript` only in `common` devDependencies — runtime `MODULE_NOT_FOUND` for plugin authors installing `@ngcompass/common` alone. |
| **Resolution** | `peerDependencies: { "typescript": ">=4.7.0" }` added to `packages/common/package.json`. `devDependencies` now uses `catalog:`. |

```json
// packages/common/package.json — current state
{
    "peerDependencies": { "typescript": ">=4.7.0" },
    "devDependencies": { "@types/node": "^25.1.0", "typescript": "catalog:" }
}
```

### ~~DG-M3: Build Tooling Duplicated Per-Package Instead of Inherited from Root~~ ✅ Fixed

| Field | Detail |
|-------|--------|
| **Previous** | `tsup`, `typescript`, `eslint`, `rimraf` in both root devDependencies AND `@ngcompass/common` devDependencies. |
| **Resolution** | All per-package duplicates removed from `common`. All packages that still declare `typescript` in devDependencies use `catalog:` — the version is defined once in `pnpm-workspace.yaml`. |

---

## 6. Risk Registry

| ID | Package | Risk | Severity | Status |
|----|---------|------|----------|--------|
| ~~DG-R1~~ | ~~cli~~ | ~~`chalk` unused in prod deps~~ | ~~🟠 Medium~~ | ✅ Fixed |
| ~~DG-R2~~ | ~~cli~~ | ~~`ora` unused in prod deps~~ | ~~🟠 Medium~~ | ✅ Fixed |
| ~~DG-R3~~ | ~~common~~ | ~~`jest`/`ts-jest`/`@types/jest` wrong framework~~ | ~~🟠 Medium~~ | ✅ Fixed |
| DG-R4 | core | `zod-error` possibly redundant with `zod-validation-error` | 🟡 Low | ⚠️ Open — audit needed |
| ~~DG-R5~~ | ~~common~~ | ~~Build tools duplicated from root~~ | ~~🟡 Low~~ | ✅ Fixed |
| ~~DG-M1~~ | ~~core~~ | ~~`typescript` in prod deps, should be peer~~ | ~~🟠 Medium~~ | ✅ Fixed |
| ~~DG-M2~~ | ~~common~~ | ~~`typescript` undeclared runtime dependency~~ | ~~🔴 High~~ | ✅ Fixed |
| ~~DG-M3~~ | ~~workspace~~ | ~~Build tool version management split~~ | ~~🟡 Low~~ | ✅ Fixed |

**Open risks: 1** (DG-R4 — low severity, audit only)

---

## 7. Version Alignment Strategy

### pnpm Catalog (implemented ✅)

`pnpm catalog:` is live in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'

catalog:
  typescript: ^5.9.3
  tsup: ^8.5.1
  eslint: ^8.57.1
  rimraf: ^6.1.2
  '@types/node': ^25.1.0
  vitest: ^4.0.18
```

Per-package `package.json` devDependencies now use:
```json
{ "devDependencies": { "typescript": "catalog:" } }
```

To upgrade TypeScript across all packages: edit one line in `pnpm-workspace.yaml` and run `pnpm install`.

### pnpm Overrides (for transitive conflicts)

If a transitive dep pulls in a conflicting version, add to root `package.json`:
```json
{
  "pnpm": {
    "overrides": {
      "semver": "^7.6.0"
    }
  }
}
```

Currently no overrides are needed, but this field should be documented and reserved for future use.

### Peer Dependency Policy

```
Rule: Any library that the consuming project is expected to already have (TypeScript, Angular)
      must be declared as peerDependencies, not dependencies.

Rule: devDependencies for build/test tooling (tsup, vitest, eslint) should be in the
      workspace root only, not per-package, unless a package needs a materially different
      configuration.

Rule: Production dependencies must be audited quarterly for:
      - unmaintained status (no commit > 2 years)
      - known CVEs (via pnpm audit or Dependabot)
      - availability of a lighter-weight alternative
```

---

## 8. Remediation Backlog

| Ticket | Action | Effort | Priority | Status |
|--------|--------|--------|----------|--------|
| ~~DEP-01~~ | ~~Remove `chalk` and `ora` from `@ngcompass/cli` dependencies~~ | ~~15 min~~ | ~~🟠 Quick Win~~ | ✅ Done |
| ~~DEP-02~~ | ~~Remove `jest`, `ts-jest`, `@types/jest` from `@ngcompass/common` devDependencies~~ | ~~15 min~~ | ~~🟠 Quick Win~~ | ✅ Done |
| ~~DEP-03~~ | ~~Remove `eslint`, `rimraf`, `tsup` from `@ngcompass/common` devDependencies~~ | ~~15 min~~ | ~~🟡 Clean-up~~ | ✅ Done |
| ~~DEP-04~~ | ~~Move `typescript` from `@ngcompass/core` `dependencies` → `peerDependencies`~~ | ~~1 hr~~ | ~~🟠 Medium~~ | ✅ Done |
| ~~DEP-05~~ | ~~Add `typescript` to `@ngcompass/common` `peerDependencies`~~ | ~~30 min~~ | ~~🔴 High (runtime risk)~~ | ✅ Done |
| DEP-06 | Audit `zod-error` vs `zod-validation-error` usage; remove the unused one | 30 min | 🟡 Clean-up | ⚠️ Open |
| ~~DEP-07~~ | ~~Implement `pnpm catalog:` for shared tooling versions~~ | ~~1 hr~~ | ~~🟠 Medium~~ | ✅ Done |
| DEP-08 | Add `pnpm audit` step to CI with vulnerability threshold | 1 hr | 🟠 Medium | ⚠️ Open |
| DEP-09 | Add `"sideEffects": false` to all packages (after BV-03 is fixed) | 30 min | 🟠 Medium | ⚠️ Open — blocked by BV-03 |
| DEP-10 | Add `fast-check` usage (currently installed, unused in tests) or remove | 1 hr | 🟡 Low | ⚠️ Open |

**Progress: 7 / 10 tickets complete (70%)**

---

*See `boundary-violations.md` for the `typescript` peer dependency architectural context, and `build-quality-report.md` for CI pnpm version issues.*
