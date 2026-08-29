# Git Diff Analysis (`--changed` / `--since`) — Investigation

Status: investigation only, nothing implemented
Date: 2026-08-14
Concept: `ngcompass analyze --changed` or `--since main` scans only changed files and dependent components, for fast PR checks.

## Verdict

The feature is worth building, but **not as stated**. The concept bundles two halves that have very different value:

| Half | Verdict |
| --- | --- |
| Scan only changed files | Worth building. Real CI win, because CI runs cold — the cache lives in `node_modules/.cache/ngcompass` (`packages/cache/src/runtime/context.ts:73`) and is not restored by default. |
| …and dependent components | **Not worth building today.** No rule in the codebase is cross-file. Expanding to dependents multiplies work and cannot change a single verdict. Evidence in §4. |

There is also one **hard blocker**: narrowing the file list handed to `scan` produces silently wrong results, not just narrower ones. Template rules go quiet. Details in §3.1. The fix is an architectural choice about *where* the narrowing happens, and it is the main decision this investigation exists to make.

---

## 1. What the pipeline does today

```
CLI → resolveConfig → scan files → resolveRules → buildExecutionPlan → runAnalysis → applyBaseline → reporters
```

Three properties matter for this feature:

**The full file list is load-bearing in four places, not one.** It is passed to `scan`, then to `buildExecutionPlan` as `options.files`, then to `runAnalysis` as `options.files`, and finally reaches `buildProjectContext`. Narrowing it at the source narrows all four.

**Task IDs already isolate changed files.** `calculateTaskId` (`packages/planner/src/task-identity/hashing.ts:133`) hashes tool version, rule registry hash, rule name, the `.ts` path and hash, and the template/style/spec hashes. Change one file and only its tasks get new IDs; everything else hits the result cache. **On a warm cache, `analyze` already behaves like `--changed`.** The feature's value is entirely about the cold-cache case, which is exactly CI.

**The file list is in the global hash.** `calculateGlobalHash(files, rules, …)` (`builder.ts:202`) means a narrowed run gets a different `globalHash`, so the full-analysis cache and plan cache cannot cross-contaminate between a full run and a narrowed run. That part is safe by construction.

---

## 2. Three places the narrowing could go

### 2.1 At scan time — narrow `options.files`

Cheapest to write: one filter in `discoverFilesStep` (`packages/cli/src/commands/analyze/steps.ts:79`). **This is the option that breaks correctness.** See §3.1.

### 2.2 At plan time — build the full plan, filter the task list

Full `files` continues to flow to the planner, the component graph, and `buildProjectContext`. Only the *task list* is filtered before execution, by changed-file membership.

Cost retained: file hashing across the whole repo (mitigated by the mtime/size meta cache in `warmupHashCache`, `hashing.ts:13`) and plan construction. Cost eliminated: parsing and rule execution, which is where the time actually goes.

This is the recommended shape. It keeps every correctness invariant intact because nothing downstream can tell it is running narrowed.

### 2.3 Post-analysis — filter results by changed file

The baseline model (`applyBaseline`). Correct, and zero risk, but **zero speed win** — everything still runs. Useful only as a reporting mode (`--report-changed-only`), not as the PR-speed feature.

---

## 3. Findings

### 3.1 Blocker: narrowing at scan time silently disables template rules

`ComponentDependencyGraph.build()` is fed `options.files` (`builder.ts:183`) and resolves a component's template through `dirFileSet`, then falls back to `extractTemplateUrl(comp, dir, fileSet)`. That fallback rejects any path not in the set:

```ts
if (fileSet && !fileSet.has(resolved)) return undefined;
```
`packages/planner/src/resource-discovery/decorator-references.ts:19`

So with a narrowed list containing `user.component.ts` but not `user.component.html`:

1. The component graph still **hits** for the `.ts` file, with `templatePath: undefined`.
2. `getOrDiscoverResources` prefers that graph hit over the filesystem-based `discoverResources` (`packages/planner/src/plan-building/task-builder.ts:167`).
3. The task is built with no template input — so every template rule runs against nothing and reports clean.
4. The task ID differs from the full-run ID (no template hash), so the cache does not catch it either.

The failure mode is a **green PR check that should have been red**. Nothing logs a warning.

### 3.2 Blocker: a changed `.html` file alone produces zero tasks

`shouldApplyRule` (`task-builder.ts:12`) admits `template` and `style` file types for no dependency type — `isTypescriptLike` explicitly excludes them (`task-builder.ts:101`). Templates and stylesheets are never task roots; they are attached as *inputs* to the owning `.ts` task.

A PR that only edits `user.component.html` therefore has an empty task list. Any changed-file set must be mapped back to owning components before it means anything. The forward mapping exists (`ComponentDependencyGraph`, and `templateToComponent` in `ProjectContext`); the reverse walk is straightforward but must be written, and it must cover both the naming convention and the `templateUrl`/`styleUrls` decorator forms.

### 3.3 Hazard: `projectContext` degrades quietly under a narrowed program

`buildProjectContext` populates `projectFiles` from the passed `files` array, but builds the import graph by iterating `program.getSourceFiles()` (`packages/engine/src/context/project-context-builder.ts:131`). Under a narrowed run, the TypeScript program's root files are only the changed files; TS pulls in transitive *imports* but not *importers*, so `reverseImportGraph` comes out badly incomplete while `projectFiles` looks complete.

Today this is latent, not active — see §4 — but it is a trap for the first rule that reads the graph. `resolveTypeAwareContextFiles` (`orchestrator.ts:490`) already passes the full `options.files` when a chunk needs project context, which is precisely why approach 2.2 stays correct and 2.1 does not.

### 3.4 Hazard: result cache poisoning if project context is ever narrowed

`calculateTaskId` does not include the project file set. If a narrowed run ever computes a project-context-dependent verdict, it writes that verdict under a task ID a later full run will hit. The result cache absorbs the narrowing permanently — the same class of mistake the baseline docs call out for cache writes.

Two mitigations, pick one before the first cross-file rule ships:
- Never narrow the project context (approach 2.2). Nothing to fix.
- Or mix a project-scope hash into the task ID for tasks with `needsProjectContext` (`packages/planner/src/models/task.ts:27`).

### 3.5 Hazard: git plumbing currently fails open

`packages/scanner/src/discovery/git.ts` swallows every git failure and resolves to `''` or `[]` (lines 7–18, 30–80). That is correct for discovery, which has a glob fallback. It is **wrong for a diff feature**: a failed `git diff` returning empty means "nothing changed" means "analyze nothing" means **exit 0**. A broken PR check that reports success is worse than no PR check.

`--changed` needs its own git layer that returns `Result<T>` and fails loudly. Specifically missing today:

| Needed | Exists? |
| --- | --- |
| `git rev-parse --is-inside-work-tree` | yes (`isGitRepo`) |
| `git merge-base <base> HEAD` | no |
| `git diff --name-only --diff-filter=ACMR <merge-base>..HEAD` | no |
| `git status --porcelain` for uncommitted work | no |
| Rename detection (`-M`) | no |
| Shallow-clone detection (`git rev-parse --is-shallow-repository`) | no |
| Submodule / worktree edge cases | no |

Shallow clones deserve emphasis: GitHub Actions `actions/checkout` defaults to `fetch-depth: 1`, so `merge-base` against `main` **fails on a default CI setup**. The feature must detect this and emit an actionable message (`set fetch-depth: 0`), not fall back to analyzing nothing.

Deleted files must be excluded (`--diff-filter=ACMR` drops `D`), or the planner will try to hash paths that no longer exist.

### 3.6 Semantics: exit codes change meaning under narrowed scope

`shouldFailAnalysis` (`packages/cli/src/commands/analyze/resolve.ts:39`) fails when `totalWarnings > maxWarnings`, default 10. Under a narrowed run, `maxWarnings` is being compared against a subset count. A repo-wide budget of 50 becomes a per-PR budget of 50 without anyone saying so. This needs an explicit decision and a line in the summary output stating the scope the exit code was computed over.

### 3.7 Composition with baseline: already correct

`buildBaselineScope` (`packages/cli/src/commands/analyze/baseline.ts:28`) derives scope from the plan's tasks, and `applyBaseline` skips any baseline entry outside that scope (`packages/baseline/src/matching/apply.ts:27`). A narrowed run therefore suppresses correctly and does not report false "stale" entries for files it never looked at. **No changes needed in the baseline package.** This is a good sign for approach 2.2 — the scope-derived design already anticipated narrowed runs.

Note the overlap in purpose, though: baseline already answers "fail only on new violations in this PR". `--changed` answers "answer that question faster". They are complementary, but if a team has a baseline, `--changed` is a performance optimization, not a new capability.

---

## 4. The "dependent components" half does not pay for itself

Claim: expanding the changed set to importers cannot change any verdict, because **no rule in this codebase reads cross-file state**.

Evidence:
- 48 rule files exist (`packages/rules/src/rules/**/*.rule.ts`). Grepping for `context.projectContext`, `project.`, `reverseImportGraph`, and `importGraph` inside `packages/rules/src` returns **nothing**.
- Five rules declare `requires: { projectContext: true }` — `signal-prefer-input-signal`, `prefer-on-push`, `template-no-call-expression`, `rxjs-no-subscribe-in-component`, `rxjs-prefer-to-signal-for-template-state`. None of them touch the graph. The flag causes the *engine* to build `crossRef` (`packages/engine/src/context/rule-context-factory.ts:93`), which resolves the component's own template, styles, spec, public members and signal members.
- Every one of those inputs is inside the component's own cluster, and every one of them is already hashed into the task ID. If a dependent's inputs did not change, its result cannot change.

The `importGraph` is built and returned by `buildProjectContext`, but its only consumers are the `circular` and `graph` commands via `buildImportGraphOxc` (`packages/engine/src/index.ts:81`), not the analysis path.

**Implication:** ship the changed-file half alone. It is not a reduced version of the concept — for the current rule set it is a *complete* one, and it is strictly more correct than the dependent-expanding version, which would run extra work to produce identical output.

Revisit if a genuinely cross-file rule lands (unused-export detection, NgModule-declares-unused-component, cross-component input/output contract checks). At that point the machinery is ready: `buildImportGraphOxc` builds an import graph without a TypeScript program, and `collectNeighborhood(graph, focus, depth)` (`packages/engine/src/project-graph/graph-scope.ts:18`) already walks forward and reverse edges to a bounded depth — that is the dependent-expansion algorithm, already written and already used by `circular --focus`.

---

## 5. Decisions needed before any implementation

1. **`--changed` baseline point.** Working tree vs. index vs. `HEAD`. Recommendation: `--changed` = uncommitted work (`git status --porcelain`, tracked + untracked), `--since <ref>` = `merge-base(ref, HEAD)..HEAD` plus uncommitted. Two-dot vs three-dot matters: use merge-base so a stale branch is not blamed for changes on `main`.
2. **Exit-code semantics under narrowed scope** (§3.6). Recommendation: keep `failOnSeverity` as-is; skip the `maxWarnings` budget check entirely when scope is narrowed, and print why.
3. **Empty diff behaviour.** Recommendation: exit 0 with an explicit "no changed files in scope" line — but only after git has *succeeded*. Git failure must be exit 1 with a diagnostic.
4. **Config surface.** Does this get a config key, or stay CLI-only? Recommendation: CLI-only. It is a per-invocation concern, and a config default would silently narrow a developer's local full run.
5. **Interaction with `--force`.** `--force` sets `incremental.forceRerun` (`steps.ts:197`). `--changed --force` should mean "re-run the changed files ignoring cache", which the current flag composition already gives, but it needs a test.

---

## 6. Recommended shape

- Narrow at plan time (§2.2), not scan time. Full `files` continues to reach the planner, component graph, and project context; only the task list is filtered.
- Add a scope-resolution step between `discoverFilesStep` and `buildPlanStep` that returns the changed set **expanded to owning components** (§3.2), so a changed `.html` reaches its `.ts`.
- Put the git diff layer in `@ngcompass/scanner` alongside the existing git plumbing, but with `Result<T>` returns that fail closed — do not extend the existing fail-open helpers (§3.5).
- Report scope in `ResultSummary`. The fields are already there: `scannedFiles` and `discoveredFiles` (`packages/cli/src/commands/analyze/index.ts:202`) will read "18 of 4,312 files" for free; the console reporter needs a line saying the run was scoped and against which ref.
- Do not implement dependent expansion (§4). Leave `collectNeighborhood` where it is.

## 7. What to measure before committing

The whole premise is "PR checks are too slow". That number is not recorded anywhere in this repo. Before building, measure on a real Angular app, cold cache:

- Total `analyze` wall time, split across scan / plan / execute.
- The same with the task list filtered to a realistic PR (5–20 files), to confirm the plan-time hashing floor (§2.2) is small enough that the feature actually delivers.

If the plan-time floor turns out to dominate on a large repo, the fallback is to narrow the file list *and* pay for correctness explicitly: keep the full list only for the component-graph and project-context construction paths. That is a larger change, and it should not be attempted on a guess.
