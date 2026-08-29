# Baseline / Gradual Adoption — Design Spec

Status: implemented
Branch: `feat/baseline`

Four things changed during implementation; they are reflected below and listed in §15.

## Problem

Running ngcompass on an existing Angular codebase produces thousands of violations on day one. Teams respond by disabling rules or dropping the tool. A baseline lets a team adopt strict rules immediately by recording existing debt and failing CI only on newly introduced violations.

## Goals

- Adopting ngcompass on a legacy codebase is a single command and CI is green the same day.
- Any violation not present at adoption time fails CI.
- Cleaning up code never fails the build.
- Zero impact on analysis performance and zero cache invalidation.

## Non-goals

- Per-violation suppression comments. That is a separate feature (`ngcompass-disable`).
- Tracking *which* specific violation was suppressed across refactors. See "Known limitation: which failure is reported".
- Automatic baseline regeneration during `analyze`.

---

## 1. Core model

A baseline records, for each `(file, rule)` pair, **how many violations existed at adoption time**.

> `src/app/user.component.ts` is allowed 3 outstanding `rxjs-no-subscribe-in-component` failures.

Find 3 → silence. Find 4 → the excess is new, CI fails. Find 1 → progress, report it as stale.

Counts are **severity-agnostic**. Severity is a config concern that changes independently of code (and `--rule` forces `error`); storing it would corrupt merges.

### Why counts instead of positions

Storing `(file, line, column, message)` breaks on the first inserted import — every violation below the insertion point reads as new. Counts are immune to line shifts, reformatting, and rename-of-locals.

The accepted trade: fixing one violation and introducing another of the same rule in the same file is not detected. This is the same trade ESLint's suppressions file and PHPStan's baseline make, and it is worth it — a baseline that goes stale on reformat trains people to regenerate it reflexively, which defeats the feature.

The design keeps a `mode` seam so a fingerprint strategy can be added later without touching call sites. Ship `count` only.

---

## 2. File format

Default location: `.ngcompass/baseline.json`, committed to git.

```json
{
  "version": 1,
  "entries": {
    "src/app/features/user/user.component.ts": {
      "rxjs-no-subscribe-in-component": 3,
      "prefer-signals": 1
    },
    "src/app/shared/table.component.ts": {
      "no-any-in-template": 2
    }
  }
}
```

Invariants, all enforced by the serializer:

| Invariant | Reason |
| --- | --- |
| Paths are relative to the config root and POSIX-normalized (`/`) | Failures carry absolute paths; an absolute baseline is useless across CI and mixed Windows/macOS teams |
| File keys and rule keys are sorted; two-space indent; trailing newline | This file *will* be edited by two people in the same week — deterministic order makes merge conflicts resolvable |
| No timestamps, tool version, commit SHA, or machine metadata | Anything that churns on regeneration turns every update into an unreviewable diff |
| A count of `0` is never written — the entry is removed | Zero-entries accumulate as dead weight |

`version` gates format migrations. An unknown version is a hard error, not a silent rebuild — a baseline written by a newer ngcompass must not be interpreted loosely by an older one.

---

## 3. Architecture

### Placement

The baseline is a **post-analysis filter on results**, applied between the engine and the reporters.

```
resolveConfig → scan → resolveRules → buildExecutionPlan → runAnalysis
                                                              ↓
                                                    [ applyBaseline ]
                                                              ↓
                                                   recalculateStats
                                                              ↓
                                              reporters → shouldFailAnalysis
```

This placement is the load-bearing decision:

- **No cache invalidation.** Task IDs are content-addressed from file hashes + rule options. If the baseline influenced rule execution, every baseline edit would invalidate the result cache. Filtering afterwards means the baseline is free. **No `CACHE_SCHEMA_VERSION` or `PLAN_CACHE_VERSION` bump is required by this feature.**
- **The engine and rules stay unaware of it.** Nothing in `@ngcompass/engine`, `@ngcompass/rules`, or `@ngcompass/planner` changes.
- **`plan.precomputedAnalysis` still works.** A full analysis-cache hit returns raw results, which the filter then processes normally.

Consequence: stats must be **recomputed** from the filtered results before `shouldFailAnalysis` runs, otherwise CI fails on counts that include violations we just hid. `calculateStats` in `packages/engine/src/analysis/analysis-stats.ts` derives everything from `results`, so re-running it over the filtered set is sufficient — never hand-adjust counters.

### Package

New package `@ngcompass/baseline`, sitting at the same layer as `reporters`.

Rationale: reporters are forbidden from reading the filesystem, and `cli` is orchestration only. A standalone package also lets the planned VS Code extension read the baseline directly to grey out suppressed findings, rather than shelling out to the CLI.

Cost: an 11th package in the version-sync and `validate:packages` set. If that cost is not acceptable during beta, `packages/cli/src/baseline/` is a clean fallback — the public surface is four functions and extraction later is mechanical.

Layering:

```
cli
 ↓
config / scanner / planner / engine / reporters / baseline
 ↓
rules / cache / ast
 ↓
common
```

`baseline` imports only `@ngcompass/common`. It must never import `planner`, `engine`, or `cli`.

**Exported-function style:** `export function fn()`, matching its layer peers (`config`, `engine`, `reporters`). Add the row to the style table in `CLAUDE.md`.

### Layout

```
packages/baseline/src/
  index.ts
  serialization/
    read.ts            loadBaseline
    write.ts           saveBaseline
    format.ts          serialize / parse / version guard
  matching/
    apply.ts           applyBaseline
    reconcile.ts       rename reconciliation
    merge.ts           mergeIntoBaseline
  models/
    index.ts
    baseline-file.ts
    baseline-scope.ts
    baseline-outcome.ts
```

---

## 4. Types

In `@ngcompass/common` (`packages/common/src/models/baseline.ts`), because both `baseline` and `reporters` need to name them:

```ts
export interface BaselineFile {
  readonly version: number;
  readonly entries: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface BaselineConfig {
  readonly enabled: boolean;
  readonly path: string;
  readonly onStale: 'ignore' | 'warn' | 'error';
}
```

In `@ngcompass/baseline/models`:

```ts
export interface BaselineScope {
  readonly files: ReadonlySet<string>;
  readonly rules: ReadonlySet<string>;
}

export interface StaleEntry {
  readonly filePath: string;
  readonly ruleName: string;
  readonly recorded: number;
  readonly found: number;
}

export interface RenameMatch {
  readonly from: string;
  readonly to: string;
}

export interface BaselineOutcome {
  readonly results: ReadonlyArray<RuleResult>;
  readonly suppressedCount: number;
  readonly staleEntries: ReadonlyArray<StaleEntry>;
  readonly renamed: ReadonlyArray<RenameMatch>;
  readonly unmatchedFiles: ReadonlyArray<string>;
  readonly ambiguousRenames: ReadonlyArray<string>;
}

export type BaselineError =
  | { readonly kind: 'BaselineNotFound'; readonly path: string }
  | { readonly kind: 'BaselineUnreadable'; readonly path: string; readonly cause: string }
  | { readonly kind: 'BaselineMalformed'; readonly path: string; readonly detail: string }
  | { readonly kind: 'BaselineVersionUnsupported'; readonly path: string; readonly found: number; readonly supported: number }
  | { readonly kind: 'BaselineWriteFailed'; readonly path: string; readonly cause: string };
```

Errors flow as `Result<T, BaselineError>` per project convention. Nothing in this package throws.

---

## 5. Public API

```ts
export function loadBaseline(
  baselinePath: string,
  rootDir: string
): Promise<Result<BaselineFile, BaselineError>>;

export function saveBaseline(
  baseline: BaselineFile,
  baselinePath: string,
  rootDir: string
): Promise<Result<void, BaselineError>>;

export function applyBaseline(
  results: ReadonlyArray<RuleResult>,
  baseline: BaselineFile,
  scope: BaselineScope,
  rootDir: string
): BaselineOutcome;

export function mergeIntoBaseline(
  existing: BaselineFile,
  results: ReadonlyArray<RuleResult>,
  scope: BaselineScope,
  rootDir: string
): BaselineFile;
```

`applyBaseline` and `mergeIntoBaseline` are pure and synchronous. All I/O is in `serialization/`.

---

## 6. Algorithms

### 6.1 `applyBaseline`

```
1. Reconcile renames (6.3) → effective entry map keyed by current paths
2. Group failures by (relativePath, ruleName)
3. For each group:
     allowed = entries[relPath]?[ruleName] ?? 0
     sort failures by (line, column, message)      ← deterministic
     suppress the first `allowed`, report the remainder
4. For each entry with allowed > found:
     record a StaleEntry
5. Rebuild RuleResult[] preserving ruleName and taskId, dropping
   rule results whose failure list became empty
```

Sorting is required: without a total order the same code produces different reported failures across runs, and the console output flickers.

### 6.2 `mergeIntoBaseline` — scope-derived merge

The execution plan is the exact scope of a run. `Task` carries `taskId`, `ruleName`, and `filePath`, so `plan.tasks ∪ plan.skippedTasks` yields every `(file, rule)` pair the run covered.

```
scope.files = every task.filePath
scope.rules = every task.ruleName

for each (file, rule) in scope.files × scope.rules:
    count = failures found for that pair
    count > 0 → set entries[file][rule] = count
    count = 0 → delete entries[file][rule]

every entry outside the scope: left untouched
```

This makes narrowed runs safe by construction rather than by refusal:

- `--rule prefer-signals` narrows `scope.rules`; other rules' entries survive.
- `--profile x` narrows `scope.files`; files outside the profile survive.

It also enables the workflow teams actually want — adopting one new rule at a time against a legacy codebase:

```bash
ngcompass baseline update --rule prefer-signals
```

A scoped update must **never delete** an out-of-scope entry, because "file not scanned" and "file deleted" are indistinguishable from inside a narrowed run. Removing orphans is `prune`'s job, and `prune` always runs unscoped.

When a scoped update leaves entries untouched, say so:

```
4 files in the baseline weren't scanned in this run — their entries were kept.
```

### 6.3 Rename reconciliation

At load time, some baseline paths will not exist among the scanned files. For each:

```
candidates = scanned files with the same basename that have no baseline entry

exactly one candidate → carry the counts over, record a RenameMatch
two or more           → record in ambiguousRenames, do not guess
zero                  → record in unmatchedFiles (deleted, prunable)
```

This handles the dominant real case — a component moved between folders — with no git dependency and no addition to the file format. It works well for Angular specifically because filenames are long and convention-driven (`user-profile.component.ts`), so basename collisions are rare.

It is a runtime inference, so it must be reported, never silent:

```
1 renamed file matched by name — run 'ngcompass baseline prune' to record it.
```

`prune` writes the new path, converting the inference into a recorded fact.

Git-based detection (`git diff -M`) is a later upgrade if basename matching proves too weak; `packages/scanner/src/discovery/git.ts` already has the spawn plumbing.

### 6.4 Cold-run guarantee for writes

`baseline create`, `baseline update`, and `baseline prune` **always bypass the result cache**, exactly as `--force` does.

This removes an entire class of silent corruption: a baseline can never be written from partially-restored cached results, regardless of how the planner or engine evolves. These commands run a handful of times per repo per year, so correctness beats speed unconditionally.

`analyze` keeps full cache behaviour — it only reads the baseline.

### Known limitation: which failure is reported

When a file exceeds its allowance, the *last* failures in position order are reported, which may not be the literally new one. The message must therefore be explicit about what happened:

```
src/app/user.component.ts:88:5  error  rxjs-no-subscribe-in-component
  This file exceeds its baseline allowance of 3 for this rule (found 4).
```

Documented, not fixed. The fingerprint mode is the eventual answer.

---

## 7. Configuration

`AnalyzerConfig` (`packages/common/src/models/analyzer-config.ts`):

```ts
baseline?: {
  enabled?: boolean;
  path?: string;
  onStale?: 'ignore' | 'warn' | 'error';
};
```

`NormalizedAnalyzerConfig` gets `baseline: BaselineConfig` (fully resolved).

Defaults in `packages/config/src/validation/defaults.ts`:

| Field | Default |
| --- | --- |
| `enabled` | `false` |
| `path` | `.ngcompass/baseline.json` |
| `onStale` | `warn` |

`onStale: 'warn'` is deliberate. Failing the build because someone *fixed* code punishes cleanup and teaches people to avoid touching legacy files. Teams that want a hard ratchet opt into `'error'`.

Zod schema in `packages/config/src/validation/schema.ts`, following the existing `SeveritySchema` pattern.

---

## 8. CLI surface

### `analyze`

| Flag | Behaviour |
| --- | --- |
| `--baseline [path]` | Enable, optionally overriding the configured path |
| `--no-baseline` | Ignore a configured baseline for this run |

No `--update-baseline` flag. That flag is how baselines get silently regenerated inside CI and quietly absorb every regression. Writing is a separate, explicit command.

### `ngcompass baseline`

Registered in `packages/cli/src/commands/baseline.ts`, wired in `packages/cli/src/commands/index.ts`.

| Subcommand | Behaviour |
| --- | --- |
| `create` | Cold full run, write the file. Fails if one exists unless `--force` |
| `update [--rule <id>] [--profile <name>]` | Cold run, scope-derived merge |
| `prune` | Cold unscoped run, lower counts to reality, drop orphans and record renames |
| `show [--top <n>]` | Print what is suppressed, ranked by debt per file |

`create` and `update` print a summary of what changed:

```
Baseline written: .ngcompass/baseline.json
  1,204 errors, 2,643 warnings recorded across 318 files
```

---

## 9. Reporting

`ResultSummary` (`packages/reporters/src/models/result-summary.ts`) gains:

```ts
readonly suppressedByBaseline?: number;
readonly baselineStaleEntries?: number;
```

Console summary when a baseline is active:

```
✖ 4 new problems (2 errors, 2 warnings) · 3,847 hidden by baseline
```

Showing both numbers is the fix for the `maxWarnings` interaction (§10) — nobody has to guess which number the budget applies to.

Stale reporting, per `onStale`:

- `ignore` — nothing
- `warn` — `12 violations fixed since baseline — run 'ngcompass baseline prune'`, exit unaffected
- `error` — same message, exit code 1

JSON and SARIF reporters receive the filtered results unchanged; the counts land in the summary they already serialize. HTML reporter shows the suppressed count in its header.

---

## 10. `maxWarnings` interaction

`maxWarnings` (default 10) counts warnings **after** filtering. That is the correct semantics — the budget should apply to new debt — and it changes nothing for anyone who has not enabled a baseline.

Two mitigations:

1. The summary line always shows both numbers (§9), so the budget is never mysterious.
2. A health check under `packages/config/src/health/checks/` flags the legacy workaround:

> `maxWarnings: 9999` with a baseline enabled — the baseline now absorbs existing warnings. Consider lowering it.

Teams coping with debt today set a huge `maxWarnings`. Once a baseline exists, that setting is dead weight hiding real regressions.

A second health check covers `baseline.enabled: true` with a missing file: fail with a message pointing at `ngcompass baseline create`, rather than silently analyzing with an empty baseline.

---

## 11. Testing

`applyBaseline` and `mergeIntoBaseline` are pure, so most coverage is cheap unit tests. Integration tests use real temp dirs under `os.tmpdir()` per project convention — no mocked fs, no mocked cache.

Unit — `matching/`:

- suppresses exactly the recorded count and reports the excess
- reports nothing when found equals recorded
- records a stale entry when found is below recorded
- reports every failure when a file has no entry
- picks the same reported failure across repeated runs on identical input
- treats warn and error severities identically for counting
- carries counts across a uniquely renamed file
- refuses to guess when two candidates share a basename
- reports a deleted file as unmatched rather than stale

Unit — `merge.ts`:

- a rule-scoped merge leaves other rules' entries untouched
- a file-scoped merge leaves other files' entries untouched
- a pair dropping to zero is removed from the merged file
- an unscoped merge removes an entry for a file that no longer exists

Unit — `serialization/`:

- round-trips a baseline byte-identically
- sorts file and rule keys regardless of input order
- writes POSIX separators when given Windows paths
- rejects an unknown `version` with `BaselineVersionUnsupported`
- rejects malformed JSON with `BaselineMalformed`, not a throw

Integration — `packages/cli`:

- `analyze` on a dirty fixture, `baseline create`, `analyze` again → exit 0
- introduce a new violation → exit 1, reporting only the new one
- fix a baselined violation → exit 0 plus the stale warning
- move a file to a new folder → exit 0, rename reported
- `--no-baseline` reports everything
- cold run and warm (cached) run produce identical filtered output — this is the loud backstop for §6.4
- `baseline update --rule X` on a two-rule fixture preserves the other rule's entries

---

## 12. Implementation order

Each phase is independently reviewable and leaves the repo green.

**Phase 1 — types**
`packages/common/src/models/baseline.ts`, exported from `models/index.ts`. No behaviour.

**Phase 2 — the package**
Scaffold `packages/baseline` (package.json with `workspace:*` on `@ngcompass/common`, tsconfig, tsup config mirroring `reporters`). Implement `serialization/`, `matching/`, `models/`. Full unit suite. Add to `pnpm-workspace.yaml` and the `CLAUDE.md` package table.

**Phase 3 — read path in `analyze`**
Load the baseline in `analyze/steps.ts`, apply it after `runAnalysisStep`, recompute stats, extend `ResultSummary`, render the suppressed count and stale messages. Feature is now usable with a hand-written file.

**Phase 4 — the `baseline` command**
`packages/cli/src/commands/baseline.ts` with `create`/`update`/`prune`/`show`, cold-run enforcement, scope extraction from the execution plan.

**Phase 5 — config and health**
Schema, defaults, normalization, `--baseline` / `--no-baseline` flags, both health checks.

**Phase 6 — docs and release**
`docs/architecture.md` pipeline section, README adoption guide, site docs page, changeset with the `maxWarnings` note.

---

## 13. Open decisions

| Decision | Default taken here | Reversible? |
| --- | --- | --- |
| Own package vs. `packages/cli/src/baseline/` | Own package | Yes — extraction is mechanical either direction |
| `onStale` default | `warn` | Yes — config-only |
| Rename detection strategy | Basename matching | Yes — git detection is additive |

## 15. What changed during implementation

**`applyBaseline` takes a `BaselineScope`, not a file list.** Without the rule dimension, `analyze --rule X` reported every other rule's entries as stale — a false "you fixed 3,000 violations" on every scoped run. The read path and the write path now share one scope type.

**`buildBaselineScope` falls back to files × enabled rules on a full-analysis cache hit.** `buildPrecomputedOutput` returns `tasks: []` and `skippedTasks: []`, so a plan-derived scope would have been empty on warm runs and every baselined violation would have been reported as new. Cold runs keep the precise plan-derived scope, which is what makes `--skip-type-check` safe for writes.

**The missing-baseline health check is a warning, not an error.** As an error it failed config validation, which blocked `ngcompass baseline create` — the command that creates the missing file. The hard failure still happens, but in the analyze read path where `create` never goes. Caught by the integration test, not by review.

**`pruneBaseline` reports removals from `reconcileRenames`, not from a post-merge filter.** Reconciliation already drops entries for unscanned files, so the filter was dead code and orphans vanished from the report.

## 14. Explicitly out of scope

- `CACHE_SCHEMA_VERSION` / `PLAN_CACHE_VERSION` bumps — the baseline never enters a cache key
- Changes to `@ngcompass/engine`, `@ngcompass/rules`, `@ngcompass/planner`, `@ngcompass/ast`
- Fingerprint matching mode
