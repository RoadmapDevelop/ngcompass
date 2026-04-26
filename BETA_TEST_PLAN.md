# ngcompass Public Beta — Investigation & Test Plan

**Date:** 2026-04-26
**Branch:** `pre_release_v1_beta`
**Version under test:** 0.0.1 (pre-beta)

---

## Part 1 — Repository Investigation

### 1.1 Package inventory

| Package | Responsibility |
|---|---|
| `@ngcompass/ast` | AST types, parsers (OXC, angular-html-parser, lightningcss), analyzers, visitor pattern for component/template/style traversal. |
| `@ngcompass/cache` | Multi-layer cache (memory + disk via `cacache`), atomic writes, hashing, LRU eviction, 24h TTL. |
| `@ngcompass/cli` | CLI surface via `commander.js`. Entry: `packages/cli/src/bin/ngcompass.ts`. |
| `@ngcompass/common` | Shared error types, logger, utility functions, shared interfaces. |
| `@ngcompass/config` | Config loading & resolution, Zod validation, `extends`, profiles, plugin loading via `jiti`, semantic isolation. |
| `@ngcompass/engine` | Rule orchestrator, worker thread pool, type-aware analysis context, batched task execution, incremental analysis. |
| `@ngcompass/planner` | Execution planning, file-type detection, component-graph tracking, git-based change detection, incremental task building. |
| `@ngcompass/reporters` | Output formatters: console (with code frames via `@babel/code-frame`), JSON, HTML, plus cache/config/rules reporters. |
| `@ngcompass/rules` | Rule registry; rule packs: correctness, performance, SSR, security, reactivity, template, modern-api, testing. |
| `@ngcompass/scanner` | Filesystem scanning via `tinyglobby`, `minimatch`, `ignore` (.gitignore aware). |

### 1.2 Public CLI surface

Discovered in `packages/cli/src/commands/` and `packages/cli/src/bin/ngcompass.ts`.

| Command | Flags | Purpose |
|---|---|---|
| `analyze` | `--profile`, `--force`, `--debug`, `--format` (`json`/`text`/`html`/`ui`), `--compact`, `--rule <name>`, `--output <path>` | Main analysis entry point. |
| `init` | `--force`, `--cwd` | Create starter config. |
| `config health` | `--profile` | Validate effective config. |
| `cache clear` | `--profile`, `--type` (`ast`/`config`/`results`/`all`) | Wipe cache. |
| `cache info` | — | Print cache stats. |
| `rules [name]` | `--preset` (`recommended`/`strict`/`performance`/`reactivity`/`all`) | List rules or show rule details. |
| `exit` | — | Internal utility. |

Global: `--debug`, `--version`, `--help`.

### 1.3 Existing test coverage

71 spec files / ~10,080 LOC of tests, distributed roughly:

- **ast**: 9 — parsers, analyzers, visitor, matchers, template extraction.
- **cache**: 10 — drivers (memory/disk/atomic/json-file), hashing, context, runtime cache.
- **cli**: 4 — analyze, cache, config, init commands.
- **common**: 2 — logger, types/utils. **Thin.**
- **config**: 5 — core, extends, plugin loader, semantic isolation, schema.
- **engine**: 10 — orchestrator, executor, handler, runner, worker pool, single-pass, visitor registry, stats.
- **planner**: 6 — component graph, file typing, incremental analysis, hashing, task building, serialization.
- **reporters**: 3 — console, JSON, config. **Thin** (no HTML/SARIF coverage).
- **rules**: 11 — full rule-pack coverage.
- **scanner**: 7 — glob, gitignore, filtering, normalization.

**Gaps:** `common` and `reporters` are the lightest. HTML and SARIF outputs are untested.

### 1.4 Configuration surface

Schema: `packages/config/src/schemas/schema.ts`; defaults: `packages/config/src/schemas/defaults.ts`.

User-facing keys:
- `include` / `exclude` — glob patterns. Default include: `src/**/*.ts`.
- `outputFormat` — `json` | `text` | `sarif` | `html` (default `text`).
- `failOnSeverity` — `warn` | `error` (default `error`).
- `maxWarnings` — threshold (default 10).
- `maxWorkers` — concurrency (default `cpus - 1`).
- `cache` — boolean or `{ enabled, location, strategy: 'memory'|'local', ttl }`. Default location: `node_modules/.cache/ngcompass`.
- `rules` — `Record<ruleName, 'off'|'warn'|'error' | { severity, options }>`.
- `overrides` — file-pattern-scoped rule overrides.
- `parserOptions` — `project`, `sourceType`, `ecmaVersion`.
- `extends` — preset chain.
- `profiles` — partial config overrides keyed by profile name.

Discovery via `lilconfig`: `.ngcompassrc`, `.ngcompassrc.json`, `ngcompass.config.ts`, `ngcompass.config.js`, `package.json#ngcompass`.

### 1.5 External I/O boundaries

- **Filesystem in:** source files (`.ts`, `.html`, `.css`, `.scss`), `.gitignore`, git index, config files, `tsconfig.json`.
- **Filesystem out:** report at `outputPath`, cache at `node_modules/.cache/ngcompass/` (`cacache` format).
- **Process:** Node.js worker threads (`node:worker_threads`); worker entry resolves to `packages/rules/dist/execution-worker.js`.
- **Network:** none detected.

### 1.6 Error handling

Custom errors in `packages/common/src/errors.ts`:

- `AnalyzerError` (base, optional code).
- `ConfigurationError` — `CONFIG_ERROR`.
- `ParseError` — includes `filePath`.
- `RuleError` — includes `ruleId`.
- `RuleExecutionError` — includes `ruleName`, `filePath`, `cause` chain.
- `InfrastructureErrorCollector` — accumulates `ParseError`, `IOError`, `WorkerCrash`, `CacheCorruption`, `SerializationError`, `RuleExecutionError` with phase tag (`config`/`planner`/`engine`) and recoverability flag.

Behavior:
- Parse failures → warnings; analysis continues.
- Rule crashes → wrapped, run continues, exit code reflects.
- Fatal config/planner errors → abort early.
- SIGINT/SIGTERM → cache flush (10s budget) before exit; cursor restored.

### 1.7 CI workflow

`.github/workflows/ci.yml`:
- **Triggers:** push to `main`/`develop`; PRs.
- **Matrix:** Node 18 / 20 / 22 on **`ubuntu-latest` only**.
- **Steps:** checkout → pnpm install (frozen) → `turbo lint typecheck test build` (concurrency 4) → coverage gate on Node 20 only → `pnpm audit --prod` → upload to Codecov on Node 20.

### 1.8 Build & distribution

- Dual ESM + CJS via `tsup` (`packages/cli/tsup.config.ts`, root `tsup.config.ts`).
- SWC transpile, target `node18`, treeshake on, sourcemaps in dev only.
- `skipNodeModulesBundle: true` — deps stay external.
- CLI binary at `packages/cli/dist/cli.js` (with shebang).
- Release pipeline: `pnpm run release` → `build:prod` → `changeset publish`.

### 1.9 Known rough edges

No `TODO` / `FIXME` / `XXX` / `HACK` markers found in non-test source. Codebase has no marked technical debt.

### 1.10 Performance-critical pipeline

`packages/engine/src/orchestrator.ts`:

1. **Plan** — task graph built; cached tasks marked skipped via file/rule hash.
2. **Split** — syntax-only (worker-eligible) vs. type-aware (main thread).
3. **Worker dispatch** — only when syntax tasks > 150; otherwise `p-limit` on main thread.
4. **Type-aware tasks** — always serialize on main thread.
5. **Aggregate** — merge executed + cached results, compute stats.
6. **Global cache write** — full `AnalysisResult` cached if `globalHash` is stable.

Concurrency defaults: workers = `cpus - 1`; parallel threshold = 150 tasks.

Caching: memory LRU + disk `cacache`; per-task and per-run global cache.

---

## Part 2 — Pre-Beta Test Plan

### 2.1 Cross-platform coverage *(highest risk)*

CI today is Linux-only; the developer machine is Windows.

- [ ] Add `windows-latest` and `macos-latest` to the CI matrix.
- [ ] Path handling on Windows (backslashes vs forward slashes) — scanner, cache, config discovery, `outputPath`.
- [ ] Cache directory creation across OSes.
- [ ] Worker thread spawn — confirm `packages/rules/dist/execution-worker.js` resolves after a packed install on every OS.
- [ ] ANSI color rendering: Windows Terminal, `cmd.exe`, PowerShell, CI logs; verify `NO_COLOR` / `FORCE_COLOR` honored.

**Execution matrix**

| OS | Shell | Node | Install mode | Required checks |
|---|---|---|---|---|
| Windows | PowerShell | 20.x | packed tarball + workspace | `--help`, `init`, `analyze`, `cache info`, HTML output path, cache write/read |
| Windows | `cmd.exe` | 20.x | packed tarball | color behavior, exit codes, path quoting with spaces |
| macOS | bash/zsh | 20.x | packed tarball + workspace | shebang execution, cache path creation, HTML output, worker spawn |
| Linux | bash | 18.x / 20.x / 22.x | workspace + packed tarball | baseline parity with CI, worker spawn, cache correctness |

**Minimum smoke script per OS**

- [ ] `ngcompass --version`
- [ ] `ngcompass --help`
- [ ] `ngcompass init` in a fresh temp dir
- [ ] `ngcompass analyze --format json`
- [ ] `ngcompass analyze --format ui --output report.html`
- [ ] `ngcompass cache info`
- [ ] `ngcompass cache path`

**Windows-specific checks**

- [ ] Project path contains spaces, e.g. `C:\Temp\ng beta app\`
- [ ] Config uses relative `outputPath` and `cache.location`
- [ ] Report path uses backslashes and mixed separators
- [ ] `NO_COLOR=1` disables ANSI escapes in console output
- [ ] Ctrl+C restores cursor and exits cleanly

**Pass criteria**

- [ ] No OS-specific stack traces
- [ ] Same command returns the same exit code on all supported OSes
- [ ] Packed CLI can resolve worker entry and write reports on all OSes
- [ ] Generated report and cache artifacts land in the expected directories on all OSes

### 2.2 Distribution / install validation

Local `pnpm test` does not exercise the published shape.

- [ ] `pnpm pack` each package; install tarballs into a fresh project; run `ngcompass --version` and `ngcompass --help`.
- [ ] Install with **npm**, **pnpm**, **yarn classic**, **yarn berry**.
- [ ] Global install (`npm i -g`) and `npx ngcompass`.
- [ ] Resolve correctly from consumer projects with `"type": "module"` and without (ESM + CJS).
- [ ] `dist/` matches `package.json#files` / `exports`; no `src/` leakage.
- [ ] Shebang preserved on `dist/cli.js` after pack.
- [ ] `npm audit --omit=dev` clean of high/critical advisories.

### 2.3 Command-surface functional matrix

- [ ] `analyze` — happy path, plus every flag combination listed in §1.2.
- [ ] `init` — fresh dir; existing-config dir without `--force` must refuse; `--cwd` to a remote directory.
- [ ] `config health` — valid, broken, missing config.
- [ ] `cache clear` per `--type`; verify on-disk state after.
- [ ] `cache info` — empty cache, populated cache, corrupted entry.
- [ ] `rules` (list) and `rules <name>` (detail) for each `--preset`.
- [ ] **Exit codes:** 0 success; non-zero on `failOnSeverity` / `maxWarnings` breach; distinct code for fatal vs. analysis-found-issues.
- [ ] Unknown command / unknown flag → helpful error, no stack trace.

### 2.4 Real Angular project dogfooding

Synthetic fixtures alone are not enough.

- [ ] Run against ≥3 OSS Angular repos (small starter, medium app, monorepo).
- [ ] Run against Angular **v15**, **v17**, **v19** projects; document supported version range explicitly.
- [ ] Cover: standalone components, NgModule components, signals, control flow blocks (`@if`/`@for`/`@switch`), inline + external templates, SCSS / Less / Tailwind.
- [ ] SSR app — verify SSR rule pack actually fires.
- [ ] `ng-packagr` library project.
- [ ] Project with TypeScript path aliases / `paths`.

### 2.5 Configuration robustness

- [ ] Discovery: every supported config filename.
- [ ] `extends` — single, deep chain, circular (must error clearly), missing target.
- [ ] `profiles` — switching, missing profile, contradictory profile.
- [ ] `overrides` — pattern matching and precedence.
- [ ] Plugin loading via `jiti` — TS plugin, JS plugin, plugin from `node_modules`, broken plugin must not crash the run.
- [ ] Invalid Zod input — error names the offending key + value, never a raw stack.
- [ ] `cache.location` non-writable; `outputPath` parent missing.

### 2.6 Caching correctness *(silent-bug risk)*

- [ ] Modify a source file → only affected tasks re-run.
- [ ] Modify a rule's options → cache invalidates for that rule.
- [ ] Modify ngcompass version → full invalidation (version belongs in cache key).
- [ ] Concurrent runs against the same cache dir — no corruption (atomic-write claim).
- [ ] Manually corrupt a cache entry → graceful recovery, no crash.
- [ ] TTL expiry (24h) — entries past TTL recomputed.
- [ ] `--force` truly bypasses cache.
- [ ] Cache hit-rate stats from orchestrator are accurate (cross-check by counting tasks).

### 2.7 Worker pool & concurrency

- [ ] Tiny project (< 150 tasks) — no workers spawn; no orphan processes.
- [ ] Large project (> 150 tasks) — workers spawn and exit cleanly.
- [ ] `maxWorkers: 1` (force serial) — same results, slower.
- [ ] Inject a thrown error in a rule under test → `RuleExecutionError` collected; run continues; exit code reflects.
- [ ] SIGINT (Ctrl+C) — workers terminated, cache flushed inside 10s, cursor restored.
- [ ] SIGTERM behaves identically.
- [ ] TTY-less environments (CI, Docker without tty) — no broken progress UI.

### 2.8 Output formats

- [ ] **JSON** — pin and publish a JSON schema; validate output against it; document forwards-compat policy.
- [ ] **HTML** — open in Chrome / Firefox / Safari; CSS isolated when embedded; 10k-finding report renders without freezing the browser.
- [ ] **SARIF** — validate against the official 2.1.0 schema (consumed by GitHub code scanning).
- [ ] **Console / text** — snapshot test plus visual review; check `--compact` and color-disable env vars.
- [ ] `--output` to: existing path (overwrite policy?), missing parent dir, read-only file.

### 2.9 Error message quality

- [ ] Every user-visible error includes: what failed, which file/rule/config key, what to do next.
- [ ] No raw Zod dumps; no unhandled-rejection traces in normal failure modes.
- [ ] `--debug` adds detail; default mode stays concise.
- [ ] Hand-test: malformed `tsconfig.json`, syntactically broken `.ts`, broken HTML template, unknown rule name in config, duplicate profile names.

### 2.10 Performance & scale

- [ ] Cold-run benchmark on small/medium/large fixtures; commit baseline numbers.
- [ ] Warm-run ≥ 5× faster than cold; otherwise the cache is broken in practice.
- [ ] RSS ceiling on 10k-file run — must not OOM on a 4 GB CI runner.
- [ ] No memory leak across 100 sequential `analyze` invocations in the same process.
- [ ] Sanity-check the 150-task worker threshold; document how users tune it.

### 2.11 Documentation parity

- [ ] README documents every command, flag, and config key — diff `--help` against README.
- [ ] `CHANGELOG.md` exists, starts at chosen beta version.
- [ ] `LICENSE` present (MIT) and matches `package.json`.
- [ ] Each package's `package.json` has `description`, `repository`, `homepage`, `bugs` populated.
- [ ] Public types: `.d.ts` present in `dist/`; exported types match documented surface.
- [ ] Beta-stability note: warn that config shape may change before 1.0.

### 2.12 Telemetry, privacy, security

- [ ] Re-confirm zero outbound network calls (run with `--network=none` in Docker).
- [ ] No developer file paths leaked into shipped artifacts (sourcemaps, embedded errors).
- [ ] `npm publish --dry-run` per package; inspect file list for `tests/`, `.env`, `node_modules`.
- [ ] Worker entry path not user-controlled.

### 2.13 Beta release logistics

- [ ] Publish under the `beta` dist-tag (`npm publish --tag beta`).
- [ ] Pin a feedback channel (GitHub issue template, label `beta-feedback`); link from `--help` and README.
- [ ] Document supported vs. best-effort matrix: OSes, Node versions, Angular versions.

---

## Part 3 — Priority cut

If only three items can ship before the beta tag goes out, do these:

1. **Windows + macOS in CI** — closes the largest blind spot.
2. **End-to-end install of packed tarballs** in a fresh project across npm/pnpm/yarn — catches distribution bugs that internal tests structurally cannot.
3. **Dogfood on three real Angular OSS projects** spanning v15 / v17 / v19 — surfaces real-world parser, rule, and config bugs faster than any synthetic fixture.
