# Contributing to ngcompass

Thanks for helping improve ngcompass. This is a public open-source project and
a performance-sensitive Angular static analyzer, so contributions should be
respectful, focused, well tested, and careful about package boundaries.

This guide covers the human workflow for opening issues and pull requests. For a
deeper architecture reference, read [docs/architecture.md](docs/architecture.md).

## Contribution Rules

By contributing to this project, you agree to follow these rules:

- Be respectful and constructive in issues, pull requests, and reviews.
- Keep contributions focused on one bug, feature, rule, or documentation topic.
- Open an issue before starting large features, public API changes, cache/schema
  changes, release changes, or architecture changes.
- Do not submit unrelated refactors, formatting-only churn, generated files, or
  dependency changes in the same PR as a feature or bug fix.
- Do not add new runtime dependencies unless the PR explains why a built-in or
  existing dependency cannot solve the problem.
- Add or update tests for behavior changes.
- Run the relevant checks before requesting review.
- Respect the project license. Contributions are accepted under the license in
  [LICENSE](LICENSE).

## Project Scope

ngcompass analyzes Angular projects without running them. It reads TypeScript,
Angular templates, styles, and project configuration, then reports architecture,
performance, SSR, security, reactivity, and code-quality issues.

The main analysis pipeline is:

```text
load config -> discover files -> resolve rules -> build execution plan -> run analysis -> emit reports
```

Please keep changes aligned with that flow. Avoid moving responsibilities between
packages unless the change is intentionally architectural and has been discussed
first.

## Getting Started

Requirements:

- Node.js `^20.19.0` or `>=22.12.0`
- pnpm `>=8.0.0`
- Git

Install dependencies:

```bash
pnpm install
```

Useful commands:

```bash
pnpm build              # build all packages
pnpm build:prod         # production build used before publish
pnpm test               # run all tests
pnpm typecheck          # type-check all packages
pnpm prerelease:check   # smoke test and package validation
pnpm validate:packages  # verify workspace package relationships
```

Run a focused package test:

```bash
pnpm --filter @ngcompass/engine vitest run
pnpm --filter @ngcompass/rules vitest run src/rules/reactivity/rxjs-no-subscribe-in-component.rule.test.ts
```

## Repository Map

| Package              | Responsibility                                                          |
| -------------------- | ----------------------------------------------------------------------- |
| `packages/cli`       | CLI binary, command parsing, orchestration, process exit policy         |
| `packages/config`    | Config discovery, loading, validation, normalization, profiles          |
| `packages/scanner`   | Git/glob file discovery and file-list caching                           |
| `packages/rules`     | Built-in rules, presets, rule registry, rule resolution                 |
| `packages/planner`   | Execution plans, task IDs, incremental task filtering                   |
| `packages/engine`    | Analysis execution, AST stream handling, worker pool, type-aware chunks |
| `packages/ast`       | TypeScript, Angular HTML, and CSS parsing helpers                       |
| `packages/cache`     | Memory and disk cache layers                                            |
| `packages/reporters` | Console, JSON, SARIF, HTML, and UI report rendering                     |
| `packages/common`    | Shared domain types and utilities                                       |
| `packages/site`      | Documentation site only                                                 |

When in doubt, place the change where the responsibility already lives. Prefer
small changes within one package over cross-package refactors.

## Contribution Workflow

1. Open an issue first for large features, public API changes, cache format
   changes, or architecture changes.
2. Keep pull requests focused on one concern.
3. Match existing code style and package patterns before adding new abstractions.
4. Include tests for behavior changes and regression fixes.
5. Run the smallest relevant test command while developing, then run broader
   checks before asking for review.
6. Do not include unrelated formatting, generated files, or opportunistic
   refactors.

Good PR descriptions include:

- What changed
- Why it changed
- Tests run
- Any cache, schema, reporter output, or CLI compatibility impact

For CLI output, diagnostics, reporter changes, or config behavior, include a
short before/after example when it helps reviewers.

## Review and Merge Policy

Pull requests are reviewed by project maintainers and code owners. At least one
approval from a code owner is required before a pull request can be merged.

The current repository code owners are defined in [.github/CODEOWNERS](.github/CODEOWNERS).
Final merge access is controlled by the repository owner and GitHub branch
protection settings.

Maintainers may ask contributors to split large PRs, add tests, update
documentation, or discuss architectural changes in an issue before review
continues.

## Architecture Rules

Dependencies must flow inward:

```text
CLI -> config/scanner/planner/engine/reporters -> rules/cache/ast -> common
```

Important boundaries:

- `common` must not import from any other ngcompass package.
- `engine` must not import concrete built-in rules.
- `rules` must not import from `planner` or `cli`.
- Reporters transform analysis results; they should not own analysis behavior.
- Only CLI command-layer code should call `process.exit`.
- Cross-package imports must use package names, such as `@ngcompass/common`.
- Do not import another package through `src/` or `dist/`.

If you add a sibling workspace package import, add the matching
`workspace:*` dependency to the importing package.

## Coding Standards

ngcompass uses strict TypeScript, ESM, and Node16 module resolution.

Follow these rules:

- Do not use `any`.
- Prefer `unknown` with a type guard when a value needs runtime narrowing.
- Avoid `as` casts except `as const` or narrowing from `unknown` after a runtime
  check.
- Prefer `interface` for object shapes and `type` for unions or utilities.
- Mark fields and arrays `readonly` when they are not mutated.
- Exported functions must have explicit return types.
- ESM imports in source files must include `.js` extensions.
- Use typed `Result<T>` objects for expected domain failures.
- Throw only for programmer errors, broken invariants, or unrecoverable startup
  failures.
- Do not swallow errors silently.
- Avoid `try`/`catch` around code that cannot throw.

Keep functions small and purposeful. If a function is becoming hard to scan, split
it by responsibility rather than hiding logic behind a vague helper.

## Performance Expectations

The engine and rules run across large Angular codebases, so hot-path changes need
extra care.

In rule handlers, planner loops, and AST traversal callbacks:

- Avoid unnecessary allocations.
- Avoid `Object.keys`, `Object.values`, and `Object.entries` in hot loops.
- Hoist regexes and constants to module scope.
- Prefer `Map` for keyed string lookups.
- Use classical `for` loops in hot paths.
- Do not call `JSON.parse` or `JSON.stringify`.
- Make bounded caches evict.

If a performance choice is non-obvious, leave a short comment explaining why.

## Adding or Changing Rules

To add a built-in rule:

1. Create `packages/rules/src/rules/<domain>/<rule-name>.rule.ts`.
2. Use the narrowest matching factory from `@ngcompass/engine`, such as
   `createComponentRule`, `createTemplateExpressionRule`, or
   `createCallExpressionRule`.
3. Declare `RuleMetadata` with the correct `dependencyType`: `syntax`,
   `type-aware`, or `project-context`.
4. Register the rule in `packages/rules/src/registry/register-all.ts`.
5. Add the rule to the appropriate preset in `packages/rules/src/presets/`.
6. Add tests that cover enabled behavior and important non-matches.

Rules receive pre-filtered nodes in their visitor callbacks. They should be
stateless, allocation-minimal, and O(1) per visited node whenever possible.

## Cache and Compatibility

Cache keys and serialized formats are part of ngcompass behavior.

Bump the relevant cache or plan schema version when changing:

- `RuleResult` shape
- Planner task shape
- Task ID inputs
- Serialized cache payloads
- Full-analysis cache semantics

Document the compatibility impact in the PR description.

## Testing

Prefer tests that exercise public behavior over implementation details.

Guidelines:

- Use real `RuleContext` instances for rule tests.
- Do not mock types owned by this repo unless there is no practical alternative.
- Integration tests should use real I/O for scanner, cache, planner, and engine
  behavior.
- Isolate temp directories with unique paths under `os.tmpdir()`.
- Keep one behavior per `it()` block.
- Do not lower coverage thresholds.

Before opening a PR, run the focused tests for your change and at least:

```bash
pnpm typecheck
pnpm test
```

For release-sensitive changes, also run:

```bash
pnpm prerelease:check
```

## Documentation

New source files must include a concise `@fileoverview` JSDoc block.

Add JSDoc for exported symbols, including parameters, return values, and examples
for non-obvious APIs. Also document internal helpers when they encode cache
behavior, parser behavior, file discovery, import resolution, worker
orchestration, or other analyzer mechanics.

Inline comments should explain why something is done, not restate what the code
already says. Do not add TODO comments without a linked issue.

## Release and Versioning Notes

The root package is private and is never published. Version bumps for published
packages should be coordinated across the workspace. Do not manually publish from
a feature branch.

Use Changesets only when a contributor-facing package change needs to be released.
When unsure, ask in the PR.

## License

By contributing, you agree that your contribution is provided under this
project's license: MIT. See [LICENSE](LICENSE).
